import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import type { Post } from "../Model/Post/Post.ts";
import { merge } from "../Store/Merge/Merge.ts";
import { project, type ShadowPost } from "../Store/Model/Model.ts";
import { open as openPublic } from "../Store/Public/Public.ts";
import { open as openShadow } from "../Store/Shadow/Shadow.ts";

const roots: string[] = [];

function temporary(): string {
	const path = mkdtempSync(join(tmpdir(), "maintain-store-"));
	roots.push(path);
	return path;
}

after(() => {
	for (const path of roots) rmSync(path, { recursive: true, force: true });
});

function reading(id: string, overrides: Partial<Post> = {}): Post {
	return {
		id,
		url: `https://x.com/someone/status/${id}`,
		author: { handle: "someone", name: "Some One", verified: false },
		text: `post ${id}`,
		postedAt: "2026-10-01T00:00:00.000Z",
		media: [],
		metrics: { replies: 0, reposts: 0, likes: 0, views: 0 },
		...overrides,
	};
}

test("a first reading is new, and firstSeenAt is the moment it was observed", () => {
	const at = "2026-11-01T10:00:00.000Z";
	const { post, isNew, changed } = merge(null, reading("1"), {
		source: "bookmark",
		at,
	});

	assert.equal(isNew, true);
	assert.equal(changed, true);
	assert.equal(post.firstSeenAt, at);
	assert.equal(post.lastScrapedAt, at);
	assert.equal(post.visibility, "shadow");
	assert.deepEqual(post.observations, [{ source: "bookmark", at }]);
	assert.deepEqual(post.lists, []);
});

test("a second source adds an observation, never a second record", () => {
	const first = merge(null, reading("1"), {
		source: "bookmark",
		at: "2026-11-01T10:00:00.000Z",
	}).post;
	const second = merge(first, reading("1"), {
		source: "like",
		at: "2026-11-01T11:00:00.000Z",
	});

	assert.equal(second.isNew, false);
	assert.equal(second.post.id, "1");
	assert.equal(second.post.firstSeenAt, "2026-11-01T10:00:00.000Z");
	assert.equal(second.post.lastScrapedAt, "2026-11-01T11:00:00.000Z");
	assert.deepEqual(
		second.post.observations.map((entry) => entry.source),
		["bookmark", "like"],
	);
});

test("the same source observed twice keeps one observation and stays unchanged", () => {
	const first = merge(null, reading("1"), {
		source: "bookmark",
		at: "2026-11-01T10:00:00.000Z",
	}).post;
	const second = merge(first, reading("1"), {
		source: "bookmark",
		at: "2026-11-01T12:00:00.000Z",
	});

	assert.equal(second.post.observations.length, 1);
	assert.equal(second.changed, false);
	assert.equal(second.post.firstSeenAt, "2026-11-01T10:00:00.000Z");
});

test("hidden is a tombstone: a later scrape cannot resurrect it", () => {
	const first = merge(null, reading("1"), {
		source: "bookmark",
		at: "2026-11-01T10:00:00.000Z",
	}).post;
	const hidden: ShadowPost = { ...first, visibility: "hidden" };
	const again = merge(hidden, reading("1"), {
		source: "bookmark",
		at: "2026-11-02T10:00:00.000Z",
	});

	assert.equal(again.post.visibility, "hidden");
});

test("an empty reading never erases what the archive already had", () => {
	const first = merge(
		null,
		reading("1", {
			text: "a real post",
			media: [{ kind: "image", url: "u" }],
		}),
		{
			source: "bookmark",
			at: "2026-11-01T10:00:00.000Z",
		},
	).post;
	const placeholder = reading("1", {
		text: "",
		media: [],
		author: { handle: "", name: "", verified: false },
	});
	const again = merge(first, placeholder, {
		source: "bookmark",
		at: "2026-11-02T10:00:00.000Z",
	});

	assert.equal(again.post.text, "a real post");
	assert.equal(again.post.media.length, 1);
	assert.equal(again.post.author.handle, "someone");
});

test("the shadow store round-trips a record and indexes it", () => {
	const directory = temporary();
	const store = openShadow(directory);
	const { post } = merge(null, reading("42"), {
		source: "history",
		at: "2026-11-01T10:00:00.000Z",
	});

	store.write(post);
	store.observe({
		at: "2026-11-01T10:00:00.000Z",
		source: "history",
		statusId: "42",
		action: "observed",
	});
	const index = store.reindex();

	assert.equal(store.post("42")?.id, "42");
	assert.deepEqual(store.ids(), ["42"]);
	assert.equal(store.observationCount(), 1);
	assert.equal(store.index()["42"], "Post/42.json");
	assert.match(readFileSync(index, "utf8"), /Post\/42\.json/);
	assert.equal(store.post("nope"), null);
	// A status id is never allowed to become a path.
	assert.equal(store.post("../escape"), null);
});

test("events are found by subject", () => {
	const directory = temporary();
	const store = openShadow(directory);

	store.event("bookmark.added", "42", { source: "bookmark" }, "2026-11-01T10:00:00.000Z");
	store.event("scrape.finished", "bookmark", { new: 1 }, "2026-11-01T10:00:01.000Z");

	const about = store.events("42");
	assert.equal(about.length, 1);
	assert.equal(about[0]!.record.kind, "bookmark.added");
	assert.equal(store.events().length, 2);
});

test("the public projection drops the archive fields and keeps the post", () => {
	const { post } = merge(null, reading("42"), {
		source: "bookmark",
		at: "2026-11-01T10:00:00.000Z",
	});
	const published = project(post, "2026-11-02T10:00:00.000Z");

	assert.equal(published.id, "42");
	assert.equal(published.source, "x");
	assert.equal(published.scrapedAt, post.lastScrapedAt);
	assert.equal(published.firstSeenAt, post.firstSeenAt);
	assert.equal(published.publishedAt, "2026-11-02T10:00:00.000Z");
	assert.equal("observations" in published, false);
	assert.equal("visibility" in published, false);
});

test("the public store writes and removes one file per post", () => {
	const content = temporary();
	const store = openPublic(content);
	const { post } = merge(null, reading("42"), {
		source: "bookmark",
		at: "2026-11-01T10:00:00.000Z",
	});

	store.writeBookmark(project(post, "2026-11-02T10:00:00.000Z"));
	assert.deepEqual(store.ids(), ["42"]);
	assert.equal(store.bookmark("42")?.url, post.url);
	assert.equal(store.removeBookmark("42"), true);
	assert.equal(store.removeBookmark("42"), false);
	assert.deepEqual(store.ids(), []);
});

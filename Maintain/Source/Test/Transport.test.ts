import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { isFailure } from "../CLI/Parser/Output/Failure.ts";
import { Definition as PostExtract } from "../Command/Post/Extract/Extract.ts";
import { Definition as PostLike } from "../Command/Post/Like/Like.ts";
import { Definition as StoreStatus } from "../Command/Store/Status/Status.ts";
import { Definition as TabList } from "../Command/Tab/List/List.ts";
import { root } from "../Configuration/Load/Load.ts";
import type { Post } from "../Model/Post/Post.ts";
import { merge } from "../Store/Merge/Merge.ts";
import { open as openShadow } from "../Store/Shadow/Shadow.ts";
import { choose, resolve } from "../Transport/Select.ts";
import { view } from "../Transport/View/Transport.ts";

const roots: string[] = [];

function temporary(): string {
	const path = mkdtempSync(join(tmpdir(), "maintain-transport-"));
	roots.push(path);
	return path;
}

after(() => {
	for (const path of roots) rmSync(path, { recursive: true, force: true });
	delete process.env["MAINTAIN_STORAGE"];
});

function reading(id: string): Post {
	return {
		id,
		url: `https://x.com/someone/status/${id}`,
		author: { handle: "someone", name: "Some One", verified: false },
		text: `post ${id}`,
		postedAt: "2026-10-01T00:00:00.000Z",
		media: [{ kind: "image", url: "https://example.test/a.jpg" }],
		metrics: { replies: 1, reposts: 2, likes: 3, views: 4 },
	};
}

/** The object a refusal prints: a `Failure`, or the reason it was not one. */
function refusal(run: () => unknown): Record<string, unknown> {
	try {
		run();
	} catch (error) {
		if (isFailure(error)) return error.toObject();
		throw error;
	}
	throw new Error("expected a failure, and nothing was thrown");
}

/** A shadow store with one record in it, and the record itself. */
function archive(): { directory: string; record: Post } {
	const directory = temporary();
	const { post } = merge(null, reading("42"), {
		source: "bookmark",
		at: "2026-11-01T10:00:00.000Z",
	});
	openShadow(directory).write(post);
	process.env["MAINTAIN_STORAGE"] = directory;
	return { directory, record: reading("42") };
}

test("a mutating command on the view transport prints the refusal and nothing else", () => {
	// The exact object `post like --id <id> --transport view` prints, exit 2.
	assert.deepEqual(
		refusal(() => resolve(PostLike, { transport: "view" })),
		{
			error: "read-only-transport",
			transport: "view",
			command: "post like",
		},
	);
});

test("a browser command is unsupported rather than read-only", () => {
	assert.deepEqual(
		refusal(() => resolve(TabList, { transport: "view" })),
		{
			error: "unsupported-transport",
			transport: "view",
			command: "tab list",
		},
	);
});

test("a read command resolves on both transports, and cdp is the default", () => {
	assert.equal(choose({}), "cdp");
	assert.equal(resolve(PostExtract, {}).name, "cdp");
	assert.equal(resolve(PostExtract, { transport: "view" }).name, "view");
});

test("an unknown transport is a usage failure, not a silent default", () => {
	assert.equal(refusal(() => choose({ transport: "browser" }))["error"], "usage");
});

test("a command that declares no transport needs none", () => {
	// `store status` reads the filesystem only, so `--transport` cannot reach
	// it: nothing here opens a socket, which is why the browser may be shut.
	assert.equal(StoreStatus.transport, undefined);
	assert.equal(resolve(StoreStatus, {}).name, "cdp");
	assert.equal(resolve(StoreStatus, { transport: "view" }).name, "view");
});

test("the view transport answers a shadow record in the post shape, with no archive fields", async () => {
	archive();
	const found = await view().post({ id: "42" });

	// Key order is the order the page reports, so a live reading and an
	// archived one stringify identically apart from their values.
	assert.deepEqual(Object.keys(found), [
		"id",
		"url",
		"author",
		"text",
		"postedAt",
		"media",
		"metrics",
	]);
	assert.equal("observations" in found, false);
	assert.equal("firstSeenAt" in found, false);
	assert.equal("lastScrapedAt" in found, false);
	assert.equal("visibility" in found, false);
	assert.equal("lists" in found, false);
	assert.deepEqual(found, reading("42"));
});

test("a read through the view transport writes nothing", async () => {
	const { directory } = archive();
	const before = readdirSync(join(directory, "Post")).sort();
	const stamp = statSync(join(directory, "Post", "42.json")).mtimeMs;

	await view().post({ id: "42" });

	assert.deepEqual(readdirSync(join(directory, "Post")).sort(), before);
	assert.equal(statSync(join(directory, "Post", "42.json")).mtimeMs, stamp);
});

test("a post the archive never saw is `no-post`, not an empty record", async () => {
	archive();
	await assert.rejects(
		async () => view().post({ id: "7" }),
		(error: unknown) => isFailure(error) && error.code === "no-post",
	);
});

test("the view transport is immutable and refuses every other operation by name", () => {
	const transport = view();

	assert.equal(transport.mutable, false);
	assert.equal(transport.source, "shadow");
	assert.equal(transport.supports("read"), true);
	assert.equal(transport.supports("write"), false);
	assert.equal(transport.supports("browser"), false);

	assert.equal(
		refusal(() => transport.setLike({ id: "1" }, true))["error"],
		"read-only-transport",
	);
	assert.equal(
		refusal(() => transport.setBookmark({ id: "1" }, true))["error"],
		"read-only-transport",
	);
	assert.equal(
		refusal(() => transport.listMember("alpha", "someone"))["error"],
		"read-only-transport",
	);
	assert.equal(refusal(() => transport.tabs())["error"], "unsupported-transport");
	assert.equal(
		refusal(() => transport.scrape("https://x.com/i/bookmarks"))["error"],
		"unsupported-transport",
	);
});

test("the archive addresses a post by id only", async () => {
	archive();
	await assert.rejects(
		async () => view().post({ tab: "ABC", index: 0 }),
		(error: unknown) => isFailure(error) && error.code === "unsupported-transport",
	);
});

test("no command imports a transport implementation", () => {
	// The seam's whole point: `Transport/CDP` and `Transport/View` are what a
	// command must never name. Checked here rather than by a grep in a review,
	// because a grep is a promise and this is a test.
	const directory = join(root(), "Maintain", "Source", "Command");
	const offenders: string[] = [];

	const walk = (path: string): void => {
		for (const entry of readdirSync(path, { withFileTypes: true })) {
			const child = join(path, entry.name);
			if (entry.isDirectory()) {
				walk(child);
				continue;
			}
			const source = readFileSync(child, "utf8");
			if (source.includes("Transport/CDP") || source.includes("Transport/View")) {
				offenders.push(child);
			}
		}
	};
	walk(directory);

	assert.deepEqual(offenders, []);
});

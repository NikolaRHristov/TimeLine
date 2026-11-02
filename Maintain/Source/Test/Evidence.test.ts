import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { Definition } from "../Command/Author/Evidence/Build.ts";
import { Keyword } from "../Configuration/Keyword/Keyword.ts";
import { root } from "../Configuration/Load/Load.ts";
import type { Evidence, EvidencePost } from "../Model/Author/Evidence.ts";
import { EXCERPT_COUNT, EXCERPT_LIMIT, build, domains, keywords } from "../Model/Author/Evidence.ts";
import type { Author } from "../Model/Author/Author.ts";
import type { Post } from "../Model/Post/Post.ts";
import { merge } from "../Store/Merge/Merge.ts";
import { open as openShadow } from "../Store/Shadow/Shadow.ts";

const roots: string[] = [];

function temporary(): string {
	const path = mkdtempSync(join(tmpdir(), "maintain-evidence-"));
	roots.push(path);
	return path;
}

after(() => {
	for (const path of roots) rmSync(path, { recursive: true, force: true });
});

const AT = "2026-11-01T10:00:00.000Z";

const author: Author = { handle: "someone", name: "Some One", verified: false };

function reading(id: string, overrides: Partial<Post> = {}): Post {
	return {
		id,
		url: `https://x.com/someone/status/${id}`,
		author,
		text: `post ${id}`,
		postedAt: "2026-10-01T00:00:00.000Z",
		media: [],
		metrics: { replies: 0, reposts: 0, likes: 0, views: 0 },
		...overrides,
	};
}

function post(id: string, text: string, media: EvidencePost["media"] = []): EvidencePost {
	return { id, text, media };
}

/** Run the command with the store pointed at one directory. */
async function run(directory: string): Promise<{
	authors: Evidence[];
	posts: number;
	skipped: { hidden: number; unbookmarked: number; anonymous: number };
}> {
	const previous = process.env["MAINTAIN_STORAGE"];
	process.env["MAINTAIN_STORAGE"] = directory;
	try {
		return (await Definition.run({})) as {
			authors: Evidence[];
			posts: number;
			skipped: { hidden: number; unbookmarked: number; anonymous: number };
		};
	} finally {
		if (previous === undefined) delete process.env["MAINTAIN_STORAGE"];
		else process.env["MAINTAIN_STORAGE"] = previous;
	}
}

/** One archive with three authors, one of them posting twice. */
function archive(): string {
	const directory = temporary();
	const store = openShadow(directory);
	const people: [string, string][] = [
		["1", "alpha"],
		["2", "alpha"],
		["3", "beta"],
		["4", "alpha"],
	];
	for (const [id, handle] of people) {
		const { post: record } = merge(
			null,
			reading(id, { author: { handle, name: handle.toUpperCase(), verified: handle === "alpha" } }),
			{ source: "bookmark", at: AT },
		);
		store.write(record);
	}
	// A like-only post is not a bookmark, and a hidden post is withheld.
	store.write(merge(null, reading("5", { author: { handle: "gamma", name: "Gamma", verified: false } }), {
		source: "like",
		at: AT,
	}).post);
	store.write({
		...merge(null, reading("6", { author: { handle: "delta", name: "Delta", verified: false } }), {
			source: "bookmark",
			at: AT,
		}).post,
		visibility: "hidden",
	});
	return directory;
}

test("one record per distinct author, and no duplicates", async () => {
	const result = await run(archive());

	assert.deepEqual(
		result.authors.map((record) => record.handle),
		["alpha", "beta"],
	);
	assert.equal(result.posts, 6);
	assert.deepEqual(result.skipped, { hidden: 1, unbookmarked: 1, anonymous: 0 });
	// A record counts its own posts: alpha has three, beta one.
	assert.deepEqual(
		result.authors.map((record) => record.posts),
		[3, 1],
	);
	assert.equal(result.authors[0]?.name, "ALPHA");
	assert.equal(result.authors[0]?.verified, true);
});

test("the record shape is fixed, whatever the data says", async () => {
	const result = await run(archive());
	const record = result.authors[0];

	assert.notEqual(record, undefined);
	assert.deepEqual(Object.keys(record as Evidence), [
		"handle",
		"name",
		"verified",
		"posts",
		"domains",
		"keywords",
		"terms",
		"excerpts",
	]);
	// The counts print in vocabulary order, whatever that vocabulary is.
	assert.deepEqual(Object.keys((record as Evidence).keywords), Object.keys(Keyword));
	// JSON-serialisable as it stands: no dates, no class instances.
	assert.deepEqual(JSON.parse(JSON.stringify(record)), record);
});

test("two runs on one archive print the same bytes", async () => {
	const directory = archive();
	const first = JSON.stringify(await run(directory));
	const second = JSON.stringify(await run(directory));

	assert.equal(first, second);
});

test("an excerpt never exceeds the cap, even when the post does", () => {
	const record = build("alpha", author, [post("1", "a".repeat(5_000))], Keyword);
	const excerpt = record.excerpts[0] ?? "";

	assert.equal(record.excerpts.length, 1);
	assert.ok(excerpt.length <= EXCERPT_LIMIT, `${excerpt.length} > ${EXCERPT_LIMIT}`);
	assert.ok(excerpt.endsWith("…"));
});

test("the cut never splits an emoji", () => {
	// Each emoji is two UTF-16 code units, so the cap lands mid-pair.
	const record = build("alpha", author, [post("1", "😀".repeat(300))], Keyword);
	const excerpt = record.excerpts[0] ?? "";
	const last = excerpt.charCodeAt(excerpt.length - 1);

	assert.ok(excerpt.length <= EXCERPT_LIMIT);
	assert.equal(last >= 0xd800 && last <= 0xdbff, false, "a lone high surrogate was kept");
	assert.equal(last >= 0xdc00 && last <= 0xdfff, false, "a lone low surrogate was kept");
});

test("at most three excerpts, shortest prose first", () => {
	const posts = [
		post("1", "https://example.com"),
		post("2", "the shortest real sentence"),
		post("3", "a longer sentence about shipping a thing today"),
		post("4", "mid length one here"),
	];
	const record = build("alpha", author, posts, Keyword);

	assert.equal(record.excerpts.length, EXCERPT_COUNT);
	// The link-only post is not prose, so it loses its slot to a sentence.
	assert.equal(record.excerpts.includes("https://example.com"), false);
	assert.deepEqual(record.excerpts, [
		"mid length one here",
		"the shortest real sentence",
		"a longer sentence about shipping a thing today",
	]);
});

test("a repost never spends a second slot", () => {
	const record = build("alpha", author, [post("1", "same words"), post("2", "same words")], Keyword);

	assert.deepEqual(record.excerpts, ["same words"]);
});

test("domains are ranked, counted once per post, and shorteners are ignored", () => {
	const posts = [
		post("1", "see https://github.com/a/b and https://github.com/c/d and https://t.co/xyz"),
		post("2", "https://www.github.com/e/f, then https://vercel.com/x", [
			{ kind: "link", url: "https://t.co/abc" },
		]),
		post("3", "https://astro.build/blog/post."),
	];

	assert.deepEqual(domains(posts), [
		{ domain: "github.com", count: 2 },
		{ domain: "astro.build", count: 1 },
		{ domain: "vercel.com", count: 1 },
	]);
});

test("domains are capped at five", () => {
	const posts = ["a.com", "b.com", "c.com", "d.com", "e.com", "f.com"].map((host, index) =>
		post(String(index), `https://${host}/x`),
	);

	assert.equal(domains(posts).length, 5);
});

test("keywords are counted on word boundaries, per bucket", () => {
	// Neutral slugs: buckets are whatever the vocabulary declares, so this
	// proves the counting for any name rather than for one taxonomy.
	const vocabulary = { first: ["ai"], second: ["ui"], third: ["rust", "c++", "c#"] };
	const posts = [
		post("1", "said the html thing"),
		post("2", "an ai post about ui and rust"),
		post("3", "c++ and C# and AI again"),
	];

	assert.deepEqual(keywords(posts, vocabulary), { first: 2, second: 1, third: 3 });
});

test("terms are counted per keyword, and the totals are their sum", () => {
	const vocabulary = { first: ["ai"], second: ["figma"], third: ["rust"] };
	const posts = [post("1", "an ai post about figma and rust"), post("2", "rust again")];
	const record = build("alpha", author, posts, vocabulary);

	// Sparse: a term that never fired is absent, not zero.
	assert.deepEqual(record.terms["first"], { ai: 1 });
	assert.deepEqual(record.terms["second"], { figma: 1 });
	assert.deepEqual(record.terms["third"], { rust: 2 });
	assert.deepEqual(record.keywords, { first: 1, second: 1, third: 2 });
});

test("no inference module is imported and no network call is made", async () => {
	const sources = [
		"Command/Author/Evidence/Build.ts",
		"Model/Author/Evidence.ts",
		"Configuration/Keyword/Keyword.ts",
	];
	for (const relative of sources) {
		const source = readFileSync(join(root(), "Maintain", "Source", relative), "utf8");
		assert.doesNotMatch(
			source,
			/from\s+["'][^"']*(?:infer|classify|openai|anthropic|node:https?|node:net|node:child_process)[^"']*["']/i,
			`${relative} imports an inference or transport module`,
		);
		assert.doesNotMatch(source, /\bfetch\s*\(/, `${relative} calls fetch`);
	}

	// The runtime half: any network call would throw out of this run.
	const original = globalThis.fetch;
	globalThis.fetch = (() => {
		throw new Error("the evidence build made a network call");
	}) as typeof fetch;
	try {
		const result = await run(archive());
		assert.equal(result.authors.length, 2);
	} finally {
		globalThis.fetch = original;
	}
});

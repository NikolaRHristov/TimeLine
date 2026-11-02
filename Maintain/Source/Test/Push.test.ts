import assert from "node:assert/strict";
import { test } from "node:test";
import { argumentsOf, plan } from "../Command/Store/Push/Push.ts";
import type { ObservationEntry, ShadowPost } from "../Store/Model/Model.ts";

/**
 * The reducer's argument list is positional and untyped on the wire, so a wrong
 * shape is not a type error - it is a 400 at run time. These cases pin the two
 * places the import could silently disagree with the archive: how many calls a
 * post costs, and how an optional field is encoded.
 */

const AT = "2026-02-01T00:00:00.000Z";

function record(overrides: Partial<ShadowPost> = {}): ShadowPost {
	return {
		id: "1",
		url: "https://x.com/someone/status/1",
		author: { handle: "someone", name: "Some One", verified: true },
		text: "post",
		postedAt: "2026-01-01T00:00:00.000Z",
		media: [],
		metrics: { replies: 1, reposts: 2, likes: 3, views: 4 },
		observations: [{ source: "bookmark", at: AT }],
		firstSeenAt: AT,
		lastScrapedAt: "2026-03-01T00:00:00.000Z",
		visibility: "shadow",
		lists: [],
		...overrides,
	};
}

function entry(statusId: string, source: ObservationEntry["source"], at = AT): ObservationEntry {
	return { at, source, statusId, action: "observed" };
}

test("one call per observation line, because each line is a row", () => {
	const { observed, posts, skipped } = plan(
		[record()],
		[entry("1", "bookmark"), entry("1", "like", "2026-02-02T00:00:00.000Z")],
		null,
		null,
	);

	assert.equal(skipped, 0);
	assert.equal(posts, 1);
	assert.equal(observed.length, 2);
	assert.deepEqual(
		observed.map((each) => each.entry.source),
		["bookmark", "like"],
	);
});

test("--source writes the post once, under that channel", () => {
	const lines = [entry("1", "bookmark"), entry("1", "like", "2026-02-02T00:00:00.000Z")];

	const all = plan([record()], lines, null, null);
	const filtered = plan([record()], lines, "like", null);

	assert.equal(all.observed.length, 2);
	assert.equal(filtered.observed.length, 1);
	assert.equal(filtered.observed[0]?.entry.source, "like");
});

test("--source selects the posts that channel showed, and nothing else", () => {
	const { observed } = plan(
		[record({ id: "1" }), record({ id: "2" })],
		[entry("1", "bookmark"), entry("2", "like", "2026-02-02T00:00:00.000Z")],
		"like",
		null,
	);

	assert.deepEqual(
		observed.map((each) => each.post.id),
		["2"],
	);
});

test("a post no channel showed is skipped rather than invented", () => {
	const { observed, skipped } = plan(
		[record({ id: "1" }), record({ id: "2" })],
		[entry("1", "bookmark")],
		null,
		null,
	);

	assert.deepEqual(
		observed.map((each) => each.post.id),
		["1"],
	);
	assert.equal(skipped, 1);
});

test("--limit truncates the calls without changing what was skipped", () => {
	const { observed, posts, skipped } = plan(
		[record({ id: "1" }), record({ id: "2" }), record({ id: "3" })],
		[entry("1", "bookmark"), entry("2", "bookmark"), entry("3", "bookmark")],
		null,
		2,
	);

	assert.equal(observed.length, 2);
	assert.equal(posts, 2);
	assert.equal(skipped, 0);
});

test("postedAt is a tagged option, and metrics are whole numbers", () => {
	const withTimestamp = plan([record()], [entry("1", "bookmark")], null, null).observed[0];
	const withoutTimestamp = plan(
		[record({ postedAt: null, metrics: { replies: -1, reposts: 2.7, likes: 0, views: 9 } })],
		[entry("1", "bookmark")],
		null,
		null,
	).observed[0];

	assert.ok(withTimestamp !== undefined && withoutTimestamp !== undefined);

	const present = argumentsOf(withTimestamp);
	// A bare string is rejected by the reducer; `null` would drop the timestamp.
	assert.deepEqual(present[6], { some: "2026-01-01T00:00:00.000Z" });
	assert.equal(present[15], "bookmark");
	assert.equal(present[16], AT);
	assert.equal(present[17], "observed");

	const absent = argumentsOf(withoutTimestamp);
	assert.equal(absent[6], null);
	// A negative or fractional metric fails the whole u32 call.
	assert.deepEqual(absent.slice(11, 15), [0, 2, 0, 9]);
});

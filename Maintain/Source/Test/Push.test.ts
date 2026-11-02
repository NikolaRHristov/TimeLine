import assert from "node:assert/strict";
import { test } from "node:test";

import {
	argumentsOf,
	plan,
} from "../Command/Store/Push/Push.ts";
import type { ShadowPost } from "../Store/Model/Model.ts";

/**
 * The reducer's argument list is positional and untyped on the wire, so a wrong
 * shape is not a type error - it is a 400 at run time. These cases pin the two
 * places the projection could silently disagree with the archive: which channel
 * a post is pushed as, and how an optional field is encoded.
 */

function record(overrides: Partial<ShadowPost> = {}): ShadowPost {
	return {
		id: "1",
		url: "https://x.com/someone/status/1",
		author: { handle: "someone", name: "Some One", verified: true },
		text: "post",
		postedAt: "2026-01-01T00:00:00.000Z",
		media: [],
		metrics: { replies: 1, reposts: 2, likes: 3, views: 4 },
		observations: [{ source: "bookmark", at: "2026-02-01T00:00:00.000Z" }],
		firstSeenAt: "2026-02-01T00:00:00.000Z",
		lastScrapedAt: "2026-03-01T00:00:00.000Z",
		visibility: "shadow",
		lists: [],
		...overrides,
	};
}

test("a post is pushed as its earliest channel, at its last scrape", () => {
	const { planned, skipped } = plan(
		[
			record({
				observations: [
					{ source: "like", at: "2026-02-02T00:00:00.000Z" },
					{ source: "bookmark", at: "2026-02-01T00:00:00.000Z" },
				],
			}),
		],
		null,
		null,
	);

	assert.equal(skipped, 0);
	assert.equal(planned.length, 1);
	assert.equal(planned[0]?.source, "bookmark");
	// Never the wall clock: a fresh `at` would append an observation per run.
	assert.equal(planned[0]?.at, "2026-03-01T00:00:00.000Z");
});

test("--source selects the posts that channel showed, and names that channel", () => {
	const both = record({
		observations: [
			{ source: "bookmark", at: "2026-02-01T00:00:00.000Z" },
			{ source: "like", at: "2026-02-02T00:00:00.000Z" },
		],
	});
	const bookmarkOnly = record({ id: "2" });

	const { planned } = plan([both, bookmarkOnly], "like", null);

	assert.deepEqual(
		planned.map((entry) => entry.post.id),
		["1"],
	);
	assert.equal(planned[0]?.source, "like");
});

test("a record the projection cannot represent is skipped, a filtered one is not", () => {
	const { planned, skipped } = plan(
		[
			record({ id: "1" }),
			record({ id: "2", url: "" }),
			record({
				id: "3",
				observations: [{ source: "like", at: "2026-02-01T00:00:00.000Z" }],
			}),
		],
		"bookmark",
		null,
	);

	assert.deepEqual(
		planned.map((entry) => entry.post.id),
		["1"],
	);
	assert.equal(skipped, 1);
});

test("--limit truncates the plan without changing what was skipped", () => {
	const { planned, skipped } = plan(
		[record({ id: "1" }), record({ id: "2" }), record({ id: "3" })],
		null,
		2,
	);

	assert.equal(planned.length, 2);
	assert.equal(skipped, 0);
});

test("postedAt is a tagged option, and metrics are whole numbers", () => {
	const [withTimestamp] = plan([record()], null, null).planned;
	const [withoutTimestamp] = plan(
		[record({ postedAt: null, metrics: { replies: -1, reposts: 2.7, likes: 0, views: 9 } })],
		null,
		null,
	).planned;

	assert.ok(withTimestamp !== undefined && withoutTimestamp !== undefined);

	const present = argumentsOf(withTimestamp);
	// A bare string is rejected by the reducer; `null` would drop the timestamp.
	assert.deepEqual(present[6], { some: "2026-01-01T00:00:00.000Z" });
	assert.equal(present[7], "bookmark");
	assert.equal(present[8], "2026-03-01T00:00:00.000Z");

	const absent = argumentsOf(withoutTimestamp);
	assert.equal(absent[6], null);
	// A negative or fractional metric fails the whole u32 call.
	assert.deepEqual(absent.slice(9), [0, 2, 0, 9]);
});

// What `recordTrace` has to prove, restated from
// `Agentic/Crate/SpacetimeCatalog/Test/Rules.rs` onto this module's four-column
// `generation` table and its own time columns.
//
// The harness is the one SpacetimeDB ships for module tests: an in-memory
// datastore, a controllable clock, and the module's real reducers called the way
// the host calls them. Nothing here touches a server.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Timestamp } from "spacetimedb";
import type { InferSchema } from "spacetimedb/server";
import { createModuleTestHarness, TestAuth } from "spacetimedb/server/test-utils";
import * as Catalog from "../src/index";

/** The harness, typed to this module's own schema. */
type Harness = ReturnType<typeof createModuleTestHarness<InferSchema<typeof Catalog.default>>>;

/** What `recordTrace` accepts, as the host passes it. */
type TraceArguments = Parameters<typeof Catalog.recordTrace>[1];

/** One act, as a caller states it. */
const Claimed: TraceArguments = {
	generation: "1",
	kind: "lease.claimed",
	subject: "browser:first",
	payload: '{"fence":1}',
	at: "2026-01-01T00:00:00.000Z",
};

/**
 * A harness holding the given generation rows.
 *
 * `bind` is a separate card and does not exist yet, so the rows are seeded
 * through a reducer transaction - the same access a `bind` reducer would use.
 */
function Setup(generations: readonly string[] = ["1"]): Harness {
	const harness = createModuleTestHarness(Catalog.default, Catalog);

	harness.withReducerTx(TestAuth.internal(), (ctx) => {
		for (const id of generations) {
			ctx.db.generation.insert({
				id,
				boundAt: "2026-01-01T00:00:00.000000Z",
				manifestDigest: `digest:${id}`,
				policyChanged: true,
			});
		}
	});

	return harness;
}

/** Every trace row, as the datastore holds it. */
function Traces(harness: Harness) {
	return [...harness.db.trace.iter()];
}

/** Call the reducer the way the host would: inside a transaction, with a ctx. */
function Call(harness: Harness, args: TraceArguments): void {
	harness.withReducerTx(TestAuth.internal(), (ctx) => Catalog.recordTrace(ctx, args));
}

test("a replay at the same instant appends exactly one row", () => {
	const harness = Setup();

	Call(harness, Claimed);
	Call(harness, Claimed);

	assert.equal(Traces(harness).length, 1);
});

test("a replay does not rewrite the row it found, even after the clock moves", () => {
	const harness = Setup();

	Call(harness, Claimed);
	const [first] = Traces(harness);

	harness.clock.set(new Timestamp(1_767_225_600_000_000n));
	Call(harness, Claimed);

	assert.deepEqual(Traces(harness), [first]);
});

test("distinct acts append distinct rows", () => {
	const harness = Setup();

	Call(harness, Claimed);
	Call(harness, { ...Claimed, subject: "browser:second" });
	Call(harness, { ...Claimed, at: "2026-01-01T00:00:01.000Z" });
	Call(harness, { ...Claimed, kind: "lease.released" });

	assert.equal(Traces(harness).length, 4);
});

test("a different payload under the same key is refused and writes nothing", () => {
	const harness = Setup();

	Call(harness, Claimed);
	const [first] = Traces(harness);

	assert.throws(
		() => Call(harness, { ...Claimed, payload: '{"fence":2}' }),
		/admission-refused: trace .* already records a different payload/,
	);

	assert.deepEqual(Traces(harness), [first]);
});

test("a write under a superseded generation is refused by the shared helper", () => {
	const harness = Setup(["1", "2"]);

	assert.throws(
		() => Call(harness, Claimed),
		/admission-refused: generation 1 is not the latest bound one/,
	);

	assert.equal(Traces(harness).length, 0);
});

test("the latest bound generation is accepted", () => {
	const harness = Setup(["1", "2"]);

	Call(harness, { ...Claimed, generation: "2" });

	assert.equal(Traces(harness).length, 1);
	assert.equal(Traces(harness)[0].generation, "2");
});

test("a generation that was never bound is refused", () => {
	const harness = Harness(["1"]);

	assert.throws(
		() => Call(harness, { ...Claimed, generation: "9" }),
		/admission-refused: generation 9 is not the latest bound one/,
	);

	assert.equal(Traces(harness).length, 0);
});

test("a generation key that is not a canonical sequence is refused", () => {
	// `01` parses to 1 but does not round-trip, so the density assumption fails
	// closed instead of reading it as generation 1.
	const harness = Harness(["01"]);

	assert.throws(() => Call(harness, { ...Claimed, generation: "01" }), /admission-refused/);

	assert.equal(Traces(harness).length, 0);
});

test("the module stamps ingestedAt from its own clock and leaves at to the writer", () => {
	const harness = Setup();
	const instant = new Timestamp(1_767_225_600_123_456n);
	harness.clock.set(instant);

	Call(harness, Claimed);
	const [row] = Traces(harness);

	// `at` is the writer's T_event, untouched.
	assert.equal(row.at, Claimed.at);
	// `ingestedAt` is T_ingest: the harness clock, at microsecond precision.
	assert.equal(row.ingestedAt, instant.toISOString());
	assert.match(row.ingestedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
	assert.notEqual(row.ingestedAt, row.at);
});

test("a trace row carries every column an event row carries, with the same types", () => {
	const harness = Setup();

	harness.withReducerTx(TestAuth.internal(), (ctx) =>
		Catalog.record(ctx, {
			kind: "archive.scraped",
			subject: "post:1",
			payload: '{"replies":0}',
			at: "2026-01-01T00:00:00.000Z",
		}),
	);
	Call(harness, Claimed);

	const [event] = [...harness.db.event.iter()];
	const [trace] = Traces(harness);

	for (const column of Object.keys(event)) {
		assert.ok(column in trace, `trace is missing the event column ${column}`);
		assert.equal(
			typeof trace[column],
			typeof event[column],
			`trace.${column} is not the type event.${column} is`,
		);
	}

	// The one column a reader joins both logs on is the opaque payload, and it is
	// text in both.
	assert.equal(typeof trace.payload, "string");
	assert.equal(typeof event.payload, "string");
});

test("a trace without a kind or a subject is refused", () => {
	const harness = Setup();

	assert.throws(() => Call(harness, { ...Claimed, kind: "" }), /admission-refused/);
	assert.throws(() => Call(harness, { ...Claimed, subject: "" }), /admission-refused/);

	assert.equal(Traces(harness).length, 0);
});

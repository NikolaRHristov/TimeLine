// What `recordTrace` has to prove, restated from
// `Agentic/Crate/SpacetimeCatalog/Test/Rules.rs` onto this module's four-column
// `generation` table and its own time columns.
//
// The harness is the one SpacetimeDB ships for module tests: an in-memory
// datastore, a controllable clock, and the module's real reducers called the way
// the host calls them. Nothing here touches a server.

// The module's tsconfig carries no node types: this file is run by node with its
// own loader (`Test/Support/Register.mjs`), not bundled into the module. The
// directives are deliberate, and tsc reports them as unused once the types are
// installed, which is when they should go.
// @ts-expect-error - `node:assert/strict` has no declarations in this program
import assert from "node:assert/strict";
// @ts-expect-error - `node:test` has no declarations in this program
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

/** The same act with no generation named, which is the latest by construction. */
const { generation: _Generation, ...Unnamed } = Claimed;

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

test("a replay that restates a later instant is still one row, keeping the first stamp", () => {
	const harness = Setup();

	Call(harness, Claimed);
	Call(harness, { ...Claimed, at: "2026-01-01T00:00:01.000Z" });

	const [row] = Traces(harness);
	assert.equal(Traces(harness).length, 1);
	// `at` is outside the key and the reducer never rewrites a row, so the
	// first write's claim is the one the log keeps.
	assert.equal(row.at, Claimed.at);
});

test("distinct content appends distinct rows", () => {
	const harness = Setup();

	Call(harness, Claimed);
	Call(harness, { ...Claimed, subject: "browser:second" });
	Call(harness, { ...Claimed, kind: "lease.released" });
	Call(harness, { ...Claimed, payload: '{"fence":2}' });

	assert.equal(Traces(harness).length, 4);
});

test("the id is a digest of the content, not of the instant", () => {
	const harness = Setup();

	Call(harness, Claimed);
	Call(harness, { ...Claimed, at: "2026-01-01T00:00:01.000Z" });

	const [first] = Traces(harness);
	assert.match(first.id, /^trace:[0-9a-f]{16}$/);

	Call(harness, { ...Claimed, payload: '{"fence":2}' });

	const [, second] = Traces(harness);
	assert.notEqual(second.id, first.id);
});

test("a different payload under the same act appends a second row", () => {
	const harness = Setup();

	Call(harness, Claimed);
	Call(harness, { ...Claimed, payload: '{"fence":2}' });

	const rows = Traces(harness);
	assert.equal(rows.length, 2);
	assert.deepEqual(
		rows.map((row) => row.payload),
		['{"fence":1}', '{"fence":2}'],
	);
});

test("a write under a superseded generation is refused by the shared helper", () => {
	const harness = Setup(["1", "2"]);

	assert.throws(
		() => Call(harness, Claimed),
		/stale-generation: the write names generation 1, the latest bound generation is 2/,
	);

	assert.equal(Traces(harness).length, 0);
});

test("the latest bound generation is accepted, and is the generation the row carries", () => {
	const harness = Setup(["1", "2"]);

	Call(harness, { ...Claimed, generation: "2" });

	assert.equal(Traces(harness).length, 1);
	assert.equal(Traces(harness)[0].generation, "2");
});

test("a caller that names no generation is written under the latest bound one", () => {
	const harness = Setup(["1", "2"]);

	Call(harness, Unnamed);

	assert.equal(Traces(harness).length, 1);
	assert.equal(Traces(harness)[0].generation, "2");
});

test("a generation that was never bound is refused", () => {
	const harness = Setup(["1"]);

	assert.throws(() => Call(harness, { ...Claimed, generation: "9" }), /stale-generation/);

	assert.equal(Traces(harness).length, 0);
});

test("a generation id that is not a decimal sequence is skipped, not treated as latest", () => {
	// `latestGeneration` skips a row it cannot read rather than throwing, so one
	// unreadable row cannot wedge every write in the module - and it cannot be
	// the latest either, so a write naming it is refused.
	const harness = Setup(["1", "gen-2"]);

	Call(harness, Claimed);
	assert.equal(Traces(harness)[0].generation, "1");

	assert.throws(() => Call(harness, { ...Claimed, generation: "gen-2" }), /stale-generation/);

	assert.equal(Traces(harness).length, 1);
});

test("nothing bound: a trace is refused rather than stamped with no generation", () => {
	const harness = Setup([]);

	assert.throws(() => Call(harness, Unnamed), /unbound-generation/);
	assert.throws(() => Call(harness, Claimed), /unbound-generation/);

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

	// Both rows are read by column name, which is the point of the test, so the
	// two are widened rather than indexed through their declared shapes.
	const eventColumns = event as Record<string, unknown>;
	const traceColumns = trace as Record<string, unknown>;

	for (const column of Object.keys(eventColumns)) {
		assert.ok(column in traceColumns, `trace is missing the event column ${column}`);
		assert.equal(
			typeof traceColumns[column],
			typeof eventColumns[column],
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

// What the coherence helper has to prove on its own, before any reducer is
// involved: the latest bound generation is answered with, a name that is not it
// is refused with both ids in the message, and the check reads rather than
// writes.
//
// The reducer-level consequences are already stated elsewhere - `claim` and
// `renew` in `Lease.test.ts`, `recordTrace` in `RecordTrace.test.ts`. This file
// is the helper's own contract, which is why it calls the helper directly: a
// check that can only be exercised through a reducer is a check whose edge cases
// are whatever that reducer happens to reach.
//
// The harness is the one SpacetimeDB ships for module tests: an in-memory
// datastore, a controllable clock, and a reducer context. Nothing here touches a
// server.

// The module's tsconfig carries no node types: this file is run by node with its
// own loader (`Test/Support/Register.mjs`), not bundled into the module. The
// directives are deliberate, and tsc reports them as unused once the types are
// installed, which is when they should go.
// @ts-expect-error - `node:assert/strict` has no declarations in this program
import assert from "node:assert/strict";
// @ts-expect-error - `node:test` has no declarations in this program
import { test } from "node:test";
import type { InferSchema } from "spacetimedb/server";
import { createModuleTestHarness, TestAuth } from "spacetimedb/server/test-utils";
// The helper under test. Importing it is half the assertion: it is exported from
// a module of its own precisely so that a test can reach it, because the entry
// file's named exports are reserved for values registered with SpacetimeDB.
import { latestGeneration, requireCoherentGeneration } from "../src/Catalog";
import * as Catalog from "../src/index";

/** The harness, typed to this module's own schema. */
type Harness = ReturnType<typeof createModuleTestHarness<InferSchema<typeof Catalog.default>>>;

/** The one sender every call in this file is made as. */
const Caller = TestAuth.internal();

/**
 * A harness holding the given generation rows.
 *
 * `bind` is a separate card and does not exist yet, so the rows are seeded
 * through a reducer transaction - the same access a `bind` reducer would use.
 */
function Setup(generations: readonly string[] = ["1"]): Harness {
	const harness = createModuleTestHarness(Catalog.default, Catalog);

	harness.withReducerTx(Caller, (ctx) => {
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

/**
 * Run the helper the way a reducer would: inside a transaction, with a ctx.
 *
 * The harness hands back whatever the body returns, so the helper's answer is
 * observable without the module exporting a view over it.
 */
function Check(harness: Harness, generation?: string | null): string | null {
	return harness.withReducerTx(Caller, (ctx) => requireCoherentGeneration(ctx, generation));
}

/** The latest generation the module would report, read through the same harness. */
function Latest(harness: Harness): string | null {
	return harness.withReducerTx(Caller, (ctx) => latestGeneration(ctx));
}

/**
 * Every committed row of every table the helper could conceivably touch, as one
 * stable text.
 *
 * `JSON.stringify` cannot carry a `bigint`, so `lease.fence` is mapped through
 * `String(...)`; rows are ordered by id so two snapshots of the same content
 * compare equal whatever order the datastore iterates in. Read outside a
 * transaction, because the harness's backend traps a read taken inside one.
 */
function Snapshot(harness: Harness): string {
	const byId = (left: { id: string }, right: { id: string }) => left.id.localeCompare(right.id);

	return JSON.stringify({
		generation: [...harness.db.generation.iter()].sort(byId),
		lease: [...harness.db.lease.iter()]
			.map((row) => ({ ...row, fence: String(row.fence) }))
			.sort(byId),
		trace: [...harness.db.trace.iter()].sort(byId),
		event: [...harness.db.event.iter()].sort(byId),
	});
}

// Every message assertion below is unanchored on purpose: `assert.throws` with a
// RegExp matches `String(error)`, which begins with the error's class name -
// `SenderError: stale-generation: ...` - so a `^stale-generation` pattern would
// never match. Everything after that prefix is asserted in full.

test("the latest bound generation is accepted, and is the answer", () => {
	const harness = Setup(["1", "2"]);

	assert.equal(Check(harness, "2"), "2");
});

test("a superseded generation is refused, naming both ids", () => {
	const harness = Setup(["1", "2"]);

	assert.throws(
		() => Check(harness, "1"),
		/stale-generation: the write names generation 1, the latest bound generation is 2/,
	);
});

test("a generation that was never bound is refused as stale, not accepted", () => {
	const harness = Setup(["1"]);

	assert.throws(
		() => Check(harness, "9"),
		/stale-generation: the write names generation 9, the latest bound generation is 1/,
	);
});

test("nothing bound: a named generation is refused as unbound, not as stale", () => {
	const harness = Setup([]);

	assert.throws(
		() => Check(harness, "1"),
		/unbound-generation: nothing has been bound, so 1 cannot be the latest generation/,
	);
});

test("the check writes nothing, whether it accepts or refuses", () => {
	const harness = Setup(["1", "2"]);

	const before = Snapshot(harness);

	assert.equal(Check(harness, "2"), "2");
	assert.throws(() => Check(harness, "1"), /stale-generation/);

	assert.equal(Snapshot(harness), before);
});

test("a gap in the ids leaves one latest, not two", () => {
	// The ids are dense by construction, so this is the corruption case. The
	// helper answers with the highest number present rather than asking whether a
	// successor exists: with rows `1` and `3` and no `2`, the successor question
	// would call both of them latest.
	const harness = Setup(["1", "3"]);

	assert.equal(Latest(harness), "3");
	assert.equal(Check(harness, "3"), "3");
	assert.throws(
		() => Check(harness, "1"),
		/stale-generation: the write names generation 1, the latest bound generation is 3/,
	);
});

test("a row whose id is not a decimal sequence is skipped, never treated as latest", () => {
	const harness = Setup(["1", "gen-2"]);

	assert.equal(Latest(harness), "1");
	assert.equal(Check(harness, "1"), "1");
	assert.throws(
		() => Check(harness, "gen-2"),
		/stale-generation: the write names generation gen-2, the latest bound generation is 1/,
	);
});

test("naming no generation is under the latest by construction, and is not refused", () => {
	const harness = Setup(["1", "2"]);

	// The reducer is one transaction, so there is no window in which a write that
	// names nothing could be applied under a superseded generation. Only an
	// assertion can be stale, and this is not one.
	assert.equal(Check(harness), "2");
	assert.equal(Check(harness, undefined), "2");
	assert.equal(Check(harness, null), "2");
});

test("nothing bound: naming no generation answers null rather than throwing", () => {
	const harness = Setup([]);

	assert.equal(Check(harness), null);
});

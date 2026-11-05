// What the belief recompute has to prove, restated from
// `Maintain/Spacetime/Probe-Contract.md` onto this module's `belief` table: the
// row is derived from the caller's own receipts, it is rebuilt in place rather
// than appended to, two runs on unchanged receipts leave identical bytes, a
// failure partway through leaves the previous belief intact, and no private
// value reaches the row.
//
// The fixtures write `probe` rows directly instead of calling `reveal`: a
// receipt for another identity, a receipt at an older property version and a
// receipt whose value disagrees with the truth table are all states `reveal`
// cannot produce for one caller, and each one is the point of a test below.

// The module's tsconfig carries no node types: this file is run by node with its
// own loader (`Test/Support/Register.mjs`), not bundled into the module. The
// directives are deliberate, and tsc reports them as unused once the types are
// installed, which is when they should go.
// @ts-expect-error - `node:assert/strict` has no declarations in this program
import assert from "node:assert/strict";
// @ts-expect-error - `node:fs` has no declarations in this program
import { mkdirSync, writeFileSync } from "node:fs";
// @ts-expect-error - `node:test` has no declarations in this program
import { test } from "node:test";
import { Timestamp } from "spacetimedb";
import type { InferSchema } from "spacetimedb/server";
import { createModuleTestHarness, TestAuth } from "spacetimedb/server/test-utils";
import * as Catalog from "../src/index";

/** The harness, typed to this module's own schema. */
type Harness = ReturnType<typeof createModuleTestHarness<InferSchema<typeof Catalog.default>>>;

/** What `recomputeBelief` accepts, as the host passes it. */
type RecomputeArguments = Parameters<typeof Catalog.recomputeBelief>[1];

const SECOND = 1_000_000n;
const MINUTE = 60n * SECOND;

/** The instant every fixture starts from. */
const BASE = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z")).microsSinceUnixEpoch;

/** The one sender every call in this file is made as. */
const Caller = TestAuth.internal();

/** A second identity, written straight into `probe` where a fixture needs one. */
const OTHER = "f".repeat(64);

const CAPABILITY = "latency@1";
const PROPERTY = "latency";
const RESOURCE = "catalog:latency";

/** The private truth, deliberately different from every receipt's disclosure. */
const PRIVATE_VALUE = "120ms";
const EVIDENCE = "canary-evidence-never-disclosed";

/** The stamp `offsetMicros` after the fixture instant, in the format the module writes. */
function Stamp(offsetMicros: bigint): string {
	return new Timestamp(BASE + offsetMicros).toISOString();
}

/** A harness whose clock sits at the fixture instant. */
function Setup(): Harness {
	const harness = createModuleTestHarness(Catalog.default, Catalog);
	harness.clock.set(new Timestamp(BASE));
	return harness;
}

/**
 * The hex identity every call in this file is made as.
 *
 * Read from a reducer context rather than from the harness's own field, so this
 * is the same answer the module would compute for `ctx.sender`.
 */
function CallerHex(harness: Harness): string {
	return harness.withReducerTx(Caller, (ctx) => ctx.sender.toHexString());
}

/** A disclosure as `reveal` writes it. */
function Disclosure(name: string, version: number, value: string): string {
	return JSON.stringify({ name, version, value });
}

/** Declare the capability, with the private truth under it. */
function Declare(harness: Harness, capability: string = CAPABILITY): void {
	// `<name>@<version>`, split on the one `@` the id format carries.
	const [name, version] = capability.split("@");

	harness.withReducerTx(Caller, (ctx) => {
		ctx.db.capability.insert({
			id: capability,
			name,
			version,
			stateClass: "stateless",
			contractDigest: `digest:${capability}`,
			declaredAt: Stamp(0n),
		});
		ctx.db.property.insert({
			id: `${capability}:${PROPERTY}`,
			capability,
			name: PROPERTY,
			version: 1,
			resource: RESOURCE,
			value: PRIVATE_VALUE,
			evidence: EVIDENCE,
			updatedAt: Stamp(0n),
		});
	});
}

/**
 * Write one receipt, as a completed reveal would have left it.
 *
 * The value defaults to a disclosure of the property it names, and a test that
 * cares about the copy changes it: a belief that recomputed the truth instead of
 * copying the receipt would then disagree with the fixture on purpose.
 *
 * `generation` is the one a fixture module binds before it discloses. Belief is
 * derived from receipts and never reads it; the column is here because a receipt
 * cannot be written without one.
 */
function Receipt(
	harness: Harness,
	options: {
		capability?: string;
		property?: string;
		propertyVersion?: number;
		audience?: string;
		value?: string;
		at?: string;
		generation?: string;
	} = {},
): void {
	const capability = options.capability ?? CAPABILITY;
	const property = options.property ?? PROPERTY;
	const propertyVersion = options.propertyVersion ?? 1;
	const audience = options.audience ?? CallerHex(harness);
	const value = options.value ?? Disclosure(property, propertyVersion, PRIVATE_VALUE);

	harness.withReducerTx(Caller, (ctx) => {
		ctx.db.probe.insert({
			id: `${capability}:${property}:${propertyVersion}:${audience}`,
			capability,
			property,
			propertyVersion,
			audience,
			value,
			at: options.at ?? Stamp(0n),
			ingestedAt: Stamp(0n),
			generation: options.generation ?? "1",
		});
	});
}

/** One recompute, as the host would call it. */
function Recompute(harness: Harness, args: Partial<RecomputeArguments> = {}): void {
	harness.withReducerTx(Caller, (ctx) =>
		Catalog.recomputeBelief(ctx, { capability: CAPABILITY, ...args }),
	);
}

/**
 * Every committed `belief` row.
 *
 * Never read inside an open transaction - the harness's backend traps that - so
 * every caller here runs after the transaction it inspects has settled.
 */
function Beliefs(harness: Harness) {
	return [...harness.db.belief.iter()];
}

/**
 * Every committed `belief` row, as one stable text.
 *
 * The column order is written out rather than taken from the row object, and
 * the rows are ordered by `id`, so two dumps of the same state compare byte for
 * byte. A diff between them is empty only when nothing moved - not merely when
 * the same rows came back in another order.
 */
function Dump(harness: Harness): string {
	const rows = Beliefs(harness)
		.map((row): [string, string, string, string, number, string] => [
			row.id,
			row.audience,
			row.capability,
			row.value,
			row.confidence,
			row.at,
		])
		.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));

	return JSON.stringify(rows);
}

/** The context a reducer body is handed, as this module's own reducer declares it. */
type ReducerContext = Parameters<typeof Catalog.recomputeBelief>[0];

/** Where a faulted recompute fails, and what it managed to attempt before it did. */
type Fault = {
	/** `after-write` throws once the insert has landed; `before-write` throws in its place. */
	point: "after-write" | "before-write";
	seen: { deletes: number; inserts: number };
};

/**
 * The context handed to a recompute that has to fail partway through.
 *
 * The harness freezes its `DbView`, and V8's proxy invariants refuse a `get`
 * trap that answers a frozen data property with anything but its actual value
 * (`'get' on proxy: property 'belief' is a read-only and non-configurable data
 * property ... but the proxy did not return its actual value`). So each faulted
 * layer is an object whose prototype is the real one, with only the accessor the
 * fault lives on shadowed as an own property: `sender`, `timestamp`,
 * `capability` and `probe` are still the real context's, the module runs
 * unmodified, and there is no instrumentation to revert.
 */
function Faulted(ctx: ReducerContext, fault: Fault): ReducerContext {
	const belief = ctx.db.belief;

	const id = Object.create(belief.id, {
		delete: {
			value: (key: string) => {
				fault.seen.deletes += 1;
				return belief.id.delete(key);
			},
		},
	});

	const table = Object.create(belief, {
		id: { value: id },
		insert: {
			value: (row: Parameters<typeof belief.insert>[0]) => {
				if (fault.point === "before-write") throw new Error(`boom-${fault.point}`);
				belief.insert(row);
				fault.seen.inserts += 1;
				throw new Error(`boom-${fault.point}`);
			},
		},
	});

	const db = Object.create(ctx.db, { belief: { value: table } });

	return Object.create(ctx, { db: { value: db } });
}

/** Every archive row, as one stable text. */
function Archive(harness: Harness): string {
	return JSON.stringify({
		post: [...harness.db.post.iter()],
		author: [...harness.db.author.iter()],
		media: [...harness.db.media.iter()],
		observation: [...harness.db.observation.iter()],
		event: [...harness.db.event.iter()],
		membership: [...harness.db.membership.iter()],
	});
}

test("one receipt yields one belief, keyed by scope, at n/(n+1) confidence", () => {
	const harness = Setup();
	Declare(harness);
	Receipt(harness);

	Recompute(harness);

	const rows = Beliefs(harness);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].id, `${CallerHex(harness)}:${CAPABILITY}`);
	assert.equal(rows[0].audience, CallerHex(harness));
	assert.equal(rows[0].capability, CAPABILITY);
	assert.equal(rows[0].value, Disclosure(PROPERTY, 1, PRIVATE_VALUE));
	assert.equal(rows[0].confidence, 0.5);
	assert.equal(rows[0].at, Stamp(0n));
});

test("two runs on unchanged receipts leave identical bytes, stamp included", () => {
	const harness = Setup();
	Declare(harness);
	Receipt(harness);

	Recompute(harness);
	const first = Beliefs(harness);

	// A later instant: a re-stamp would show up here.
	harness.clock.set(new Timestamp(BASE + MINUTE));
	Recompute(harness);

	assert.deepEqual(Beliefs(harness), first);
	assert.equal(Beliefs(harness)[0].at, Stamp(0n));
});

test("a changed derivation is rebuilt in place, not appended to", () => {
	const harness = Setup();
	Declare(harness);
	Receipt(harness);
	Recompute(harness);

	// A second reveal at a newer property version: the receipt set changed, so
	// the belief has to.
	harness.clock.set(new Timestamp(BASE + MINUTE));
	Receipt(harness, { propertyVersion: 2, value: Disclosure(PROPERTY, 2, "80ms") });
	Recompute(harness);

	const rows = Beliefs(harness);
	assert.equal(rows.length, 1, "the previous belief was not replaced");
	assert.equal(rows[0].value, Disclosure(PROPERTY, 2, "80ms"));
	assert.equal(rows[0].confidence, Math.fround(2 / 3));
	assert.equal(rows[0].at, Stamp(MINUTE), "a rebuilt row carries the rebuild's stamp");
});

test("the highest property version wins, whatever order the receipts arrive in", () => {
	const older = Setup();
	Declare(older);
	Receipt(older, { property: "zeta", propertyVersion: 1 });
	Receipt(older, {
		property: "alpha",
		propertyVersion: 2,
		value: Disclosure("alpha", 2, "80ms"),
	});
	Recompute(older);

	const newer = Setup();
	Declare(newer);
	Receipt(newer, {
		property: "alpha",
		propertyVersion: 2,
		value: Disclosure("alpha", 2, "80ms"),
	});
	Receipt(newer, { property: "zeta", propertyVersion: 1 });
	Recompute(newer);

	assert.equal(Beliefs(older)[0].value, Disclosure("alpha", 2, "80ms"));
	assert.equal(Beliefs(older)[0].value, Beliefs(newer)[0].value);
});

test("a tie on version is broken by property name, not by insertion order", () => {
	const ascending = Setup();
	Declare(ascending);
	Receipt(ascending, { property: "alpha" });
	Receipt(ascending, { property: "beta" });
	Recompute(ascending);

	const descending = Setup();
	Declare(descending);
	Receipt(descending, { property: "beta" });
	Receipt(descending, { property: "alpha" });
	Recompute(descending);

	// `alpha` precedes `beta` by code unit, so both harnesses choose it.
	assert.equal(Beliefs(ascending)[0].value, Disclosure("alpha", 1, PRIVATE_VALUE));
	assert.equal(Beliefs(ascending)[0].value, Beliefs(descending)[0].value);
});

test("a belief copies the receipt, never the private truth", () => {
	const harness = Setup();
	Declare(harness);
	// The disclosure a reveal would have written, deliberately not the truth.
	Receipt(harness, { value: Disclosure(PROPERTY, 1, "250ms") });

	Recompute(harness);

	const [row] = Beliefs(harness);
	assert.equal(row.value, Disclosure(PROPERTY, 1, "250ms"));
	assert.ok(!row.value.includes(PRIVATE_VALUE), "the belief recomputed the truth");
	assert.ok(!JSON.stringify(Beliefs(harness)).includes(EVIDENCE), "raw evidence crossed");
	assert.ok(!JSON.stringify(Beliefs(harness)).includes(RESOURCE), "the private row crossed");
});

test("another audience's receipts never enter the caller's belief", () => {
	const harness = Setup();
	Declare(harness);
	Receipt(harness, { audience: OTHER, value: Disclosure(PROPERTY, 1, "someone else's truth") });

	Recompute(harness);

	assert.deepEqual(Beliefs(harness), []);
});

test("no receipts means no belief, and a stale row is removed", () => {
	const harness = Setup();
	Declare(harness);
	const audience = CallerHex(harness);

	// A row left by an earlier derivation, as a stale cache would be.
	harness.withReducerTx(Caller, (ctx) => {
		ctx.db.belief.insert({
			id: `${audience}:${CAPABILITY}`,
			audience,
			capability: CAPABILITY,
			value: Disclosure(PROPERTY, 1, PRIVATE_VALUE),
			confidence: 0.5,
			at: Stamp(0n),
		});
	});

	Recompute(harness);

	assert.deepEqual(Beliefs(harness), []);
});

test("a failure after the rebuild leaves the previous belief intact", () => {
	const harness = Setup();
	Declare(harness);
	Receipt(harness);
	Recompute(harness);
	const before = Beliefs(harness);
	const audience = CallerHex(harness);

	// The rebuild and the throw are one transaction: the delete cannot commit
	// without the insert, and neither commits at all.
	harness.clock.set(new Timestamp(BASE + MINUTE));
	assert.throws(
		() =>
			harness.withReducerTx(Caller, (ctx) => {
				ctx.db.probe.insert({
					id: `${CAPABILITY}:${PROPERTY}:2:${audience}`,
					capability: CAPABILITY,
					property: PROPERTY,
					propertyVersion: 2,
					audience,
					value: Disclosure(PROPERTY, 2, "80ms"),
					at: Stamp(MINUTE),
					ingestedAt: Stamp(MINUTE),
					generation: "1",
				});
				Catalog.recomputeBelief(ctx, { capability: CAPABILITY });
				throw new Error("boom");
			}),
		/boom/,
	);

	assert.deepEqual(Beliefs(harness), before);
});

/** The capabilities the criterion-5 fixtures spread their receipts across. */
const SCOPES = ["latency@1", "throughput@1", "errors@1"];

/**
 * Three scopes whose receipts differ in count, property name and version, so a
 * dump covers every column and every ordering key `compareReceipts` reads.
 */
function Seed(harness: Harness): void {
	for (const capability of SCOPES) Declare(harness, capability);

	// Two receipts, the newer version winning.
	Receipt(harness, { capability: "latency@1" });
	Receipt(harness, {
		capability: "latency@1",
		propertyVersion: 2,
		value: Disclosure(PROPERTY, 2, "80ms"),
	});

	// Three receipts over two property names, written out of name order.
	Receipt(harness, { capability: "throughput@1", property: "zeta", propertyVersion: 1 });
	Receipt(harness, {
		capability: "throughput@1",
		property: "alpha",
		propertyVersion: 3,
		value: Disclosure("alpha", 3, "900rps"),
	});
	Receipt(harness, { capability: "throughput@1", property: "beta", propertyVersion: 1 });

	// One receipt, a third of the confidence of the scope above it.
	Receipt(harness, { capability: "errors@1", value: Disclosure(PROPERTY, 1, "0.2%") });
}

/** The test context member the criterion-5 tests print their dumps through. */
type Diagnostics = { diagnostic: (message: string) => void };

/**
 * One dump, as evidence: always a diagnostic, and a file when the runner asks.
 *
 * `BELIEF_DUMP_DIR` exists because a reporter re-escapes diagnostic text, and a
 * diff of re-escaped copies is not a diff of the bytes the assertion compared.
 * With the variable set, the two dumps land as files and `diff -u` runs on
 * exactly the text `assert.equal` saw. Unset, nothing is written.
 */
function Record(name: string, dump: string, t: Diagnostics): void {
	t.diagnostic(`${name} ${dump}`);

	// @ts-expect-error - `process` has no declarations in this program
	const directory = process.env.BELIEF_DUMP_DIR;
	if (directory === undefined) return;

	mkdirSync(directory, { recursive: true });
	writeFileSync(`${directory}/${name}.json`, dump);
}

test("criterion 5a: two back-to-back passes over three scopes leave a byte-identical dump", (t: Diagnostics) => {
	const harness = Setup();
	Seed(harness);

	for (const capability of SCOPES) Recompute(harness, { capability });
	const first = Dump(harness);

	// A later instant: a re-stamp or an appended row shows up in the diff.
	harness.clock.set(new Timestamp(BASE + MINUTE));
	for (const capability of SCOPES) Recompute(harness, { capability });
	const second = Dump(harness);

	Record("criterion-5a-dump-1", first, t);
	Record("criterion-5a-dump-2", second, t);

	assert.equal(second, first, "the second pass changed a belief row");
	assert.equal(Beliefs(harness).length, SCOPES.length, "the second pass duplicated rows");

	for (const row of Beliefs(harness)) {
		assert.equal(row.at, Stamp(0n), `a replay re-stamped ${row.id}`);
	}
});

test("criterion 5b: a throw after the first belief write leaves every prior row intact", (t: Diagnostics) => {
	const harness = Setup();
	Seed(harness);
	for (const capability of SCOPES) Recompute(harness, { capability });
	const before = Dump(harness);

	// A newer receipt on one scope, so the recompute has a derivation to write
	// and cannot return early on the unchanged-content check.
	harness.clock.set(new Timestamp(BASE + MINUTE));
	Receipt(harness, {
		capability: "latency@1",
		propertyVersion: 3,
		value: Disclosure(PROPERTY, 3, "40ms"),
	});

	const fault: Fault = { point: "after-write", seen: { deletes: 0, inserts: 0 } };
	assert.throws(
		() =>
			harness.withReducerTx(Caller, (ctx) =>
				Catalog.recomputeBelief(Faulted(ctx, fault), { capability: "latency@1" }),
			),
		/boom-after-write/,
	);

	const after = Dump(harness);
	Record("criterion-5b-before", before, t);
	Record("criterion-5b-after", after, t);

	assert.equal(fault.seen.deletes, 1, "the recompute never reached the delete");
	assert.equal(fault.seen.inserts, 1, "the fault did not land after the write it follows");
	assert.equal(after, before, "the prior belief rows did not survive the failed recompute");
	assert.equal(Beliefs(harness).length, SCOPES.length, "the row count moved");

	// The rollback left the scope usable: the same derivation now lands.
	Recompute(harness, { capability: "latency@1" });
	const rebuilt = Beliefs(harness).find((row) => row.capability === "latency@1");
	assert.equal(rebuilt?.value, Disclosure(PROPERTY, 3, "40ms"));
	assert.equal(rebuilt?.at, Stamp(MINUTE));
});

test("criterion 5c: a throw between the delete and the insert leaves every prior row intact", (t: Diagnostics) => {
	const harness = Setup();
	Seed(harness);
	for (const capability of SCOPES) Recompute(harness, { capability });
	const before = Dump(harness);

	harness.clock.set(new Timestamp(BASE + MINUTE));
	Receipt(harness, {
		capability: "latency@1",
		propertyVersion: 3,
		value: Disclosure(PROPERTY, 3, "40ms"),
	});

	// The window the delete opens: the old row is gone and the new one is never
	// written, so only the transaction can put it back.
	const fault: Fault = { point: "before-write", seen: { deletes: 0, inserts: 0 } };
	assert.throws(
		() =>
			harness.withReducerTx(Caller, (ctx) =>
				Catalog.recomputeBelief(Faulted(ctx, fault), { capability: "latency@1" }),
			),
		/boom-before-write/,
	);

	const after = Dump(harness);
	Record("criterion-5c-before", before, t);
	Record("criterion-5c-after", after, t);

	assert.equal(fault.seen.deletes, 1, "the recompute never reached the delete");
	assert.equal(fault.seen.inserts, 0, "the fault did not land before the insert");
	assert.equal(after, before, "the deleted belief row did not come back with the rollback");
	assert.equal(Beliefs(harness).length, SCOPES.length, "the row count moved");
});

test("a caller-supplied audience cannot set the stored column", () => {
	const harness = Setup();
	Declare(harness);
	Receipt(harness);

	Recompute(harness, { audience: OTHER } as unknown as Partial<RecomputeArguments>);

	const rows = Beliefs(harness);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].audience, CallerHex(harness));
	assert.notEqual(rows[0].audience, OTHER);
});

test("an undeclared capability and an empty id are refused, writing nothing", () => {
	const harness = Setup();
	Declare(harness);
	Receipt(harness);

	assert.throws(() => Recompute(harness, { capability: "" }), /admission-refused/);
	assert.throws(() => Recompute(harness, { capability: "absent@1" }), /admission-refused/);
	assert.deepEqual(Beliefs(harness), []);
});

test("the reducer returns nothing", () => {
	const harness = Setup();
	Declare(harness);
	Receipt(harness);

	const returned = harness.withReducerTx(Caller, (ctx) =>
		Catalog.recomputeBelief(ctx, { capability: CAPABILITY }),
	);
	assert.equal(returned, undefined);
});

test("a recompute touches no archive table and no receipt", () => {
	const harness = Setup();
	Declare(harness);
	Receipt(harness);
	const before = Archive(harness);
	const receipts = JSON.stringify([...harness.db.probe.iter()]);

	Recompute(harness);

	assert.equal(Archive(harness), before);
	assert.equal(JSON.stringify([...harness.db.probe.iter()]), receipts);
	assert.deepEqual([...harness.db.observation.iter()], []);
});

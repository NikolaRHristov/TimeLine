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
				});
				Catalog.recomputeBelief(ctx, { capability: CAPABILITY });
				throw new Error("boom");
			}),
		/boom/,
	);

	assert.deepEqual(Beliefs(harness), before);
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

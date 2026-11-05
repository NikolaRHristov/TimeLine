// What the disclosure path has to prove, restated from
// `Maintain/Spacetime/Probe-Contract.md` onto this module's `probe` table: the
// audience is the authenticated identity, the entitlement is a live lease on the
// resource the property declares, a refusal writes nothing and charges nothing,
// the receipt is the charge, and raw evidence never crosses.
//
// The harness is the one SpacetimeDB ships for module tests: an in-memory
// datastore, a controllable clock, and the module's real reducer called the way
// the host calls it. `withReducerTx` aborts the transaction when the body throws,
// so "refused" and "wrote nothing" are the same assertion here rather than two
// hopes that agree.
//
// The archive's own tables are asserted in `Maintain/Source/Test/Schema.test.ts`;
// this file only checks that a reveal touches none of them.

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

/** What `reveal` accepts, as the host passes it. */
type RevealArguments = Parameters<typeof Catalog.reveal>[1];

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

/** Declare the capability, without any property under it. */
function DeclareCapability(harness: Harness): void {
	harness.withReducerTx(Caller, (ctx) => {
		ctx.db.capability.insert({
			id: CAPABILITY,
			name: "latency",
			version: "1",
			stateClass: "stateless",
			contractDigest: "digest:latency@1",
			declaredAt: Stamp(0n),
		});
	});
}

/** Declare the private truth under the capability. */
function DeclareProperty(harness: Harness, version = 1, resource = RESOURCE): void {
	harness.withReducerTx(Caller, (ctx) => {
		ctx.db.property.insert({
			id: `${CAPABILITY}:${PROPERTY}`,
			capability: CAPABILITY,
			name: PROPERTY,
			version,
			resource,
			value: PRIVATE_VALUE,
			evidence: EVIDENCE,
			updatedAt: Stamp(0n),
		});
	});
}

/** Declare the capability and its property. */
function Declare(harness: Harness, version = 1, resource = RESOURCE): void {
	DeclareCapability(harness);
	DeclareProperty(harness, version, resource);
}

/**
 * Write one lease row.
 *
 * `claim` is not used: it writes a grant for `ctx.sender` only, and the fixtures
 * here need a grant held by someone else and one that has already expired.
 */
function Grant(
	harness: Harness,
	options: { holder?: string; expiresAt?: string; resource?: string; state?: string } = {},
): void {
	const resource = options.resource ?? RESOURCE;
	const holder = options.holder ?? CallerHex(harness);

	harness.withReducerTx(Caller, (ctx) => {
		ctx.db.lease.insert({
			id: `${resource}:1`,
			resource,
			holder,
			fence: 1n,
			acquiredAt: Stamp(0n),
			expiresAt: options.expiresAt ?? Stamp(MINUTE),
			state: options.state ?? "held",
		});
	});
}

/** One reveal, as the host would call it. */
function Reveal(harness: Harness, args: RevealArguments): void {
	harness.withReducerTx(Caller, (ctx) => Catalog.reveal(ctx, args));
}

/** The request every test starts from, with only the field under test changed. */
function Request(overrides: Partial<RevealArguments> = {}): RevealArguments {
	return {
		capability: CAPABILITY,
		property: PROPERTY,
		propertyVersion: 1,
		at: Stamp(0n),
		...overrides,
	};
}

/**
 * Every committed `probe` row.
 *
 * Never read inside an open transaction - the harness's backend traps that - so
 * every caller here runs after the transaction it inspects has settled.
 */
function Receipts(harness: Harness) {
	return [...harness.db.probe.iter()];
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

/** What the caller reads back through the module's own view. */
function MyProbe(harness: Harness) {
	return Catalog.myProbe(harness.viewContext(Caller));
}

test("a sender with no lease at all is refused and writes nothing", () => {
	const harness = Setup();
	Declare(harness);
	const before = Archive(harness);

	assert.throws(() => Reveal(harness, Request()), /admission-refused/);
	assert.deepEqual(Receipts(harness), []);
	assert.equal(Archive(harness), before);
});

test("a lease on a resource the property does not declare does not entitle", () => {
	const harness = Setup();
	Declare(harness);
	Grant(harness, { resource: "catalog:something-else" });

	assert.throws(() => Reveal(harness, Request()), /admission-refused/);
	assert.deepEqual(Receipts(harness), []);
});

test("a lease held by another sender does not entitle", () => {
	const harness = Setup();
	Declare(harness);
	Grant(harness, { holder: OTHER });

	assert.throws(() => Reveal(harness, Request()), /admission-refused/);
	assert.deepEqual(Receipts(harness), []);
});

test("a lease that is not live does not entitle", () => {
	const expired = Setup();
	Declare(expired);
	Grant(expired, { expiresAt: Stamp(-SECOND) });

	assert.throws(() => Reveal(expired, Request()), /admission-refused/);
	assert.deepEqual(Receipts(expired), []);

	const released = Setup();
	Declare(released);
	Grant(released, { state: "released" });

	assert.throws(() => Reveal(released, Request()), /admission-refused/);
	assert.deepEqual(Receipts(released), []);
});

test("an undeclared capability is refused", () => {
	const harness = Setup();

	assert.throws(() => Reveal(harness, Request()), /admission-refused/);
	assert.deepEqual(Receipts(harness), []);
});

test("a capability with no such property is refused", () => {
	const harness = Setup();
	DeclareCapability(harness);
	Grant(harness);

	assert.throws(() => Reveal(harness, Request()), /admission-refused/);
	assert.deepEqual(Receipts(harness), []);
});

test("a malformed request is refused", () => {
	const harness = Setup();
	Declare(harness);
	Grant(harness);

	assert.throws(() => Reveal(harness, Request({ capability: "" })), /admission-refused/);
	assert.throws(() => Reveal(harness, Request({ property: "" })), /admission-refused/);
	assert.throws(() => Reveal(harness, Request({ propertyVersion: 0 })), /admission-refused/);
	assert.deepEqual(Receipts(harness), []);
});

test("a property version the caller does not name is refused, and the one it does is not", () => {
	const harness = Setup();
	Declare(harness, 2);
	Grant(harness);

	assert.throws(() => Reveal(harness, Request({ propertyVersion: 1 })), /admission-refused/);
	assert.deepEqual(Receipts(harness), []);

	Reveal(harness, Request({ propertyVersion: 2 }));
	const receipts = Receipts(harness);
	assert.equal(receipts.length, 1);
	assert.equal(receipts[0].propertyVersion, 2);
});

test("an entitled sender writes exactly one receipt, scoped to its own identity", () => {
	const harness = Setup();
	Declare(harness);
	Grant(harness);

	Reveal(harness, Request());

	const receipts = Receipts(harness);
	assert.equal(receipts.length, 1);
	assert.equal(receipts[0].audience, CallerHex(harness));
	assert.equal(receipts[0].capability, CAPABILITY);
	assert.equal(receipts[0].property, PROPERTY);
	assert.equal(receipts[0].propertyVersion, 1);
	assert.equal(receipts[0].at, Stamp(0n));
	assert.equal(receipts[0].ingestedAt, Stamp(0n));
});

test("a receipt carries the disclosure and none of the private row", () => {
	const harness = Setup();
	Declare(harness);
	Grant(harness);

	Reveal(harness, Request());

	const [receipt] = Receipts(harness);
	assert.equal(
		receipt.value,
		JSON.stringify({ name: PROPERTY, version: 1, value: PRIVATE_VALUE }),
	);

	// The eight declared columns, and no column holding the row the value came
	// from: no `evidence`, no `resource`, no source id.
	assert.deepEqual(Object.keys(receipt).sort(), [
		"at",
		"audience",
		"capability",
		"id",
		"ingestedAt",
		"property",
		"propertyVersion",
		"value",
	]);

	const stored = JSON.stringify(receiptsText(harness));
	assert.ok(!stored.includes(EVIDENCE), "raw evidence crossed into probe");
	assert.ok(!stored.includes(RESOURCE), "the private row's resource crossed into probe");
});

/** Every receipt and every view row, as one text, for the canary check. */
function receiptsText(harness: Harness): string {
	return JSON.stringify({ receipts: Receipts(harness), view: MyProbe(harness) });
}

test("a replay is refused as budget-exhausted and charges nothing", () => {
	const harness = Setup();
	Declare(harness);
	Grant(harness);
	Reveal(harness, Request());

	assert.throws(() => Reveal(harness, Request({ at: Stamp(MINUTE) })), /budget-exhausted/);

	const receipts = Receipts(harness);
	assert.equal(receipts.length, 1);
	// The first receipt stands, its `at` included: a replay appends nothing.
	assert.equal(receipts[0].at, Stamp(0n));
});

test("a caller-supplied audience cannot set the stored column", () => {
	const harness = Setup();
	Declare(harness);
	Grant(harness);

	const spoofed = { ...Request(), audience: OTHER } as unknown as RevealArguments;
	harness.withReducerTx(Caller, (ctx) => Catalog.reveal(ctx, spoofed));

	const receipts = Receipts(harness);
	assert.equal(receipts.length, 1);
	assert.equal(receipts[0].audience, CallerHex(harness));
	assert.notEqual(receipts[0].audience, OTHER);
});

test("a failure after the write leaves no receipt", () => {
	const harness = Setup();
	Declare(harness);
	Grant(harness);

	assert.throws(
		() =>
			harness.withReducerTx(Caller, (ctx) => {
				Catalog.reveal(ctx, Request());
				throw new Error("boom");
			}),
		/boom/,
	);

	// The insert is the charge, so a rolled-back call is an unpaid one: there is
	// no state in which a receipt exists and its price was not paid.
	assert.deepEqual(Receipts(harness), []);
});

test("the reducer returns nothing", () => {
	const harness = Setup();
	Declare(harness);
	Grant(harness);

	const returned = harness.withReducerTx(Caller, (ctx) => Catalog.reveal(ctx, Request()));
	assert.equal(returned, undefined);
});

test("the view returns the caller's own receipts and no one else's", () => {
	const harness = Setup();
	Declare(harness);
	Grant(harness);
	Reveal(harness, Request());

	// A receipt for another identity, written the way a second caller's reveal
	// would have written it.
	harness.withReducerTx(Caller, (ctx) => {
		ctx.db.probe.insert({
			id: `${CAPABILITY}:${PROPERTY}:1:${OTHER}`,
			capability: CAPABILITY,
			property: PROPERTY,
			propertyVersion: 1,
			audience: OTHER,
			value: JSON.stringify({ name: PROPERTY, version: 1, value: "someone else's truth" }),
			at: Stamp(0n),
			ingestedAt: Stamp(0n),
		});
	});

	const rows = MyProbe(harness);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].audience, CallerHex(harness));
	assert.equal(
		rows[0].value,
		JSON.stringify({ name: PROPERTY, version: 1, value: PRIVATE_VALUE }),
	);
});

test("a reveal touches no archive table", () => {
	const harness = Setup();
	Declare(harness);
	Grant(harness);
	const before = Archive(harness);

	Reveal(harness, Request());

	assert.equal(Archive(harness), before);
	assert.deepEqual([...harness.db.observation.iter()], []);
});

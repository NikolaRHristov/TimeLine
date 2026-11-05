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

// ------------------------------------- criteria 1 and 2: one write, or none

/**
 * Every table's row count, as one object.
 *
 * The receipt is the only write a reveal is allowed to make, so "wrote nothing"
 * and "charged nothing" are one assertion here: the counts before a refused or
 * aborted call and after it must be equal. There is no meter table to inspect
 * because the receipt is the charge (`Maintain/Spacetime/Probe-Contract.md`,
 * "The charge"), so a probe row that did not commit is a charge that was not
 * taken.
 */
function Counts(harness: Harness): Record<string, number> {
	const tables = harness.db as unknown as Record<string, { iter(): Iterable<unknown> }>;
	const counts: Record<string, number> = {};

	for (const name of Object.keys(tables).sort()) {
		counts[name] = [...tables[name].iter()].length;
	}

	return counts;
}

/**
 * A reducer context whose `probe.insert` throws and whose every other member is
 * the harness's own.
 *
 * `reveal`'s only write is its final statement, so an insert that cannot commit
 * is a failure in the window that matters for the charge: after the private
 * value was read, before anything reached the datastore. Nothing in
 * `src/index.ts` knows this seam exists - the context belongs to the host, and a
 * host whose insert throws is a host whose transaction aborts - so the failure
 * is injected without instrumenting the module and without leaving anything to
 * revert.
 *
 * `onInsert` receives the row the reducer tried to write, which is how the
 * caller proves the failure came after the private value was read rather than
 * before it.
 */
function UncommittableContext(
	ctx: Parameters<typeof Catalog.reveal>[0],
	onInsert: (row: Record<string, unknown>) => void = () => {},
) {
	const db = ctx.db as unknown as Record<string, Record<string, unknown>>;

	return {
		...ctx,
		db: {
			...db,
			probe: {
				...db.probe,
				insert: (row: Record<string, unknown>) => {
					onInsert(row);
					throw new Error("injected: the receipt could not be written");
				},
			},
		},
	} as unknown as Parameters<typeof Catalog.reveal>[0];
}

test("an entitled sender writes exactly one probe row, scoped to its server-resolved audience", () => {
	const harness = Setup();
	Declare(harness);
	Grant(harness);

	const before = Counts(harness);
	Reveal(harness, Request());
	const after = Counts(harness);

	// Exactly one row, in the one table a reveal may write, and nothing else
	// moved - no belief row, no second receipt.
	assert.equal(after.probe, before.probe + 1);
	assert.equal(after.probe, 1);

	for (const table of Object.keys(before)) {
		if (table === "probe") continue;
		assert.equal(after[table], before[table], `a reveal wrote ${table}`);
	}

	const [receipt] = Receipts(harness);

	// The scope column is the identity the host authenticated, read back through
	// a reducer context rather than from the harness's own field, so this is the
	// same answer the module computed for `ctx.sender`.
	//
	// The role that admitted the call (`prober`) is deliberately not a column: a
	// permission is not a recipient, and a role-keyed receipt would collapse
	// every sender sharing that role onto one row.
	assert.equal(receipt.audience, CallerHex(harness));
	assert.match(receipt.audience, /^[0-9a-f]{64}$/);
	assert.equal(receipt.id, `${CAPABILITY}:${PROPERTY}:1:${CallerHex(harness)}`);
});

test("a failure after the private read and before the insert leaves no receipt and no charge", () => {
	const harness = Setup();
	Declare(harness);
	Grant(harness);
	const before = Counts(harness);
	const attempted: Record<string, unknown>[] = [];

	assert.throws(
		() =>
			harness.withReducerTx(Caller, (ctx) => {
				Catalog.reveal(
					UncommittableContext(ctx, (row) => attempted.push(row)),
					Request(),
				);
			}),
		/injected: the receipt could not be written/,
	);

	// The insert was reached with the disclosure in hand, so the failure is
	// provably after the private value was read and before it was committed.
	assert.equal(attempted.length, 1);
	assert.equal(
		attempted[0].value,
		JSON.stringify({ name: PROPERTY, version: 1, value: PRIVATE_VALUE }),
	);
	assert.ok(
		!JSON.stringify(attempted[0]).includes(EVIDENCE),
		"the attempted receipt carried raw evidence",
	);

	// The window is empty: no receipt committed, so nothing was charged, and no
	// other table moved either.
	assert.deepEqual(Receipts(harness), []);
	assert.deepEqual([...harness.db.belief.iter()], []);
	assert.deepEqual(Counts(harness), before);

	// And the aborted attempt spent no allowance: the same reveal now succeeds
	// and writes the one row it always would have.
	Reveal(harness, Request());

	const receipts = Receipts(harness);
	assert.equal(receipts.length, 1);
	assert.equal(receipts[0].audience, CallerHex(harness));
});

test("an unentitled sender is refused, writes no probe row and deducts no charge", () => {
	const harness = Setup();
	Declare(harness);
	const before = Counts(harness);

	// No lease held by this sender on the property's resource, so the resolved
	// role is `none` and the refusal is decided before the private value is read.
	let refusal = "";

	try {
		Reveal(harness, Request());
	} catch (error) {
		refusal = (error as Error).message;
	}

	assert.match(
		refusal,
		new RegExp(`admission-refused: ${CallerHex(harness)} holds no live lease on ${RESOURCE}`),
	);

	// The refusal names the audience and the resource and never the truth it was
	// refused: two worlds differing only in the private value read the same.
	assert.ok(!refusal.includes(PRIVATE_VALUE), "the refusal leaked the private value");
	assert.ok(!refusal.includes(EVIDENCE), "the refusal leaked the evidence");

	assert.deepEqual(Receipts(harness), []);
	assert.deepEqual([...harness.db.belief.iter()], []);
	assert.deepEqual(Counts(harness), before);

	// Nothing was deducted: once granted, this sender spends its first and only
	// reveal here, which is only possible because the refusal cost it nothing.
	Grant(harness);
	Reveal(harness, Request());

	const receipts = Receipts(harness);
	assert.equal(receipts.length, 1);
	assert.equal(receipts[0].audience, CallerHex(harness));
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

// ------------------------------------------------------- the generation guard

/**
 * Seed the bound generations a test runs against.
 *
 * Written through a reducer transaction rather than through `bind`, because
 * `bind` derives its own id from its predecessor and requires every capability
 * in the manifest to be declared: these fixtures need a named history, not a
 * valid manifest, and `Coherence.test.ts` seeds the same way.
 */
function Bind(harness: Harness, ...ids: readonly string[]): void {
	harness.withReducerTx(Caller, (ctx) => {
		for (const id of ids) {
			ctx.db.generation.insert({
				id,
				boundAt: Stamp(0n),
				manifestDigest: `digest:${id}`,
				policyChanged: true,
			});
		}
	});
}

test("a reveal naming a superseded generation is refused and writes nothing", () => {
	const harness = Setup();
	Bind(harness, "1", "2");
	Declare(harness);
	Grant(harness);
	const before = Archive(harness);

	// The refusal is the shared helper's, not a second message this reducer
	// invented: one check, one vocabulary, whichever catalog write reaches it.
	assert.throws(
		() => Reveal(harness, Request({ generation: "1" })),
		/stale-generation: the write names generation 1, the latest bound generation is 2/,
	);

	assert.deepEqual(Receipts(harness), []);
	assert.equal(Archive(harness), before);
});

test("a reveal naming a generation that was never bound is refused as stale", () => {
	const harness = Setup();
	Bind(harness, "1");
	Declare(harness);
	Grant(harness);

	assert.throws(
		() => Reveal(harness, Request({ generation: "9" })),
		/stale-generation: the write names generation 9, the latest bound generation is 1/,
	);
	assert.deepEqual(Receipts(harness), []);
});

test("a reveal naming a generation with nothing bound is refused as unbound", () => {
	const harness = Setup();
	Declare(harness);
	Grant(harness);

	assert.throws(
		() => Reveal(harness, Request({ generation: "1" })),
		/unbound-generation: nothing has been bound, so 1 cannot be the latest generation/,
	);
	assert.deepEqual(Receipts(harness), []);
});

test("naming the latest generation writes the same receipt as naming none", () => {
	const named = Setup();
	Bind(named, "1", "2");
	Declare(named);
	Grant(named);
	Reveal(named, Request({ generation: "2" }));

	const unnamed = Setup();
	Bind(unnamed, "1", "2");
	Declare(unnamed);
	Grant(unnamed);
	Reveal(unnamed, Request());

	// The generation is a guard rather than a column, so the accepted path is
	// byte-for-byte what it was before the argument existed.
	assert.deepEqual(Receipts(named), Receipts(unnamed));
});

test("a reveal naming no generation is not refused when nothing is bound", () => {
	// Only an assertion can be stale. A caller that asserts nothing is under
	// the latest by construction, so a module with nothing bound still
	// discloses - the same rule `claim` and `renew` follow.
	const harness = Setup();
	Declare(harness);
	Grant(harness);

	Reveal(harness, Request());

	assert.equal(Receipts(harness).length, 1);
});

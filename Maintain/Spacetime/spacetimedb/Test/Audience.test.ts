// Criteria 3 and 4 of the probe contract, as assertions rather than as prose.
//
// Criterion 3 - the stored `audience` is the server-resolved identity of
// `ctx.sender` and can never be a caller-supplied value. Three separate facts
// are checked, because each one is a different way the rule could break:
//
// 1. No registered reducer *declares* an audience-like argument. Read from the
//    module's own built definition (`schema.moduleDef`), which is what the host
//    publishes - so a reducer that grew such an argument fails here before any
//    call is made.
// 2. A call that carries one anyway is ignored. The harness hands the reducer
//    the object the caller built, extra fields included, which is the same
//    situation as a wire payload whose decoder kept an undeclared field.
// 3. No call persists the spoofed value anywhere. Every table is scanned after
//    each call, so a reducer that copied the field into some other column is
//    caught even when the `audience` column itself is correct.
//
// Criterion 4 - no reducer returns or exposes a value the caller is not
// entitled to. A reducer's return type is a published fact, so the audit reads
// it; a `return` statement inside a reducer body is a source fact, so the audit
// scans for one; and the single view is exercised from two identities.
//
// The archive's own tables are asserted elsewhere; this file checks the catalog
// and the one path a private value leaves it.

// The module's tsconfig carries no node types: this file is run by node with its
// own loader (`Test/Support/Register.mjs`), not bundled into the module.
// @ts-expect-error - `node:assert/strict` has no declarations in this program
import assert from "node:assert/strict";
// @ts-expect-error - `node:fs` has no declarations in this program
import { readFileSync } from "node:fs";
// @ts-expect-error - `node:test` has no declarations in this program
import { test } from "node:test";
import { ConnectionId, Timestamp } from "spacetimedb";
import type { InferSchema } from "spacetimedb/server";
import { createModuleTestHarness, TestAuth } from "spacetimedb/server/test-utils";
import * as Catalog from "../src/index";

/**
 * The one global this file needs, declared rather than imported.
 *
 * The module's tsconfig has no `types` entry, so `node:process` is not in scope;
 * the diagnostics below go through it because `console` belongs to the module
 * shim once the module is imported.
 */
declare const process: { stdout: { write(text: string): void } };

/** The harness, typed to this module's own schema. */
type Harness = ReturnType<typeof createModuleTestHarness<InferSchema<typeof Catalog.default>>>;

/** What `reveal` accepts, as the host passes it. */
type RevealArguments = Parameters<typeof Catalog.reveal>[1];

/** What `claim` accepts. */
type ClaimArguments = Parameters<typeof Catalog.claim>[1];

const SECOND = 1_000_000n;
const MINUTE = 60n * SECOND;

/** The instant every fixture starts from. */
const BASE = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z")).microsSinceUnixEpoch;

/**
 * The one sender most calls in this file are made as.
 *
 * `TestAuth.internal()` resolves to the module's own identity - all zeros - and
 * is the identity every other test in this directory calls as, so the fixtures
 * and assertions here line up with them.
 */
const Caller = TestAuth.internal();

/** A second authenticated identity: a JWT payload's `sub` decides the hex. */
const Other = TestAuth.fromJwtPayload(
	JSON.stringify({ iss: "test", sub: "other", aud: "timeline", exp: 4_000_000_000, iat: 0 }),
	new ConnectionId(1n),
);

/** A third identity, for the case where two non-callers must stay apart. */
const Third = TestAuth.fromJwtPayload(
	JSON.stringify({ iss: "test", sub: "third", aud: "timeline", exp: 4_000_000_000, iat: 0 }),
	new ConnectionId(2n),
);

/**
 * The identity a caller tries to write in another's name.
 *
 * Not a real identity and deliberately not the caller's: if this value reaches a
 * column, the column is not server-resolved.
 */
const SPOOF = "f".repeat(64);

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

/** The hex identity a call is made as, read from a reducer context. */
function HexOf(harness: Harness, auth = Caller): string {
	return harness.withReducerTx(auth, (ctx) => ctx.sender.toHexString());
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
function Declare(harness: Harness): void {
	DeclareCapability(harness);
	DeclareProperty(harness);
}

/**
 * Bind the generations a fixture runs under.
 *
 * `bind` is exercised by the sweep below and by `Bind.test.ts`; a fixture that
 * only needs a receipt to name a generation writes the row through a reducer
 * transaction, the same access `bind` itself uses. A reveal refuses when nothing
 * is bound, because a receipt that says what was disclosed but not which
 * interpreter allowed it is not evidence of a policy.
 */
function Bound(harness: Harness, ...ids: readonly string[]): void {
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

/**
 * Write one lease row.
 *
 * `claim` is not used where a fixture needs a holder other than the caller: the
 * reducer writes `ctx.sender` and nothing else, which is exactly what one of the
 * tests below asserts.
 */
function Grant(
	harness: Harness,
	options: { holder?: string; expiresAt?: string; resource?: string; state?: string } = {},
): void {
	const resource = options.resource ?? RESOURCE;
	// Resolved before the transaction opens: a second `withReducerTx` inside one
	// re-enters the datastore's lock and panics the wasm runtime.
	const holder = options.holder ?? HexOf(harness);

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

/** The request every test starts from, with only the field under test changed. */
function Request(overrides: Record<string, unknown> = {}): RevealArguments {
	return {
		capability: CAPABILITY,
		property: PROPERTY,
		propertyVersion: 1,
		at: Stamp(0n),
		...overrides,
	} as RevealArguments;
}

/** One reveal, as the host would call it. */
function Reveal(harness: Harness, args: RevealArguments, auth = Caller): void {
	harness.withReducerTx(auth, (ctx) => Catalog.reveal(ctx, args));
}

/** Every committed `probe` row. */
function Receipts(harness: Harness) {
	return [...harness.db.probe.iter()];
}

/** What an identity reads back through the module's own view. */
function MyProbe(harness: Harness, auth = Caller) {
	return Catalog.myProbe(harness.viewContext(auth));
}

/**
 * One line of evidence, written straight to stdout.
 *
 * `console` belongs to the SpacetimeDB module shim once the module is imported
 * and routes into the stubbed host syscalls, so a diagnostic that has to appear
 * in the test log goes through `process.stdout`.
 */
function Diagnostic(label: string, row: unknown): void {
	const text = JSON.stringify(row, (_key, value) =>
		typeof value === "bigint" ? value.toString() : value,
	);
	process.stdout.write(`[audit] ${label}: ${text}\n`);
}

/** Every row of every table, as one text, for a value that must appear nowhere. */
function AllRows(harness: Harness): string {
	const tables: Record<string, unknown> = {};
	// `db` is typed by column accessor; the table map underneath is what a scan
	// needs, and it is the same object the accessors came from.
	const db = harness.db as unknown as Record<string, { iter(): Iterable<unknown> }>;

	for (const name of Object.keys(db)) {
		tables[name] = [...db[name].iter()];
	}

	// `fence` is a `t.u64()` and arrives as a bigint, which JSON cannot encode.
	return JSON.stringify(tables, (_key, value) =>
		typeof value === "bigint" ? value.toString() : value,
	);
}

// --------------------------------------------------------------- criterion 3

/**
 * The words that would make an argument an audience claim rather than data.
 *
 * `subject` is not here: it is what a trace happened to, never who is asking.
 */
const AUDIENCE_LIKE = /audience|role|holder|sender|identity|actor|principal|owner|member|user/i;

test("criterion 3: no registered reducer declares an audience-like argument", () => {
	// Building a harness is what registers the exports, so the definition below
	// is complete rather than the empty skeleton an import alone leaves behind.
	Setup();

	const declared: string[] = [];

	for (const reducer of Catalog.default.moduleDef.reducers) {
		for (const parameter of reducer.params.elements) {
			const name = parameter.name;

			// A reducer argument always has a name: `RowBuilder` builds the
			// elements from the keys of the params object, so a nameless one is a
			// fixture fault rather than a pass. Defaulting it to "" would let the
			// audit below read it as "not audience-like" and go green on an
			// argument it never examined.
			if (name === undefined) {
				throw new Error(`${reducer.sourceName} declares an argument with no name`);
			}

			assert.ok(
				!AUDIENCE_LIKE.test(name),
				`${reducer.sourceName} declares an audience-like argument ${JSON.stringify(name)}`,
			);
		}

		declared.push(reducer.sourceName);
	}

	// The audit's coverage claim, asserted rather than assumed: every reducer the
	// host publishes was examined above.
	assert.deepEqual(declared.sort(), [
		"attach",
		"bind",
		"claim",
		"classify",
		"init",
		"observe",
		"onConnect",
		"onDisconnect",
		"recomputeBelief",
		"record",
		"recordTrace",
		"renew",
		"reveal",
	]);
});

/**
 * One spoofing shape per test: a field name a caller might hope the module reads.
 *
 * Each shape is an argument the reducer's declared signature does not have, so
 * the only way it could reach the stored column is if the module read it.
 */
const SPOOFS: readonly (readonly [string, Record<string, unknown>])[] = [
	["an audience argument", { audience: SPOOF }],
	["a role argument", { role: "prober" }],
	["a holder argument", { holder: SPOOF }],
	["a sender argument", { sender: SPOOF }],
	["an identity argument", { identity: SPOOF }],
	["an actor argument", { actor: SPOOF }],
	[
		"every audience-like argument at once",
		{
			audience: SPOOF,
			role: "prober",
			holder: SPOOF,
			sender: SPOOF,
			identity: SPOOF,
			actor: SPOOF,
		},
	],
];

for (const [description, spoof] of SPOOFS) {
	test(`criterion 3: reveal ignores ${description} and stores ctx.sender`, () => {
		const harness = Setup();
		Declare(harness);
		Bound(harness, "1");
		Grant(harness);

		Reveal(harness, Request(spoof));

		const [receipt] = Receipts(harness);
		Diagnostic(`reveal with ${description}`, receipt);

		assert.equal(Receipts(harness).length, 1);
		assert.equal(receipt.audience, HexOf(harness));
		assert.notEqual(receipt.audience, SPOOF);
	});
}

test("criterion 3: reveal ignores an audience carried on the prototype chain", () => {
	const harness = Setup();
	Declare(harness);
	Bound(harness, "1");
	Grant(harness);

	// The strongest form of the attack: `args.audience` *resolves* - through the
	// prototype - to a value the caller chose. A module that read it, even with
	// `?? ctx.sender`, would store the spoof.
	const request = Object.assign(Object.create({ audience: SPOOF, role: "prober" }), Request());
	assert.equal((request as { audience: string }).audience, SPOOF);

	Reveal(harness, request as RevealArguments);

	const [receipt] = Receipts(harness);
	Diagnostic("reveal with a prototype-carried audience", receipt);
	assert.equal(receipt.audience, HexOf(harness));
});

test("criterion 3: reveal ignores a __proto__ payload", () => {
	const harness = Setup();
	Declare(harness);
	Bound(harness, "1");
	Grant(harness);

	const payload = JSON.parse(
		JSON.stringify({ ...Request(), __proto__: { audience: SPOOF } }),
	) as RevealArguments;

	Reveal(harness, payload);

	const [receipt] = Receipts(harness);
	Diagnostic("reveal with a __proto__ audience", receipt);
	assert.equal(receipt.audience, HexOf(harness));
});

test("criterion 3: a second identity cannot write a receipt in the first identity's name", () => {
	const harness = Setup();
	Declare(harness);
	Bound(harness, "1");
	// The lease belongs to the caller, so the second identity has no entitlement
	// of its own and would be refused on the plain path.
	Grant(harness);

	// The second identity presents the first identity's hex as its audience and
	// holds a lease of its own on the same resource.
	const otherHex = HexOf(harness, Other);
	harness.withReducerTx(Other, (ctx) => {
		ctx.db.lease.insert({
			id: `${RESOURCE}:2`,
			resource: RESOURCE,
			holder: otherHex,
			fence: 2n,
			acquiredAt: Stamp(0n),
			expiresAt: Stamp(MINUTE),
			state: "held",
		});
	});

	Reveal(harness, Request({ audience: HexOf(harness) }), Other);

	const receipts = Receipts(harness);
	Diagnostic("second identity's receipt", receipts);

	assert.equal(receipts.length, 1);
	// Written in its own name, not the name it asked for.
	assert.equal(receipts[0].audience, otherHex);
	assert.notEqual(receipts[0].audience, HexOf(harness));

	// And the first identity's own view was not injected with it.
	assert.deepEqual(MyProbe(harness), []);
	assert.equal(MyProbe(harness, Other).length, 1);
});

test("criterion 3: claim writes the sender as the holder, never a caller-supplied one", () => {
	const harness = Setup();
	const request = {
		resource: RESOURCE,
		durationMicros: MINUTE,
		holder: SPOOF,
		audience: SPOOF,
	} as unknown as ClaimArguments;

	harness.withReducerTx(Caller, (ctx) => Catalog.claim(ctx, request));

	const [lease] = [...harness.db.lease.iter()];
	Diagnostic("claim with a spoofed holder", lease);

	assert.equal(lease.holder, HexOf(harness));
	assert.notEqual(lease.holder, SPOOF);
});

test("criterion 3: recomputeBelief writes the sender as the audience, never a caller-supplied one", () => {
	const harness = Setup();
	Declare(harness);
	Bound(harness, "1");
	Grant(harness);
	Reveal(harness, Request());

	harness.withReducerTx(Caller, (ctx) =>
		Catalog.recomputeBelief(ctx, { capability: CAPABILITY, audience: SPOOF } as never),
	);

	const [belief] = [...harness.db.belief.iter()];
	Diagnostic("belief recomputed with a spoofed audience", belief);

	assert.equal(belief.audience, HexOf(harness));
	assert.equal(belief.id, `${HexOf(harness)}:${CAPABILITY}`);
});

test("criterion 3: no reducer call persists a caller-supplied audience in any table", () => {
	const harness = Setup();
	Declare(harness);

	/** One call with the spoof appended, then the whole datastore is scanned. */
	const Step = (name: string, call: () => void): void => {
		call();

		const stored = AllRows(harness);
		assert.ok(
			!stored.includes(SPOOF),
			`${name} persisted the caller-supplied audience ${SPOOF} somewhere in the datastore`,
		);
	};

	Step("observe", () =>
		harness.withReducerTx(Caller, (ctx) =>
			Catalog.observe(ctx, {
				id: "post-1",
				url: "https://example.invalid/post-1",
				authorHandle: "someone",
				authorName: "Someone",
				authorVerified: false,
				text: "a post",
				postedAt: undefined,
				firstSeenAt: Stamp(0n),
				lastScrapedAt: Stamp(0n),
				visibility: "shadow",
				lists: "[]",
				replies: 0,
				reposts: 0,
				likes: 0,
				views: 0,
				source: "bookmark",
				at: Stamp(0n),
				action: "observed",
				audience: SPOOF,
			} as never),
		),
	);

	Step("record", () =>
		harness.withReducerTx(Caller, (ctx) =>
			Catalog.record(ctx, {
				kind: "note",
				subject: "post-1",
				payload: "{}",
				at: Stamp(0n),
				audience: SPOOF,
			} as never),
		),
	);

	Step("classify", () =>
		harness.withReducerTx(Caller, (ctx) =>
			Catalog.classify(ctx, {
				handle: "someone",
				list: "reading",
				by: "manual",
				confidence: 1,
				reason: "because",
				at: Stamp(0n),
				role: "curator",
			} as never),
		),
	);

	Step("attach", () =>
		harness.withReducerTx(Caller, (ctx) =>
			Catalog.attach(ctx, {
				postId: "post-1",
				kind: "image",
				url: "https://example.invalid/image.png",
				position: 0,
				holder: SPOOF,
			} as never),
		),
	);

	Step("bind", () =>
		harness.withReducerTx(Caller, (ctx) =>
			Catalog.bind(ctx, {
				previous: undefined,
				manifestDigest: "digest:manifest",
				capabilities: [CAPABILITY],
				policyChanged: false,
				audience: SPOOF,
			} as never),
		),
	);

	Step("recordTrace", () =>
		harness.withReducerTx(Caller, (ctx) =>
			Catalog.recordTrace(ctx, {
				generation: "1",
				kind: "act",
				subject: "post-1",
				payload: "{}",
				at: Stamp(0n),
				sender: SPOOF,
			} as never),
		),
	);

	Step("claim", () =>
		harness.withReducerTx(Caller, (ctx) =>
			Catalog.claim(ctx, {
				resource: RESOURCE,
				durationMicros: MINUTE,
				holder: SPOOF,
			} as never),
		),
	);

	Step("renew", () =>
		harness.withReducerTx(Caller, (ctx) =>
			Catalog.renew(ctx, {
				resource: RESOURCE,
				fence: 1n,
				extensionMicros: MINUTE,
				owner: SPOOF,
			} as never),
		),
	);

	Step("reveal", () =>
		harness.withReducerTx(Caller, (ctx) => Catalog.reveal(ctx, Request({ audience: SPOOF }))),
	);

	Step("recomputeBelief", () =>
		harness.withReducerTx(Caller, (ctx) =>
			Catalog.recomputeBelief(ctx, { capability: CAPABILITY, audience: SPOOF } as never),
		),
	);

	// The scan is only worth something if the spoof-shaped columns were written
	// at all: the rows the calls above legitimately produced are here.
	const stored = AllRows(harness);
	assert.ok(stored.includes(HexOf(harness)), "the caller's own identity was not persisted");
	assert.ok(stored.includes(PROPERTY), "the receipt was not written");
});

// --------------------------------------------------------------- criterion 4

/** The unit type a reducer that returns nothing declares. */
const UNIT = JSON.stringify({ tag: "Product", value: { elements: [] } });

test("criterion 4: every registered reducer declares a unit return type", () => {
	// Registration, so the published definition is complete.
	Setup();

	for (const reducer of Catalog.default.moduleDef.reducers) {
		Diagnostic(`return type of ${reducer.sourceName}`, reducer.okReturnType);
		assert.equal(
			JSON.stringify(reducer.okReturnType),
			UNIT,
			`${reducer.sourceName} declares a return type that is not unit`,
		);
	}
});

test("criterion 4: every reducer returns undefined when it is called", () => {
	const harness = Setup();
	Declare(harness);

	const returned: Record<string, unknown> = {};

	returned.init = harness.withReducerTx(Caller, (ctx) => Catalog.init(ctx, {}));
	returned.onConnect = harness.withReducerTx(Caller, (ctx) => Catalog.onConnect(ctx, {}));
	returned.onDisconnect = harness.withReducerTx(Caller, (ctx) => Catalog.onDisconnect(ctx, {}));

	returned.observe = harness.withReducerTx(Caller, (ctx) =>
		Catalog.observe(ctx, {
			id: "post-1",
			url: "https://example.invalid/post-1",
			authorHandle: "someone",
			authorName: "Someone",
			authorVerified: false,
			text: "a post",
			postedAt: undefined,
			firstSeenAt: Stamp(0n),
			lastScrapedAt: Stamp(0n),
			visibility: "shadow",
			lists: "[]",
			replies: 0,
			reposts: 0,
			likes: 0,
			views: 0,
			source: "bookmark",
			at: Stamp(0n),
			action: "observed",
		}),
	);

	returned.record = harness.withReducerTx(Caller, (ctx) =>
		Catalog.record(ctx, { kind: "note", subject: "post-1", payload: "{}", at: Stamp(0n) }),
	);

	returned.classify = harness.withReducerTx(Caller, (ctx) =>
		Catalog.classify(ctx, {
			handle: "someone",
			list: "reading",
			by: "manual",
			confidence: 1,
			reason: "because",
			at: Stamp(0n),
		}),
	);

	returned.attach = harness.withReducerTx(Caller, (ctx) =>
		Catalog.attach(ctx, {
			postId: "post-1",
			kind: "image",
			url: "https://example.invalid/image.png",
			position: 0,
		}),
	);

	returned.bind = harness.withReducerTx(Caller, (ctx) =>
		Catalog.bind(ctx, {
			previous: undefined,
			manifestDigest: "digest:manifest",
			capabilities: [CAPABILITY],
			policyChanged: false,
		}),
	);

	returned.recordTrace = harness.withReducerTx(Caller, (ctx) =>
		Catalog.recordTrace(ctx, {
			generation: "1",
			kind: "act",
			subject: "post-1",
			payload: "{}",
			at: Stamp(0n),
		}),
	);

	returned.claim = harness.withReducerTx(Caller, (ctx) =>
		Catalog.claim(ctx, { resource: RESOURCE, durationMicros: MINUTE }),
	);

	returned.renew = harness.withReducerTx(Caller, (ctx) =>
		Catalog.renew(ctx, { resource: RESOURCE, fence: 1n, extensionMicros: MINUTE }),
	);

	returned.reveal = harness.withReducerTx(Caller, (ctx) => Catalog.reveal(ctx, Request()));

	returned.recomputeBelief = harness.withReducerTx(Caller, (ctx) =>
		Catalog.recomputeBelief(ctx, { capability: CAPABILITY }),
	);

	// Every reducer the host publishes answered, and none of them answered with
	// a value: the datastore is the only channel a reducer has.
	const names = Catalog.default.moduleDef.reducers.map((reducer) => reducer.sourceName).sort();
	assert.deepEqual(Object.keys(returned).sort(), names);

	for (const [name, value] of Object.entries(returned)) {
		assert.equal(value, undefined, `${name} returned ${JSON.stringify(value)}`);
	}
});

/** `source` with every string literal and comment blanked out, same length. */
function Mask(source: string): string {
	const masked = source.split("");
	let index = 0;

	while (index < source.length) {
		const char = source[index];

		if (char === "/" && source[index + 1] === "/") {
			while (index < source.length && source[index] !== "\n") {
				masked[index] = " ";
				index += 1;
			}
			continue;
		}

		if (char === "/" && source[index + 1] === "*") {
			masked[index] = " ";
			masked[index + 1] = " ";
			index += 2;

			while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
				if (source[index] !== "\n") masked[index] = " ";
				index += 1;
			}

			if (index < source.length) {
				masked[index] = " ";
				masked[index + 1] = " ";
				index += 2;
			}
			continue;
		}

		if (char === '"' || char === "'" || char === "`") {
			const quote = char;
			masked[index] = " ";
			index += 1;

			while (index < source.length) {
				if (source[index] === "\\") {
					masked[index] = " ";
					if (index + 1 < source.length) masked[index + 1] = " ";
					index += 2;
					continue;
				}

				if (source[index] === quote) {
					masked[index] = " ";
					index += 1;
					break;
				}

				if (source[index] !== "\n") masked[index] = " ";
				index += 1;
			}
			continue;
		}

		index += 1;
	}

	return masked.join("");
}

/** The index of the bracket that closes the one at `open`, in masked source. */
function Closing(masked: string, open: number, opener: string, closer: string): number {
	let depth = 0;

	for (let index = open; index < masked.length; index += 1) {
		if (masked[index] === opener) depth += 1;
		else if (masked[index] === closer) {
			depth -= 1;
			if (depth === 0) return index;
		}
	}

	throw new Error(`unbalanced ${opener} at ${open}`);
}

/** The registration call each reducer, hook and view is declared through. */
const REGISTRATIONS = [
	"spacetimedb.reducer(",
	"spacetimedb.init(",
	"spacetimedb.clientConnected(",
	"spacetimedb.clientDisconnected(",
];

/** Every registered function's name and body, read out of the module source. */
function Registered(source: string): { name: string; body: string }[] {
	const masked = Mask(source);
	const found: { name: string; body: string }[] = [];

	for (const marker of REGISTRATIONS) {
		let index = masked.indexOf(marker);

		while (index !== -1) {
			const name = /export const (\w+) = $/.exec(masked.slice(0, index));

			// The body is the arrow function's block, found from the `=>` rather
			// than from the call's closing paren: the body sits inside the call,
			// so a paren-first search walks past it.
			const arrow = masked.indexOf("=>", index);
			const bodyOpen = masked.indexOf("{", arrow);
			const bodyClose = Closing(masked, bodyOpen, "{", "}");

			found.push({
				name: name === null ? "?" : name[1],
				body: masked.slice(bodyOpen, bodyClose + 1),
			});

			index = masked.indexOf(marker, bodyClose);
		}
	}

	return found;
}

/** Every `return` in `body` that hands back a value rather than leaving. */
function ValueReturns(body: string): string[] {
	const offenders: string[] = [];
	const pattern = /\breturn\b/g;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(body)) !== null) {
		let index = match.index + match[0].length;

		while (index < body.length && /\s/.test(body[index])) index += 1;

		const next = body[index];

		if (next !== ";" && next !== "}") offenders.push(body.slice(match.index, index + 1));
	}

	return offenders;
}

test("criterion 4: no registered function in the module returns a value", () => {
	const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
	const registered = Registered(source);

	// Coverage: every function the host publishes was found in the source, so a
	// registration written some other way fails here rather than being skipped.
	const names = registered.map((entry) => entry.name).sort();
	const published = Catalog.default.moduleDef.reducers
		.map((reducer) => reducer.sourceName)
		.sort();

	assert.deepEqual(names, published);

	for (const entry of registered) {
		const offenders = ValueReturns(entry.body);

		assert.deepEqual(offenders, [], `${entry.name} returns a value: ${offenders.join(" | ")}`);
	}
});

test("criterion 4: no other client read path is registered beside the view", () => {
	// Registration, so the published definition is complete.
	Setup();

	const definition = Catalog.default.moduleDef;

	// A procedure can reach outside the module and an HTTP handler answers
	// without a reducer context; neither exists here, so `my_probe` is the only
	// read path into the catalog and the public archive tables are the only
	// other rows a client can subscribe to.
	Diagnostic("procedures", definition.procedures.length);
	Diagnostic("http handlers", definition.httpHandlers.length);
	Diagnostic("http routes", definition.httpRoutes.length);
	Diagnostic("outboxes", definition.outboxes.length);
	Diagnostic("row-level security", definition.rowLevelSecurity.length);

	assert.equal(definition.procedures.length, 0);
	assert.equal(definition.httpHandlers.length, 0);
	assert.equal(definition.httpRoutes.length, 0);
	assert.equal(definition.outboxes.length, 0);
	assert.equal(definition.rowLevelSecurity.length, 0);
});

test("criterion 4: the catalog tables are private, so no subscriber reads a private column", () => {
	const visibility = new Map(
		Catalog.default.moduleDef.tables.map((table) => [table.sourceName, table.tableAccess.tag]),
	);

	for (const name of [
		"capability",
		"generation",
		"lease",
		"property",
		"probe",
		"belief",
		"trace",
	]) {
		Diagnostic(`visibility of ${name}`, visibility.get(name));
		assert.equal(visibility.get(name), "Private", `${name} is subscriber-readable`);
	}

	// The archive is public by design: it is the site's content.
	for (const name of ["post", "author", "media", "observation", "event", "membership"]) {
		assert.equal(visibility.get(name), "Public", `${name} should stay public`);
	}
});

test("criterion 4: the only view is my_probe, it is not anonymous, and it is sender-scoped", () => {
	const harness = Setup();
	const views = Catalog.default.moduleDef.views;

	assert.equal(views.length, 1);
	// The registry keys a view by its export name; its published name is the
	// `name: "my_probe"` option beside it.
	assert.equal(views[0].sourceName, "myProbe");
	assert.equal(views[0].isPublic, true);
	assert.equal(views[0].isAnonymous, false);

	Declare(harness);
	Bound(harness, "1");
	Grant(harness);
	Reveal(harness, Request());

	const otherHex = HexOf(harness, Other);
	harness.withReducerTx(Other, (ctx) => {
		ctx.db.lease.insert({
			id: `${RESOURCE}:2`,
			resource: RESOURCE,
			holder: otherHex,
			fence: 2n,
			acquiredAt: Stamp(0n),
			expiresAt: Stamp(MINUTE),
			state: "held",
		});
	});
	Reveal(harness, Request({ at: Stamp(SECOND) }), Other);

	const own = MyProbe(harness);
	const theirs = MyProbe(harness, Other);

	Diagnostic("caller's view rows", own);
	Diagnostic("second identity's view rows", theirs);

	assert.equal(own.length, 1);
	assert.equal(theirs.length, 1);
	assert.equal(own[0].audience, HexOf(harness));
	assert.equal(theirs[0].audience, otherHex);
	assert.notEqual(own[0].id, theirs[0].id);
});

test("criterion 3: the receipt carries the bound generation, never the caller's string", () => {
	const harness = Setup();
	Declare(harness);
	Bound(harness, "1", "2");
	Grant(harness);

	// A claim naming a superseded generation is refused before anything is read,
	// so the stored column can only ever be the helper's answer.
	assert.throws(() => Reveal(harness, Request({ generation: "1" })), /stale-generation/);
	assert.deepEqual(Receipts(harness), []);

	Reveal(harness, Request({ generation: "2" }));

	const [receipt] = Receipts(harness);
	Diagnostic("receipt under generation 2", receipt);

	assert.equal(receipt.generation, "2");
	assert.equal(receipt.audience, HexOf(harness));
});

test("criterion 4: a probe's receipt carries exactly the receipt columns and no private row", () => {
	const harness = Setup();
	Declare(harness);
	Bound(harness, "1");
	Grant(harness);
	Reveal(harness, Request());

	const [receipt] = Receipts(harness);
	Diagnostic("receipt columns", Object.keys(receipt).sort());

	assert.deepEqual(Object.keys(receipt).sort(), [
		"at",
		"audience",
		"capability",
		"generation",
		"id",
		"ingestedAt",
		"property",
		"propertyVersion",
		"value",
	]);

	// The generation is the helper's answer, not the caller's string: the row
	// states which interpreter allowed the disclosure.
	assert.equal(receipt.generation, "1");

	// The disclosure is the property's name, version and value; the evidence
	// column and the lease resource it names are the two things that must not
	// cross, and neither does.
	const receiptText = JSON.stringify(receipt);
	assert.ok(!receiptText.includes(EVIDENCE), "raw evidence crossed into the receipt");
	assert.ok(
		!receiptText.includes(RESOURCE),
		"the private row's resource crossed into the receipt",
	);

	// The same holds for the view, which is the read path a client uses.
	const viewText = JSON.stringify(MyProbe(harness));
	assert.ok(!viewText.includes(EVIDENCE), "raw evidence crossed into the view");
	assert.ok(!viewText.includes(RESOURCE), "the private row's resource crossed into the view");
});

test("criterion 4: a refusal does not name the private lease resource", () => {
	const harness = Setup();
	Declare(harness);
	Bound(harness, "1");
	// No lease: the caller is refused by the entitlement check, which is exactly
	// the caller that must not be told which resource the property declares.

	let message = "";

	try {
		Reveal(harness, Request());
	} catch (error) {
		message = (error as Error).message;
	}

	Diagnostic("entitlement refusal", message);

	assert.match(message, /^admission-refused: /);
	assert.match(message, /holds no live lease on/);
	// `property.resource` is a column of a private table, and a caller that
	// failed the entitlement check has no claim on it. Naming it also hands out
	// the one value `claim` would need to make the caller entitled.
	assert.ok(!message.includes(RESOURCE), `the refusal named the private resource ${RESOURCE}`);
	assert.deepEqual(Receipts(harness), []);
});

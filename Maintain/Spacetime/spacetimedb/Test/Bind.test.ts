// What `bind`'s admission step has to prove, restated from `Bind-Contract.md`
// §1 and §6 onto this module's four-column `generation` table: a manifest that
// names a capability the catalog does not declare is refused with that id in
// the message, `generation` is byte-for-byte unchanged afterwards, and the
// refusal is decided before the reducer resolves a predecessor or writes
// anything at all.
//
// The harness is the one SpacetimeDB ships for module tests: an in-memory
// datastore, a controllable clock, and the module's real reducer called the way
// the host calls it. `withReducerTx` aborts the transaction when the body
// throws, so "refused" and "wrote nothing" are one assertion here rather than
// two hopes that agree.
//
// One case is the happy path, and it is not decoration: a refusal test that
// passes because `bind` writes nothing on any input proves nothing about the
// validation, so the same file shows a declared manifest appending exactly one
// row.

// The module's tsconfig carries no node types: this file is run by node with its
// own loader (`Test/Support/Register.mjs`), not bundled into the module. The
// directives are deliberate, and tsc reports them as unused once the types are
// installed, which is when they should go.
// @ts-expect-error - `node:assert/strict` has no declarations in this program
import assert from "node:assert/strict";
// @ts-expect-error - `node:fs` has no declarations in this program
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error - `node:test` has no declarations in this program
import { test } from "node:test";
import { Timestamp } from "spacetimedb";
import type { InferSchema } from "spacetimedb/server";
import { createModuleTestHarness, TestAuth } from "spacetimedb/server/test-utils";
// The latest-generation pointer is read through its one implementation, so this
// file cannot disagree with the module about what "latest" means.
import { latestGeneration } from "../src/Catalog";
import * as Catalog from "../src/index";

/** The harness, typed to this module's own schema. */
type Harness = ReturnType<typeof createModuleTestHarness<InferSchema<typeof Catalog.default>>>;

/** What `bind` accepts, as the host passes it. */
type BindArguments = Parameters<typeof Catalog.bind>[1];

/** The instant every fixture starts from. */
const BASE = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z")).microsSinceUnixEpoch;

/** Two capability ids the catalog declares, and one it never does. */
const BROWSE = "agentic.browse@1.0.0";
const CHAT = "agentic.chat@1.0.0";
const UNDECLARED = "agentic.vote@1.0.0";

/** The one sender every call in this file is made as. */
const Caller = TestAuth.internal();

/** The stamp `offsetMicros` after the fixture instant, in the format the module writes. */
function Stamp(offsetMicros: bigint): string {
	return new Timestamp(BASE + offsetMicros).toISOString();
}

/**
 * A harness with the two declared capabilities and the clock at the fixture
 * instant.
 *
 * The rows are seeded through a reducer transaction - the same access `bind`
 * uses - because `createModuleTestHarness` builds the module's datastore
 * without running `init`, and `init` is the only thing that writes
 * `capability` (`seedCapabilities` in `Declarations.ts`). Seeding also keeps
 * these cases off the deployment's own list: a case about a capability that is
 * *not* declared must not start passing because someone declared it, and the
 * fixture ids pin that.
 */
function Setup(): Harness {
	const harness = createModuleTestHarness(Catalog.default, Catalog);
	harness.clock.set(new Timestamp(BASE));

	harness.withReducerTx(Caller, (ctx) => {
		for (const id of [BROWSE, CHAT]) {
			const [name, version] = id.split("@");

			ctx.db.capability.insert({
				id,
				name,
				version,
				stateClass: "stateless",
				contractDigest: `contract:${id}`,
				declaredAt: Stamp(0n),
			});
		}
	});

	return harness;
}

/** One bind, as the host would call it. */
function Bind(harness: Harness, args: BindArguments): void {
	harness.withReducerTx(Caller, (ctx) => Catalog.bind(ctx, args));
}

/** The manifest every test starts from, with only the field under test changed. */
function Manifest(overrides: Partial<BindArguments> = {}): BindArguments {
	return {
		previous: undefined,
		manifestDigest: "sha256:first",
		capabilities: [BROWSE],
		policyChanged: true,
		...overrides,
	};
}

/**
 * Every committed row of the two tables a bind could touch, as one stable text.
 *
 * `generation` and `capability` are the whole of it: a bind appends a generation
 * and may never declare a capability, so a row appearing in either table on a
 * refused call is the defect this file exists to catch. Read outside a
 * transaction, because the harness's backend traps a read taken inside one.
 */
function Snapshot(harness: Harness): string {
	const byId = (left: { id: string }, right: { id: string }) => left.id.localeCompare(right.id);
	return JSON.stringify({
		generation: [...harness.db.generation.iter()].sort(byId),
		capability: [...harness.db.capability.iter()].sort(byId),
	});
}

/** The latest bound generation, read through the module's own derivation. */
function Latest(harness: Harness): string | null {
	return harness.withReducerTx(Caller, (ctx) => latestGeneration(ctx));
}

// Every message assertion below is unanchored on purpose: `assert.throws` with a
// RegExp matches `String(error)`, which begins with the error's class name -
// `SenderError: admission-refused: ...` - so a `^admission-refused` pattern
// would never match.
//
// The snapshot assertions prove the outcome, not the ordering. `withReducerTx`
// aborts a call that throws, so a reducer that wrote first and validated second
// would leave `generation` unchanged too - the rollback hides the difference.
// Ordering therefore gets its own observation: `CountedContext` counts the
// inserts that reach the datastore, and a refused bind must reach none.

/**
 * The context a bind is called with, plus a reader for how many `generation`
 * inserts reached it.
 *
 * The wrapper is the seam the harness does not offer: the datastore is the
 * host's, and a host whose transaction aborts is a host whose rows never
 * existed, so counting the writes is the only way to tell "refused before the
 * insert" from "refused after it". Nothing in `src/index.ts` knows this wrapper
 * exists.
 */
function CountedContext(ctx: Parameters<typeof Catalog.bind>[0]) {
	const db = ctx.db as unknown as Record<string, Record<string, unknown>>;
	const inner = db.generation.insert as (row: unknown) => unknown;
	let inserts = 0;

	const wrapped = {
		...ctx,
		db: {
			...db,
			generation: {
				...db.generation,
				insert: (row: unknown) => {
					inserts += 1;
					return inner(row);
				},
			},
		},
	} as unknown as Parameters<typeof Catalog.bind>[0];

	return { ctx: wrapped, inserts: () => inserts };
}

test("a refused bind never reaches the insert", () => {
	const harness = Setup();
	let inserts = 0;

	assert.throws(
		() =>
			harness.withReducerTx(Caller, (ctx) => {
				const counted = CountedContext(ctx);

				try {
					return Catalog.bind(counted.ctx, Manifest({ capabilities: [UNDECLARED] }));
				} finally {
					inserts = counted.inserts();
				}
			}),
		/admission-refused: the manifest names agentic\.vote@1\.0\.0/,
	);

	assert.equal(inserts, 0);
});

test("the insert counter sees the one write a valid bind makes", () => {
	const harness = Setup();
	let inserts = 0;

	harness.withReducerTx(Caller, (ctx) => {
		const counted = CountedContext(ctx);

		try {
			return Catalog.bind(counted.ctx, Manifest());
		} finally {
			inserts = counted.inserts();
		}
	});

	// The control for the case above: a counter that never observes a write
	// would report zero for every call, including the one that writes.
	assert.equal(inserts, 1);
});

test("a manifest naming an undeclared capability is refused, names it, and writes nothing", () => {
	const harness = Setup();
	const before = Snapshot(harness);

	assert.throws(
		() => Bind(harness, Manifest({ capabilities: [BROWSE, UNDECLARED] })),
		/admission-refused: the manifest names agentic\.vote@1\.0\.0, which is not a declared capability/,
	);

	assert.equal(Snapshot(harness), before);
	assert.equal(Latest(harness), null);
});

test("a bare capability name is not a declared id", () => {
	const harness = Setup();
	const before = Snapshot(harness);

	assert.throws(
		() => Bind(harness, Manifest({ capabilities: ["agentic.browse"] })),
		/admission-refused: the manifest names agentic\.browse, which is not a declared capability/,
	);

	assert.equal(Snapshot(harness), before);
});

test("an empty digest and a duplicated capability are refused before any lookup", () => {
	const harness = Setup();
	const before = Snapshot(harness);

	assert.throws(
		() => Bind(harness, Manifest({ manifestDigest: "" })),
		/admission-refused: a bind needs a manifest digest/,
	);

	assert.throws(
		() => Bind(harness, Manifest({ capabilities: [BROWSE, BROWSE] })),
		/admission-refused: the manifest names a capability more than once/,
	);

	assert.equal(Snapshot(harness), before);
});

test("an undeclared capability is refused ahead of the predecessor check", () => {
	const harness = Setup();

	Bind(harness, Manifest());

	const before = Snapshot(harness);

	// Two faults at once: a capability that is not declared, and no predecessor
	// while generation 1 is already bound - which the reducer would refuse as a
	// second history. The capability message is the one that arrives, which is
	// how this file shows the admission step runs first rather than merely
	// before the insert.
	assert.throws(
		() => Bind(harness, Manifest({ capabilities: [UNDECLARED] })),
		/admission-refused: the manifest names agentic\.vote@1\.0\.0/,
	);

	assert.equal(Snapshot(harness), before);
});

test("a refusal over an existing history leaves every generation row byte-identical", () => {
	const harness = Setup();

	Bind(harness, Manifest());

	const before = Snapshot(harness);

	assert.throws(
		() => Bind(harness, Manifest({ previous: "1", capabilities: [UNDECLARED] })),
		/admission-refused: the manifest names agentic\.vote@1\.0\.0/,
	);

	assert.equal(Snapshot(harness), before);
	assert.deepEqual(
		[...harness.db.generation.iter()].map((row) => row.id),
		["1"],
	);
});

test("a declared manifest appends exactly one row at the module's clock", () => {
	const harness = Setup();

	Bind(harness, Manifest({ capabilities: [BROWSE, CHAT] }));

	// The count is asserted before the contents: "one row" is the claim, and a
	// deep-equal against a one-element array states it only by implication.
	assert.equal([...harness.db.generation.iter()].length, 1);
	assert.deepEqual(
		[...harness.db.generation.iter()],
		[
			{
				id: "1",
				boundAt: Stamp(0n),
				manifestDigest: "sha256:first",
				policyChanged: true,
			},
		],
	);
	assert.equal(Latest(harness), "1");
});

test("a successor appends one row and leaves its predecessor untouched", () => {
	const harness = Setup();

	Bind(harness, Manifest());

	const first = [...harness.db.generation.iter()][0];

	harness.clock.set(new Timestamp(BASE + 1_000_000n));

	Bind(harness, Manifest({ previous: "1", capabilities: [BROWSE, CHAT], policyChanged: false }));

	const rows = [...harness.db.generation.iter()].sort((left, right) =>
		left.id.localeCompare(right.id),
	);

	assert.deepEqual(
		rows.map((row) => row.id),
		["1", "2"],
	);
	assert.deepEqual(rows[0], first);
	assert.deepEqual(rows[1], {
		id: "2",
		boundAt: Stamp(1_000_000n),
		manifestDigest: "sha256:first",
		policyChanged: false,
	});
	assert.equal(Latest(harness), "2");
});

test("boundAt is the module's clock, not a value the caller supplies", () => {
	const harness = Setup();

	// `bind` has no timestamp argument, so a caller cannot supply one through
	// the host. The value below is offered anyway: "taken from the client" is a
	// claim about what the reducer reads, and the only way to observe it is to
	// put a value where a careless implementation would look and watch it be
	// ignored. The clock is moved too, so the expected stamp is neither the
	// fixture instant nor the caller's.
	const clientStamp = Stamp(99_000_000n);
	harness.clock.set(new Timestamp(BASE + 7_000_000n));

	Bind(harness, { ...Manifest(), boundAt: clientStamp } as unknown as BindArguments);

	const rows = [...harness.db.generation.iter()];

	assert.equal(rows.length, 1);
	assert.equal(rows[0].boundAt, Stamp(7_000_000n));
	assert.notEqual(rows[0].boundAt, clientStamp);
	assert.notEqual(rows[0].boundAt, Stamp(0n));
});

// The two assertions below are not behavioural, and that is the point: a
// reducer that appends a row and then rewrites its parent leaves every row in
// place and passes each case above, and a reducer that drops its post-append
// re-assertion commits the same row as one that keeps it. Neither defect is
// visible in the datastore, so they are read off the source the way
// `Test/Coherence.test.ts` reads off the one-file rule.
test("generation is appended to and never rewritten, and the append is re-checked", () => {
	const source = new URL("../src/", import.meta.url);
	const files = readdirSync(source)
		.filter((name: string) => name.endsWith(".ts"))
		.sort();
	const text = (name: string) => readFileSync(new URL(name, source), "utf8");

	// A generation is a fact about a moment. Nothing in the module may update
	// or delete one, in any file, under any name.
	const rewriters = files.filter((name: string) =>
		/generation\.(id\.)?(update|delete)\s*\(/.test(text(name)),
	);

	assert.deepEqual(rewriters, []);

	// Inside `bind`, the append is the single write, and the coherence check
	// that follows it is what rolls the row back when the pointer did not move.
	// A missing re-assertion is silent - the row commits and the history forks
	// - so its presence and its position are asserted rather than assumed.
	const index = text("index.ts");
	const start = index.indexOf("export const bind = spacetimedb.reducer(");

	assert.ok(start >= 0, "bind is registered in src/index.ts");

	const rest = index.slice(start + 1);
	const nextExport = rest.indexOf("\nexport const ");
	const body = nextExport === -1 ? rest : rest.slice(0, nextExport);

	assert.equal(
		(body.match(/appendGeneration\(/g) ?? []).length,
		1,
		"bind appends exactly one generation row",
	);

	const appendAt = body.search(/appendGeneration\(/);
	const recheckAt = body.search(/requireCoherentGeneration\(\s*ctx,\s*id\s*\)/);

	assert.ok(recheckAt >= 0, "bind re-asserts coherence against the row it wrote");
	assert.ok(appendAt < recheckAt, "the re-assertion follows the append");
});

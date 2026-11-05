// What a freshly published module has to be able to do, and what no caller may
// be able to do.
//
// `bind` refuses a manifest that names a capability the catalog does not
// declare, which is correct and, on a module that seeds nothing, useless: every
// bind on a fresh database would be refused. This file states the other half -
// the deployment declares a set, and the first bind against it appends
// generation `"1"` - together with the constraint that makes it safe: the set is
// written from one function, `init` is its only caller, and no reducer argument
// can reach it.
//
// The harness is the one SpacetimeDB ships for module tests, and it does not run
// lifecycle hooks. So `init` is exercised by calling the function it calls,
// inside the same `withReducerTx` a reducer runs in; the wiring itself is
// asserted separately by reading `src/index.ts`, because a test that only called
// the seed would pass just as happily with `init` calling nothing at all.

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
// The set under test, and the one function that writes it.
import { Declarations, seedCapabilities, type Declaration } from "../src/Declarations";
import * as Catalog from "../src/index";

/** The harness, typed to this module's own schema. */
type Harness = ReturnType<typeof createModuleTestHarness<InferSchema<typeof Catalog.default>>>;

/** What `bind` accepts, as the host passes it. */
type BindArguments = Parameters<typeof Catalog.bind>[1];

/** The instant every fixture starts from. */
const BASE = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z")).microsSinceUnixEpoch;

/** The one sender every call in this file is made as. */
const Caller = TestAuth.internal();

/** The stamp `offsetMicros` after the fixture instant, in the format the module writes. */
function Stamp(offsetMicros: bigint): string {
	return new Timestamp(BASE + offsetMicros).toISOString();
}

/**
 * A harness with the clock at the fixture instant and nothing in it.
 *
 * Nothing in it is the point: this is the state a module is published into, and
 * the state in which every bind was previously refused.
 */
function Fresh(): Harness {
	const harness = createModuleTestHarness(Catalog.default, Catalog);
	harness.clock.set(new Timestamp(BASE));

	return harness;
}

/** The seed, run the way `init` runs it: one transaction, the module's own context. */
function Seed(harness: Harness): number {
	return harness.withReducerTx(Caller, (ctx) => seedCapabilities(ctx));
}

/** One bind, as the host would call it. */
function Bind(harness: Harness, args: BindArguments): void {
	harness.withReducerTx(Caller, (ctx) => Catalog.bind(ctx, args));
}

/** The latest bound generation, read through the module's own derivation. */
function Latest(harness: Harness): string | null {
	return harness.withReducerTx(Caller, (ctx) => latestGeneration(ctx));
}

/** Every declared id the database holds, sorted, so two reads compare equal. */
function Ids(harness: Harness): string[] {
	return [...harness.db.capability.iter()].map((row) => row.id).sort();
}

/**
 * The declaration for one port, taken from the set itself.
 *
 * A fixture fault rather than a pass when the port is missing: a test that
 * spelled the id again would keep passing after the set stopped declaring it.
 */
function Declared(port: string): Declaration {
	const found = Declarations.find((declaration) => declaration.name === port);

	if (found === undefined) throw new Error(`the declared set names no ${port}`);

	return found;
}

/** The manifest every bind in this file sends, with only the ids changed. */
function Manifest(capabilities: string[]): BindArguments {
	return {
		previous: undefined,
		manifestDigest: "sha256:first",
		capabilities,
		policyChanged: true,
	};
}

// ------------------------------------------------------------------ the seed

test("a fresh database seeds the declared set, and the first bind appends generation 1", () => {
	const harness = Fresh();

	assert.deepEqual(Ids(harness), [], "the fixture starts empty");

	const seeded = Seed(harness);

	assert.equal(seeded, Declarations.length);
	assert.deepEqual(Ids(harness), Declarations.map((declaration) => declaration.id).sort());

	Bind(harness, Manifest([Declared("agentic.browse").id, Declared("agentic.chat.ask").id]));

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

test("declaredAt is the module's clock at the seed, never a value written down", () => {
	const harness = Fresh();

	Seed(harness);

	for (const row of harness.db.capability.iter()) {
		assert.equal(row.declaredAt, Stamp(0n));
	}

	// A second deployment, an hour later, stamps its own moment. The instant is
	// the module's fact, so the only thing that decides it is the clock the host
	// ran the hook under.
	const later = Fresh();
	later.clock.set(new Timestamp(BASE + 3_600_000_000n));
	Seed(later);

	for (const row of later.db.capability.iter()) {
		assert.equal(row.declaredAt, Stamp(3_600_000_000n));
	}
});

test("the seeded keys are <name>@<version>, and an id the set does not name is refused", () => {
	const harness = Fresh();

	Seed(harness);

	for (const row of [...harness.db.capability.iter()]) {
		assert.equal(row.id, `${row.name}@${row.version}`);
		assert.equal(row.id.split("@").length, 2, `${row.id} is not <name>@<version>`);
	}

	// The seed declares ids. It does not make a bare name resolvable, and it does
	// not declare anything the set leaves out - so a fresh database is usable
	// without being open.
	const browse = Declared("agentic.browse");

	for (const id of [browse.name, "agentic.vote@0.1.3"]) {
		assert.throws(
			() => Bind(harness, Manifest([id])),
			(error: Error) =>
				error.message.includes(
					`admission-refused: the manifest names ${id}, which is not a declared capability`,
				),
		);
	}

	assert.deepEqual([...harness.db.generation.iter()], []);
});

test("a declaration already in the table stands, because the table is append-only", () => {
	const harness = Fresh();

	// A row at an id the set declares, holding values the set does not state: a
	// contract digest and a retention class from an earlier deployment. The seed
	// must leave it alone, because rewriting it would change what the generations
	// already bound against it were checked against.
	const [first] = Declarations;
	const held = {
		id: first.id,
		name: first.name,
		version: first.version,
		stateClass: "holds-identity",
		contractDigest: "sha256:deployed-earlier",
		declaredAt: Stamp(-1_000_000n),
	};

	harness.withReducerTx(Caller, (ctx) => {
		ctx.db.capability.insert(held);
	});

	assert.equal(Seed(harness), Declarations.length - 1);
	assert.deepEqual(
		[...harness.db.capability.iter()].find((row) => row.id === first.id),
		held,
	);
});

test("a second seed appends nothing", () => {
	const harness = Fresh();

	Seed(harness);

	const before = [...harness.db.capability.iter()].sort((left, right) =>
		left.id.localeCompare(right.id),
	);

	assert.equal(Seed(harness), 0);
	assert.deepEqual(
		[...harness.db.capability.iter()].sort((left, right) => left.id.localeCompare(right.id)),
		before,
	);
});

test("the declared set is well-formed: one id per port, one version, a known class", () => {
	const ids = Declarations.map((declaration) => declaration.id);

	assert.ok(Declarations.length > 0, "an empty set declares nothing");
	assert.equal(new Set(ids).size, ids.length, "two declarations share an id");
	assert.equal(
		new Set(Declarations.map((declaration) => declaration.version)).size,
		1,
		"the set pins more than one version",
	);

	const classes = new Set(["stateless", "holds-transport", "holds-identity", "holds-workspace"]);

	for (const declaration of Declarations) {
		assert.ok(declaration.name.length > 0, `${declaration.id} has no name`);
		assert.ok(!declaration.name.includes("@"), `${declaration.name} carries a version`);
		assert.equal(declaration.id, `${declaration.name}@${declaration.version}`);
		assert.ok(
			classes.has(declaration.stateClass),
			`${declaration.id} declares ${declaration.stateClass}`,
		);
	}
});

// --------------------------------------------------- one writer, one caller

test("capability is written from one file, and the entry file reaches it only from init", () => {
	const source = new URL("../src/", import.meta.url);
	const files = readdirSync(source).filter((name: string) => name.endsWith(".ts"));

	const text = (name: string) => readFileSync(new URL(name, source), "utf8");

	// The mechanical statement of "one write path": the insert appears in one
	// file. `bind`, `reveal` and `recomputeBelief` read the table by primary key,
	// which is why only the insert is counted.
	assert.deepEqual(
		files.filter((name: string) => text(name).includes("capability.insert")).sort(),
		["Declarations.ts"],
	);

	const entry = text("index.ts");

	// Everything before the first statement is the import block; the rest of the
	// file is reducers, helpers and the hook itself.
	const statements = entry.search(/^export\b/m);
	const imports = entry.slice(0, statements);
	const initStart = entry.indexOf("export const init = spacetimedb.init(");
	const initEnd = entry.indexOf("});", initStart);

	assert.ok(statements > 0, "the entry file has no statements");
	assert.ok(initStart > 0, "the entry file has no init hook");
	assert.ok(initEnd > initStart, "the init hook is not a single statement");

	const initBody = entry.slice(initStart, initEnd);

	assert.ok(imports.includes("seedCapabilities"), "the entry file does not import the seed");
	assert.ok(initBody.includes("seedCapabilities("), "init does not call the seed");

	// Every mention is either the import or a call inside `init`. A mention
	// anywhere else would be a reducer reaching for the seed, which is the path
	// that would let a caller declare the capability its own manifest is then
	// checked against.
	for (const match of entry.matchAll(/seedCapabilities/g)) {
		const at = match.index ?? -1;
		const where = at < statements ? "the import block" : at < initEnd ? "init" : "the reducers";

		assert.ok(
			at < statements || (at > initStart && at < initEnd),
			`seedCapabilities is named outside init, in ${where}: ${entry.slice(at, at + 48)}`,
		);
	}
});

test("no registered export declares a capability, and none takes a declaration column", () => {
	// Building a harness is what registers the exports, so the definition read
	// below is complete rather than the skeleton an import alone leaves behind.
	Fresh();

	// The columns a caller would have to supply to write a `capability` row.
	// `id`, `name` and `version` are not here: `bind` legitimately takes the ids a
	// manifest names, and naming an id is not declaring one.
	const declarationColumns = new Set(["stateClass", "contractDigest", "declaredAt"]);

	const names = Catalog.default.moduleDef.reducers.map((reducer) => reducer.sourceName);

	assert.ok(names.includes("init"), "the module registers no init hook");
	assert.deepEqual(
		names.filter((name: string) => /^(declare|register|capability)$/i.test(name)),
		[],
		"a registered export is named for declaring a capability",
	);

	for (const reducer of Catalog.default.moduleDef.reducers) {
		for (const parameter of reducer.params.elements) {
			const name = parameter.name;

			// A reducer argument always has a name, so a nameless one is a fixture
			// fault: defaulting it to "" would read as "not a declaration column"
			// and go green on an argument it never examined.
			if (name === undefined) {
				throw new Error(`${reducer.sourceName} declares an argument with no name`);
			}

			assert.ok(!declarationColumns.has(name), `${reducer.sourceName} declares ${name}`);
		}
	}
});

test("no reducer adds a capability row, whatever it is called with", () => {
	const harness = Fresh();

	Seed(harness);

	const before = Ids(harness);

	// A payload shaped like the row a caller would want to write: the id, the
	// name and version, a retention class, a contract digest and the stamp.
	const payload = {
		id: "agentic.vote@0.1.3",
		name: "agentic.vote",
		version: "0.1.3",
		stateClass: "stateless",
		contractDigest: "sha256:injected",
		declaredAt: Stamp(0n),
	};

	// Every registered export, called the way the host calls a reducer. The
	// lifecycle hooks are skipped on purpose: no client can call them, and `init`
	// is the seed itself, whose re-entry is the case above.
	const exported = Catalog as unknown as Record<string, (ctx: unknown, args: unknown) => unknown>;

	for (const reducer of Catalog.default.moduleDef.reducers) {
		const name = reducer.sourceName;

		if (name === "init" || name === "onConnect" || name === "onDisconnect") continue;

		try {
			harness.withReducerTx(Caller, (ctx) => exported[name](ctx, payload));
		} catch {
			// Most of these reducers refuse a payload that is not their argument
			// list, and a refusal rolls back. The assertion is that none of them
			// declared the capability on its way through.
		}
	}

	assert.deepEqual(Ids(harness), before);
});

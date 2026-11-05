// The declared capabilities: the set a manifest may name, and the one path a
// `capability` row is written through.
//
// A declaration is a deployment, not a call. `seedCapabilities` is called by
// `init` - the hook the host runs when a module is published, which no client
// can reach - and by nothing else: no reducer calls it, and no reducer declares
// a capability, because a caller that could add one would widen the set its own
// manifest is then checked against (`Bind-Contract.md` §5). `bind` stays a
// reader of this table, which is why the module's only write to `capability` is
// below and not in the entry file.
//
// The list below is where this deployment's declared ids are written down. A
// module cannot read a file at publish time, so the values are restated here
// rather than loaded from the manifests they come from: one entry per port the
// Agentic workspace's manifest table ships
// (`Agentic/Crate/Sdk/Source/Struct/Manifest.rs`), at the workspace version,
// with the retention class that port's `module.json` declares.

import type { InferSchema, ReducerCtx } from "spacetimedb/server";
// This sub-package resolves imports the way the SpacetimeDB module bundler
// does - without an extension - which is why it is the one place in the
// repository that does not spell `.ts`.
import { nowOf } from "./Catalog";
import type { spacetimedb } from "./Schema";

/**
 * The module's reducer context, typed by the generated schema. Annotating a
 * context as `any` erases the table row types, and a `bigint` column then
 * infers as `number` - which type-checks and fails on insert.
 */
type Context = ReducerCtx<InferSchema<typeof spacetimedb>>;

/**
 * The retention classes the model names for a capability: what it keeps between
 * runs, and therefore what may be pre-warmed.
 *
 * The column is a plain string; this union is the declaration list's own check,
 * so a class no reader knows fails `tsc` instead of being written. The four are
 * `Generation-Capability-Spec.md` §1's, and a fifth is a model change rather
 * than an entry here.
 */
export type StateClass = "stateless" | "holds-transport" | "holds-identity" | "holds-workspace";

/**
 * The version every declaration below pins.
 *
 * One version for the whole set, because the Agentic manifests are versioned as
 * a workspace (`version.workspace = true`) rather than one port at a time. A
 * port that moved on its own would be a per-port version, which is a different
 * model and not one this table can express.
 */
const Version = "0.1.3";

/** One port the workspace ships, and what it retains between runs. */
type Port = {
	/** The port's name, which is the capability's stable name. */
	readonly port: string;
	/** What the capability retains between runs. */
	readonly stateClass: StateClass;
};

/**
 * Every port the Agentic manifest table ships, in the order that table lists
 * them.
 *
 * The order is the table's, not alphabetical: it is dependency order, so a
 * reader comparing the two lists sees them agree line for line. Order carries no
 * meaning in the database - a declaration's identity is its id.
 */
const Ports: readonly Port[] = [
	{ port: "agentic.runtime", stateClass: "holds-workspace" },
	{ port: "agentic.adapter", stateClass: "stateless" },
	{ port: "agentic.lane.decide", stateClass: "stateless" },
	{ port: "agentic.catalog.rules", stateClass: "stateless" },
	{ port: "agentic.skill.validate", stateClass: "stateless" },
	{ port: "agentic.chat.ask", stateClass: "holds-transport" },
	{ port: "agentic.browse", stateClass: "holds-transport" },
	{ port: "agentic.verify.design", stateClass: "stateless" },
	{ port: "agentic.workflow", stateClass: "stateless" },
	{ port: "agentic.compose", stateClass: "stateless" },
];

/**
 * One declaration: the columns of a `capability` row that a deployment states.
 *
 * `declaredAt` is deliberately absent. It is `T_ingest`, the instant the module
 * accepted the declaration, so `seedCapabilities` stamps it from the reducer
 * context and no value is written down here - a caller-supplied instant would
 * let a deployment backdate what it declared.
 *
 * `contractDigest` is a digest of the port's contract, or `""` when the source
 * manifest declares none. Every Agentic manifest carries `artefact.hash: null`
 * today, so every row below is empty, and the emptiness is the honest value:
 * this module records the digest a manifest states and never derives one of its
 * own, because a locally computed hash would be a second convention for the same
 * fact and a reader comparing it to the manifest would find a difference that
 * means nothing. `bind` does not compare the column either
 * (`Generation-Capability-Spec.md` §2), so an empty digest refuses nothing.
 */
export type Declaration = {
	/** `<name>@<version>` - the identifier a manifest names. */
	readonly id: string;
	/** The capability's stable name, without a version. */
	readonly name: string;
	/** The version this declaration pins. */
	readonly version: string;
	/** What the capability retains between runs. */
	readonly stateClass: string;
	/** A digest of the port's contract, or `""` when none is declared. */
	readonly contractDigest: string;
};

/**
 * The declared set: one row per port, with its id derived from its own name and
 * version.
 *
 * Derived rather than written out, because `<name>@<version>` is the key a
 * manifest names and a literal could spell it wrong. A row whose `id` disagreed
 * with its own `name` and `version` would be a declaration nothing could name
 * correctly: `bind` looks the id up, so the id is the fact and the other two
 * columns would merely describe a different one.
 */
export const Declarations: readonly Declaration[] = Ports.map(({ port, stateClass }) => ({
	id: `${port}@${Version}`,
	name: port,
	version: Version,
	stateClass,
	contractDigest: "",
}));

/**
 * Write every declaration the table does not already hold, and answer with how
 * many rows were appended.
 *
 * Called by `init` and by nothing else. `init` runs when a module is published
 * and when it is published with `--delete-data`; a republish that keeps its data
 * does not run it, so the set in the database is the set the data was written
 * under rather than whatever the newest deployment happens to declare.
 *
 * `capability` is append-only, so an id that is already declared is left exactly
 * as it is: this function inserts what is absent and never updates, deletes or
 * rewrites what is present. That is also what makes a second call append
 * nothing, which is the only way a host-free test can exercise the same path
 * `init` runs.
 *
 * `declaredAt` is `nowOf(ctx)`, read once for the whole call: a deployment is
 * one moment, and two rows from one seed carrying different instants would claim
 * two deployments.
 */
export function seedCapabilities(ctx: Context): number {
	const declaredAt = nowOf(ctx);
	let seeded = 0;

	for (const declaration of Declarations) {
		if (ctx.db.capability.id.find(declaration.id) !== null) continue;

		ctx.db.capability.insert({ ...declaration, declaredAt });
		seeded += 1;
	}

	return seeded;
}

// Generated from Maintain/Source/Model/Schema/Entities.ts - do not edit.
//
// `pnpm run Schema` rewrites this file; `pnpm run check` fails while it is
// stale. A field that needs to exist belongs in the declaration, never here.

import { schema, t, table } from "spacetimedb/server";

/**
 * The archive's tables. Reducers live in `index.ts`: they encode
 * behaviour, and behaviour is not derived from a field list.
 */

/** One row per post. Media and observations live in their own tables. */
const post = table(
	{ name: "post", public: true },
	{
		/** X status id - the same key the file store uses, and the filename it becomes. */
		id: t.string().primaryKey(),
		/** The permalink the page showed. */
		url: t.string(),
		/** The author's handle; the `author` table is keyed by it. */
		author: t.string().index(),
		/** The post's text, as the page rendered it. */
		text: t.string(),
		/** When the post was written, when the page showed it. Null when it did not. */
		postedAt: t.string().optional(),
		/** Reply count at `lastScrapedAt`. */
		replies: t.u32(),
		/** Repost count at `lastScrapedAt`. */
		reposts: t.u32(),
		/** Like count at `lastScrapedAt`. */
		likes: t.u32(),
		/** View count at `lastScrapedAt`. */
		views: t.u32(),
		/** When this pipeline first saw the post - never when it was saved. */
		firstSeenAt: t.string(),
		/** When the post's fields were last read from the page. */
		lastScrapedAt: t.string(),
		/** The only field that decides whether the post may reach the site. */
		visibility: t.string().index(),
		/** The list slugs as a JSON array, because their number is the person's. */
		lists: t.string(),
	},
);

/** One row per account seen in the archive. */
const author = table(
	{ name: "author", public: true },
	{
		/** The handle without its `@`. */
		handle: t.string().primaryKey(),
		/** The display name the page rendered. */
		name: t.string(),
		/** Whether the page marked the account verified. */
		verified: t.bool(),
		/** When this pipeline first saw the account. */
		firstSeenAt: t.string(),
		/** How many posts of this account the archive holds. */
		postCount: t.u32(),
	},
);

/** One row per attachment, keyed `<postId>:<url>` so a re-scrape rewrites nothing. */
const media = table(
	{ name: "media", public: true },
	{
		/** What the attachment is; a link card is media because it is part of the post's payload. */
		kind: t.string(),
		/** Where the attachment lives. */
		url: t.string(),
		/** `<postId>:<url>` - stable across scrapes. */
		id: t.string().primaryKey(),
		/** The post the attachment belongs to. */
		postId: t.string().index(),
		/** Where the attachment sits in the post, from zero. A gallery is ordered, so the table has to carry that order: sorting by key would reorder every multi-image post. */
		position: t.u32(),
	},
);

/** Append-only. One row per channel-showing, keyed `<postId>:<source>:<at>:<action>`. */
const observation = table(
	{ name: "observation", public: true },
	{
		/** When this source first showed the post - never when it was saved. */
		at: t.string(),
		/** The channel that showed it. */
		source: t.string().index(),
		/** The post this observation is about. */
		postId: t.string().index(),
		/** What happened: the archive saw it, published it, or withheld it. */
		action: t.string(),
		/** `<postId>:<source>:<at>:<action>`. */
		id: t.string().primaryKey(),
	},
);

/** Append-only log, keyed `<at>:<kind>:<subject>`. */
const event = table(
	{ name: "event", public: true },
	{
		/** When it happened. */
		at: t.string(),
		/** What happened. A closed set: a new kind is a schema change, not a string a caller may invent. */
		kind: t.string().index(),
		/** What it happened to - a status id, a source, a list slug. */
		subject: t.string().index(),
		/** Whatever the kind needs to say. Opaque, so a new event shape needs no migration. */
		payload: t.string(),
		/** `<at>:<kind>:<subject>`. */
		id: t.string().primaryKey(),
	},
);

/** One row per `(list, handle)`, keyed `<list>:<handle>`. */
const membership = table(
	{ name: "membership", public: true },
	{
		/** The configured list slug. */
		list: t.string().index(),
		/** The account that was filed. */
		handle: t.string().index(),
		/** Who decided: a weighted rule, the model pass, or the owner. */
		by: t.string(),
		/** How strongly the evidence supported it, 0 to 1. */
		confidence: t.f32(),
		/** The evidence the decision names, in prose. */
		reason: t.string(),
		/** When the decision was recorded. */
		at: t.string(),
		/** `<list>:<handle>` - the latest decision for that pair. */
		id: t.string().primaryKey(),
	},
);

/** One row per declared capability version. Append-only: a new version is a new row, so a generation's manifest keeps naming what it named. */
const capability = table(
	{ name: "capability", public: false },
	{
		/** `<name>@<version>` - the identifier a manifest names. */
		id: t.string().primaryKey(),
		/** The capability's stable name, without a version. */
		name: t.string().index(),
		/** The version this declaration pins. */
		version: t.string(),
		/** What the capability retains between runs, and therefore what may be pre-warmed. A caller that believes a warm context is anonymous when it carries an identity will reuse it for the wrong task, so the class is declared rather than inferred. */
		stateClass: t.string(),
		/** A digest of the port's contract, never of its code: a rebuild of the same contract keeps the digest, and a contract that moved changes it. */
		contractDigest: t.string(),
		/** `T_ingest` - when the module declared it, from the reducer context. A declaration is a deployment, so it has no `T_event` of its own and no ingestion lag to state. */
		declaredAt: t.string(),
	},
);

/** Append-only. One row per bound generation, never updated. */
const generation = table(
	{ name: "generation", public: false },
	{
		/** The sequence number as a decimal string: `1`, `2`, ... Dense by construction, because `bind` computes a successor's id from its parent's. */
		id: t.string().primaryKey(),
		/** `T_ingest` - when the bind reducer accepted it. The caller does not get to state this: a generation's birth is the module's own fact. */
		boundAt: t.string(),
		/** The composition root's digest of the manifest it bound. */
		manifestDigest: t.string(),
		/** Whether this generation's admission policy differs from its parent's. A manifest that re-bound the same policy is a new generation, not a new policy. */
		policyChanged: t.bool(),
	},
);

/** One row per grant. A claim inserts, a renew rewrites, a release marks it released; nothing deletes. */
const lease = table(
	{ name: "lease", public: false },
	{
		/** This grant's identity, unique per claim. A release does not reuse it, so two grants over one resource stay tellable apart. */
		id: t.string().primaryKey(),
		/** What it grants - a name the composition root chose, never a capability's. */
		resource: t.string().index(),
		/** The sender that holds it, and the only sender a fenced write is accepted from. */
		holder: t.string().index(),
		/** Monotonic per resource, never reused and never reset by a release. A write carrying an older fence is refused, which is what makes a takeover safe: the new holder's number is higher than the one the late worker still carries. */
		fence: t.u64(),
		/** `T_ingest` - when the claim that opened this grant was accepted, from the reducer context. */
		acquiredAt: t.string(),
		/** The deadline, `acquiredAt` plus the granted ttl. A deadline rather than a reading: expiry is the reducer's clock compared to this column, never a state a caller sets. */
		expiresAt: t.string(),
		/** Held until released. Expiry is not a state: an expired grant still reads `held` with a past `expiresAt`, because the honest answer to whether it is live is a comparison against the clock, not a column that would need a timer to stay true. */
		state: t.string(),
	},
);

/** Immutable. One row per disclosure, keyed by content so replaying a probe appends nothing. */
const probe = table(
	{ name: "probe", public: false },
	{
		/** `<capability>:<property>:<propertyVersion>:<audience>` - the reveal is its own receipt, so a second probe at the same version finds this row instead of appending a duplicate. */
		id: t.string().primaryKey(),
		/** The capability whose property was probed. */
		capability: t.string().index(),
		/** The property that was probed. */
		property: t.string().index(),
		/** The property version the disclosure is pinned to. Seeing the current truth is a separate entitlement, so a version is part of the fact rather than an optimisation. */
		propertyVersion: t.u32(),
		/** Who was told - the identity the reducer authenticated, never an argument, because a caller-supplied audience is a caller-supplied identity. */
		audience: t.string().index(),
		/** What was disclosed, as the audience would have read it. Never the private value it was computed from. */
		value: t.string(),
		/** `T_event` - when the reading was taken, as the worker states it. A claim, so it travels with the provenance of the run that made it. */
		at: t.string(),
		/** `T_ingest` - when the reducer accepted it. Paired with `at` on purpose: the two authorities never share a column, and their difference is the ingestion lag. */
		ingestedAt: t.string(),
	},
);

/** One row per `(audience, capability)`. Not append-only: a belief is derived, so the latest derivation replaces the row. */
const belief = table(
	{ name: "belief", public: false },
	{
		/** `<audience>:<capability>` - one current belief per pair, which is what makes it replaceable. */
		id: t.string().primaryKey(),
		/** The actor the belief belongs to, and the only actor it is about. */
		audience: t.string().index(),
		/** The capability being inferred. */
		capability: t.string().index(),
		/** The audience's own reading of its probes; never the private truth. */
		value: t.string(),
		/** How strongly the probes support it, 0 to 1. */
		confidence: t.f32(),
		/** `T_ingest` - when the reducer derived it. An inference has no `T_event`: nothing happened in the world, a row was computed. */
		at: t.string(),
	},
);

/** Append-only, keyed `<at>:<kind>:<subject>`. Evidence, not authority: a trace records a decision after it was taken, and is the one place a refused write still leaves a mark. */
const trace = table(
	{ name: "trace", public: false },
	{
		/** `<at>:<kind>:<subject>` - a replay at the same instant is the same fact, not a second one. */
		id: t.string().primaryKey(),
		/** The generation the act happened under. A trace read without it cannot say which policy allowed the act. */
		generation: t.string().index(),
		/** What happened. A closed set: a new kind is a schema change, not a string a caller may invent. */
		kind: t.string().index(),
		/** What it happened to - a resource, a generation, a capability, a property. */
		subject: t.string().index(),
		/** Whatever the kind needs to say. Opaque, so a new payload shape needs no migration; never a private value. */
		payload: t.string(),
		/** `T_event` - when it happened in the world, as the writer states it. */
		at: t.string(),
		/** `T_ingest` - when the reducer accepted the row, from the reducer context. */
		ingestedAt: t.string(),
		/** `T_scheduled` - when a scheduled run was due. Present only when the row was persisted as a one-shot, because an interval has no per-occurrence instant to store. */
		scheduledAt: t.string().optional(),
		/** `T_run` - when the scheduled reducer actually ran, from the reducer context. Its difference from `scheduledAt` is the scheduler's lateness, and from `ingestedAt` the post-ingest delay. */
		ranAt: t.string().optional(),
	},
);

export const spacetimedb = schema({
	post,
	author,
	media,
	observation,
	event,
	membership,
	capability,
	generation,
	lease,
	probe,
	belief,
	trace,
});

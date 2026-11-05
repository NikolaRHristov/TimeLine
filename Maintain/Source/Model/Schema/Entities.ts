import type { Entity } from "./Entity.ts";

/**
 * The archive, declared once.
 *
 * Every shape the pipeline stores, publishes or projects is here. The
 * TypeScript types under `Model/Generated/Types.ts`, the Zod collections in
 * `Source/content.config.ts` and the tables in
 * `Maintain/Spacetime/spacetimedb/src/Schema.ts` are all rendered from this
 * file; none of them is edited by hand.
 *
 * A target that disagrees about representation says so through its projection,
 * so the disagreement is a declared transformation rather than a second list
 * that can quietly stop matching.
 */

/** A status id is digits; it is also a filename, so nothing else may become one. */
const STATUS_ID = {
	kind: "string" as const,
	doc: "X status id - the same key the file store uses, and the filename it becomes.",
};

/**
 * A post, as the archive keeps it.
 *
 * The model field set is the *archive* record: a page reading plus the
 * bookkeeping that outlives it. `Model/Post/Post.ts` narrows this to the fields
 * a transport can actually read, so the page reading is a subset rather than a
 * fourth declaration.
 */
const Post: Entity = {
	name: "post",
	doc: "One post, keyed by its status id - never by its text.",
	model: {
		type: "PostRecord",
		doc: "A post as the shadow store keeps it: the record plus the archive bookkeeping.",
		fields: {
			id: STATUS_ID,
			url: { kind: "string", format: "url", doc: "The permalink the page showed." },
			author: {
				kind: "object",
				of: "author",
				doc: "The account behind the post, as the page showed it.",
			},
			text: { kind: "string", doc: "The post's text, as the page rendered it." },
			postedAt: {
				kind: "timestamp",
				nullable: true,
				doc: "When the post was written, when the page showed it. Null when it did not.",
			},
			media: {
				kind: "array",
				of: "media",
				doc: "Every image, video, gif and link card the post carries.",
			},
			metrics: {
				kind: "object",
				of: "metrics",
				doc: "The counts as the last scrape saw them.",
			},
			observations: {
				kind: "array",
				of: "channel",
				doc: "Every channel that has shown this post, and when each first did.",
			},
			firstSeenAt: {
				kind: "timestamp",
				doc: "When this pipeline first saw the post - never when it was saved.",
			},
			lastScrapedAt: {
				kind: "timestamp",
				doc: "When the post's fields were last read from the page.",
			},
			visibility: {
				kind: "enum",
				values: ["shadow", "public", "hidden"],
				doc: "The only field that decides whether the post may reach the site.",
			},
			lists: {
				kind: "array",
				of: "string",
				doc: "The configured list slugs the distribution stage filed this author under.",
			},
		},
	},
	module: {
		table: "post",
		key: "id",
		index: ["author", "visibility"],
		public: true,
		doc: "One row per post. Media and observations live in their own tables.",
		// The page reading is flattened: the database has no nested values.
		drop: ["media", "observations"],
		retype: {
			author: {
				kind: "string",
				doc: "The author's handle; the `author` table is keyed by it.",
			},
		},
		flatten: {
			metrics: {
				replies: { kind: "integer", column: "u32", doc: "Reply count at `lastScrapedAt`." },
				reposts: {
					kind: "integer",
					column: "u32",
					doc: "Repost count at `lastScrapedAt`.",
				},
				likes: { kind: "integer", column: "u32", doc: "Like count at `lastScrapedAt`." },
				views: { kind: "integer", column: "u32", doc: "View count at `lastScrapedAt`." },
			},
		},
		// A slug list is configuration, so its length is not the schema's business.
		collapse: {
			lists: {
				kind: "json",
				doc: "The list slugs as a JSON array, because their number is the person's.",
			},
		},
	},
	site: {
		name: "Bookmark",
		collection: "Bookmark",
		doc: "A published post, as the site's Bookmark collection keeps it.",
		// The archive's own bookkeeping is not the post: `observations` and
		// `visibility` describe the store, and the site never sees the store.
		drop: ["observations", "visibility"],
		rename: { lastScrapedAt: "scrapedAt" },
		extra: {
			source: {
				kind: "enum",
				values: ["x"],
				doc: "The network the post came from. One value today, and still a field: a second source would change the meaning of every record.",
			},
			publishedAt: {
				kind: "timestamp",
				doc: "When this post was first copied into the collection.",
			},
		},
	},
};

/** The account behind a post. */
const Author: Entity = {
	name: "author",
	doc: "The account behind a post, as the page shows it.",
	model: {
		type: "Author",
		fields: {
			handle: { kind: "string", doc: "The handle without its `@`." },
			name: { kind: "string", doc: "The display name the page rendered." },
			verified: { kind: "boolean", doc: "Whether the page marked the account verified." },
		},
	},
	module: {
		table: "author",
		key: "handle",
		public: true,
		doc: "One row per account seen in the archive.",
		extra: {
			firstSeenAt: { kind: "timestamp", doc: "When this pipeline first saw the account." },
			postCount: {
				kind: "integer",
				column: "u32",
				doc: "How many posts of this account the archive holds.",
			},
		},
	},
	site: {
		name: "Author",
		doc: "The identity as the site renders it inside a bookmark, a candidate or an author page.",
	},
};

/**
 * One author page: the site's `Author` collection.
 *
 * A different record from the identity above - it is the filing, not the
 * account - and it is the one place a manual decision can be seen. The rules
 * classifier reads it and never writes it.
 */
const Person: Entity = {
	name: "person",
	doc: "One author record in the site's content collection: `Source/Content/Author/<handle>.json`.",
	model: {
		type: "AuthorRecord",
		fields: {
			handle: { kind: "string", doc: "The handle without its `@`." },
			name: { kind: "string", doc: "The display name the archive last saw." },
			verified: { kind: "boolean", doc: "Whether the page marked the account verified." },
			firstSeenAt: { kind: "timestamp", doc: "When this pipeline first saw the account." },
			postCount: {
				kind: "integer",
				doc: "How many posts of this account the collection holds.",
			},
			lists: {
				kind: "array",
				of: "string",
				doc: "The configured list slugs this author was filed under.",
			},
			decision: {
				kind: "object",
				of: "decision",
				nullable: true,
				doc: "How the filing was reached, or null when no classifier has answered yet.",
			},
		},
	},
	site: {
		name: "Person",
		collection: "Author",
		doc: "One author page: the identity, what the archive holds of it, and how it was filed.",
	},
};

/** One media item on a post. */
const Media: Entity = {
	name: "media",
	doc: "One image, video, gif or link card attached to a post.",
	model: {
		type: "MediaItem",
		fields: {
			kind: {
				kind: "enum",
				values: ["image", "video", "gif", "link"],
				doc: "What the attachment is; a link card is media because it is part of the post's payload.",
			},
			url: { kind: "string", doc: "Where the attachment lives." },
		},
	},
	module: {
		table: "media",
		key: "id",
		index: ["postId"],
		public: true,
		doc: "One row per attachment, keyed `<postId>:<url>` so a re-scrape rewrites nothing.",
		extra: {
			id: { kind: "string", doc: "`<postId>:<url>` - stable across scrapes." },
			postId: { kind: "string", doc: "The post the attachment belongs to." },
			position: {
				kind: "integer",
				doc: "Where the attachment sits in the post, from zero. A gallery is ordered, so the table has to carry that order: sorting by key would reorder every multi-image post.",
			},
		},
	},
	site: {
		name: "Media",
		doc: "One attachment, as the site renders it.",
	},
};

/** The counts on a post. */
const Metrics: Entity = {
	name: "metrics",
	doc: "The engagement counts a post carries, as the last scrape saw them.",
	model: {
		type: "Metrics",
		fields: {
			replies: { kind: "integer", doc: "Reply count." },
			reposts: { kind: "integer", doc: "Repost count." },
			likes: { kind: "integer", doc: "Like count." },
			views: { kind: "integer", doc: "View count." },
		},
	},
	site: {
		name: "Metrics",
		doc: "The counts the site shows. Every one is required: a record the pipeline wrote always carries all four.",
	},
};

/**
 * One channel showing one post, as the post record keeps it.
 *
 * A post is archived once and observed many times, so the record carries the
 * channels that showed it rather than one row per showing - the showing itself
 * is the append-only log below.
 */
const Channel: Entity = {
	name: "channel",
	doc: "One channel that has shown a post, and when it first did.",
	model: {
		type: "Observation",
		fields: {
			source: {
				kind: "enum",
				values: ["bookmark", "like", "history"],
				doc: "The channel that showed it.",
			},
			at: {
				kind: "timestamp",
				doc: "When this source first showed the post - never when it was saved.",
			},
		},
	},
};

/**
 * One channel showing one post, once.
 *
 * Append-only, and the row is keyed by its own content, so replaying a scrape
 * writes nothing. There is no metrics column: the file store never kept a
 * historical count, and a table that invented one would be claiming a fact the
 * archive does not have.
 */
const Observation: Entity = {
	name: "observation",
	doc: "One append-only line: a channel showed a post, at a moment.",
	model: {
		type: "ObservationRecord",
		fields: {
			at: {
				kind: "timestamp",
				doc: "When this source first showed the post - never when it was saved.",
			},
			source: {
				kind: "enum",
				values: ["bookmark", "like", "history"],
				doc: "The channel that showed it.",
			},
			statusId: { kind: "string", doc: "The post this observation is about." },
			action: {
				kind: "enum",
				values: ["observed", "published", "hidden"],
				doc: "What happened: the archive saw it, published it, or withheld it.",
			},
		},
	},
	module: {
		table: "observation",
		key: "id",
		index: ["postId", "source"],
		public: true,
		doc: "Append-only. One row per channel-showing, keyed `<postId>:<source>:<at>:<action>`.",
		rename: { statusId: "postId" },
		extra: {
			id: { kind: "string", doc: "`<postId>:<source>:<at>:<action>`." },
		},
	},
};

/** One thing that happened. */
const Event: Entity = {
	name: "event",
	doc: "A fact with a timestamp and a subject: what happened, to what, when.",
	model: {
		type: "EventRecord",
		fields: {
			at: { kind: "timestamp", doc: "When it happened." },
			kind: {
				kind: "enum",
				values: [
					"scrape.started",
					"scrape.finished",
					"bookmark.added",
					"bookmark.removed",
					"list.assigned",
					"list.removed",
					"bookmark.published",
					"bookmark.hidden",
					"vote.nominated",
					"vote.cast",
					"vote.approved",
					"vote.rejected",
					"vote.ranked",
				],
				doc: "What happened. A closed set: a new kind is a schema change, not a string a caller may invent.",
			},
			subject: {
				kind: "string",
				doc: "What it happened to - a status id, a source, a list slug.",
			},
			payload: {
				kind: "json",
				fallback: "{}",
				doc: "Whatever the kind needs to say. Opaque, so a new event shape needs no migration.",
			},
		},
	},
	module: {
		table: "event",
		key: "id",
		index: ["kind", "subject"],
		public: true,
		doc: "Append-only log, keyed `<at>:<kind>:<subject>`.",
		extra: { id: { kind: "string", doc: "`<at>:<kind>:<subject>`." } },
	},
	site: {
		name: "Event",
		collection: "Event",
		doc: "The event trail the site publishes.",
	},
};

/**
 * Which curated list an account belongs to, and why.
 *
 * The latest decision for a `(list, handle)` pair wins, so a re-classification
 * replaces a row rather than appending to it.
 */
const Membership: Entity = {
	name: "membership",
	doc: "The latest filing decision for one account under one list.",
	model: {
		type: "MembershipRecord",
		fields: {
			list: { kind: "string", doc: "The configured list slug." },
			handle: { kind: "string", doc: "The account that was filed." },
			by: {
				kind: "enum",
				values: ["rule", "model", "manual"],
				doc: "Who decided: a weighted rule, the model pass, or the owner.",
			},
			confidence: { kind: "number", doc: "How strongly the evidence supported it, 0 to 1." },
			reason: { kind: "string", doc: "The evidence the decision names, in prose." },
			at: { kind: "timestamp", doc: "When the decision was recorded." },
		},
	},
	module: {
		table: "membership",
		key: "id",
		index: ["list", "handle"],
		public: true,
		doc: "One row per `(list, handle)`, keyed `<list>:<handle>`.",
		extra: {
			id: { kind: "string", doc: "`<list>:<handle>` - the latest decision for that pair." },
		},
	},
};

/** The decision a filed author carries. */
const Decision: Entity = {
	name: "decision",
	doc: "How an author's filing was reached.",
	model: {
		type: "DecisionRecord",
		fields: {
			by: {
				kind: "enum",
				values: ["rule", "model", "manual"],
				doc: "Who decided. `manual` is the person's own answer and no classifier may replace it.",
			},
			confidence: {
				kind: "number",
				optional: true,
				doc: "How strongly the evidence supported it, 0 to 1.",
			},
			score: {
				kind: "number",
				optional: true,
				doc: "The rules' weighted score, or the model's equivalent.",
			},
			gap: { kind: "number", optional: true, doc: "The score's lead over the runner-up." },
			reason: {
				kind: "string",
				optional: true,
				doc: "The evidence the decision names, in prose.",
			},
		},
	},
	site: {
		name: "Decision",
		doc: "The decision an author page carries. The arithmetic behind it stays out of the site: a page states a decision, not a score.",
		drop: ["score", "gap"],
	},
};

/** A candidate in the voted index. */
const Voted: Entity = {
	name: "voted",
	doc: "One candidate in the Voted index: the post, why it is here, and how many votes it has.",
	model: {
		type: "VotedRecord",
		fields: {
			id: {
				kind: "string",
				doc: "The status id, or a slug derived from a URL that carries none.",
			},
			url: { kind: "string", format: "url", doc: "The permalink being voted on." },
			title: {
				kind: "string",
				optional: true,
				doc: "Optional short label; the site falls back to the URL.",
			},
			note: {
				kind: "string",
				optional: true,
				doc: "Optional reason the owner nominated it.",
			},
			author: { kind: "object", of: "author", doc: "The account behind the link." },
			lists: {
				kind: "array",
				of: "string",
				doc: "The person's own list slugs - open strings, never an enum.",
			},
			votes: {
				kind: "integer",
				doc: "The count on file, refreshed by `maintain vote sync`.",
			},
			votedAt: { kind: "timestamp", doc: "When `votes` was last observed to change." },
			nominatedAt: { kind: "timestamp", doc: "When the candidate entered the index." },
			status: {
				kind: "enum",
				values: ["candidate", "approved", "rejected"],
				doc: "Where the candidate stands. A rejection is a tombstone, not a deletion.",
			},
		},
	},
	site: {
		name: "Voted",
		collection: "Voted",
		doc: "A candidate the site lists on `/Voted/`. The counts are a snapshot, never a live number.",
	},
};

/** One entry of the curated index. */
const Curated: Entity = {
	name: "curated",
	doc: "One entry of the Curated index - the only thing the homepage leads with.",
	model: {
		type: "CuratedRecord",
		fields: {
			id: {
				kind: "string",
				doc: "Points at the Voted or Bookmark record by id; the payload is never copied.",
			},
			rank: {
				kind: "integer",
				doc: "Dense and unique, 1..N, written by the owner rather than derived from votes.",
			},
			votes: {
				kind: "integer",
				doc: "The count frozen at approval time, which is what keeps the build reproducible.",
			},
			approvedAt: { kind: "timestamp", doc: "When the owner approved it." },
			approvedBy: { kind: "string", doc: "Who approved it." },
		},
	},
	site: {
		name: "Curated",
		collection: "Curated",
		doc: "One curated entry. `rank` is written by the owner, because curation exists to overrule a crowd.",
	},
};

/**
 * One declared capability: a port's contract, pinned by a version.
 *
 * The digest is of the contract, not of the code. Two builds of one port agree,
 * and a build that changed what the port promises does not - which is what lets
 * a generation be compared against the capabilities it names.
 *
 * Keyed `<name>@<version>` rather than by name: a manifest keeps naming the
 * version it was bound to after the port has moved on, so both versions have to
 * be able to exist at once.
 */
const Capability: Entity = {
	name: "capability",
	doc: "One capability a manifest may name, and the contract it is held to.",
	model: {
		type: "CapabilityRecord",
		doc: "A capability as the catalog declares it: its version, what it retains, and the contract it is held to.",
		fields: {
			id: {
				kind: "string",
				doc: "`<name>@<version>` - the identifier a manifest names.",
			},
			name: { kind: "string", doc: "The capability's stable name, without a version." },
			version: { kind: "string", doc: "The version this declaration pins." },
			stateClass: {
				kind: "enum",
				values: ["stateless", "holds-transport", "holds-identity", "holds-workspace"],
				doc: "What the capability retains between runs, and therefore what may be pre-warmed. A caller that believes a warm context is anonymous when it carries an identity will reuse it for the wrong task, so the class is declared rather than inferred.",
			},
			contractDigest: {
				kind: "string",
				doc: "A digest of the port's contract, never of its code: a rebuild of the same contract keeps the digest, and a contract that moved changes it.",
			},
			declaredAt: {
				kind: "timestamp",
				doc: "`T_ingest` - when the module declared it, from the reducer context. A declaration is a deployment, so it has no `T_event` of its own and no ingestion lag to state.",
			},
		},
	},
	module: {
		table: "capability",
		key: "id",
		index: ["name"],
		public: false,
		doc: "One row per declared capability version. Append-only: a new version is a new row, so a generation's manifest keeps naming what it named.",
	},
};

/**
 * One bound generation: the manifest a runtime was composed against.
 *
 * Append-only, and that is what makes the binding history auditable - a
 * generation is superseded by the existence of its successor, never by a column
 * someone rewrote.
 *
 * `policyChanged` is carried rather than derived by diffing two manifests: the
 * successor is the only place that knows whether the admission policy moved,
 * and a reader comparing digests would have to hold both manifests to ask.
 */
const Generation: Entity = {
	name: "generation",
	doc: "One generation that was bound, and whether it moved the policy.",
	model: {
		type: "GenerationRecord",
		doc: "A generation as the catalog keeps it: what was bound, when, and whether the policy moved.",
		fields: {
			id: {
				kind: "string",
				doc: "The sequence number as a decimal string: `1`, `2`, ... Dense by construction, because `bind` computes a successor's id from its parent's.",
			},
			boundAt: {
				kind: "timestamp",
				doc: "`T_ingest` - when the bind reducer accepted it. The caller does not get to state this: a generation's birth is the module's own fact.",
			},
			manifestDigest: {
				kind: "string",
				doc: "The composition root's digest of the manifest it bound.",
			},
			policyChanged: {
				kind: "boolean",
				doc: "Whether this generation's admission policy differs from its parent's. A manifest that re-bound the same policy is a new generation, not a new policy.",
			},
		},
	},
	module: {
		table: "generation",
		key: "id",
		public: false,
		doc: "Append-only. One row per bound generation, never updated.",
	},
};

/**
 * One authority over one resource, granted for a bounded time.
 *
 * The row is never deleted. Deleting it would erase the fence, and a fence that
 * restarts at one is a fence a late worker can still satisfy - so a release
 * marks the row and the number stays spent.
 */
const Lease: Entity = {
	name: "lease",
	doc: "One authority over one resource, granted for a bounded time.",
	model: {
		type: "LeaseRecord",
		doc: "A grant: what it covers, who holds it, the fence it was issued under, and the deadline it is refused after.",
		fields: {
			id: {
				kind: "string",
				doc: "This grant's identity, unique per claim. A release does not reuse it, so two grants over one resource stay tellable apart.",
			},
			resource: {
				kind: "string",
				doc: "What it grants - a name the composition root chose, never a capability's.",
			},
			holder: {
				kind: "string",
				doc: "The sender that holds it, and the only sender a fenced write is accepted from.",
			},
			fence: {
				kind: "bigint",
				doc: "Monotonic per resource, never reused and never reset by a release. A write carrying an older fence is refused, which is what makes a takeover safe: the new holder's number is higher than the one the late worker still carries.",
			},
			acquiredAt: {
				kind: "timestamp",
				doc: "`T_ingest` - when the claim that opened this grant was accepted, from the reducer context.",
			},
			expiresAt: {
				kind: "timestamp",
				doc: "The deadline, `acquiredAt` plus the granted ttl. A deadline rather than a reading: expiry is the reducer's clock compared to this column, never a state a caller sets.",
			},
			state: {
				kind: "enum",
				values: ["held", "released"],
				doc: "Held until released. Expiry is not a state: an expired grant still reads `held` with a past `expiresAt`, because the honest answer to whether it is live is a comparison against the clock, not a column that would need a timer to stay true.",
			},
		},
	},
	module: {
		table: "lease",
		key: "id",
		index: ["resource", "holder"],
		public: false,
		doc: "One row per grant. A claim inserts, a renew rewrites, a release marks it released; nothing deletes.",
	},
};

/**
 * The private truth about one capability's property.
 *
 * The one table no reader sees. `probe` records what an audience was told and
 * `belief` records what it inferred, so both are about a disclosure; this is
 * the thing disclosed. It is separate from them because it has exactly one
 * writer and no readers: a table a subscriber can read, and a table only a
 * reducer can read, are different objects with different rules, and merging
 * them would put the truth in a row somebody is subscribed to.
 *
 * `value` and `evidence` are separate columns for a reason that is not
 * organisation. A reveal computes a disclosure from `value` and must not copy
 * `evidence`, and "compute only the permitted disclosure" is only a rule with
 * something to obey: a column that exists, sits one line away, and is never
 * disclosed.
 *
 * `resource` is declared here rather than passed by the caller. A probe names a
 * capability and a property; the entitlement a reveal of that property needs is
 * the property's own fact. A caller that named its own resource could present a
 * lease on anything it holds and read a property it was never granted.
 */
const Property: Entity = {
	name: "property",
	doc: "The private truth about one capability's property: what it is, and why it is believed.",
	model: {
		type: "PropertyRecord",
		doc: "A property as the catalog keeps it: the truth, the evidence behind it, and the entitlement a reveal of it requires.",
		fields: {
			id: {
				kind: "string",
				doc: "`<capability>:<property>`, where the capability is its id and not its bare name - a capability version bump re-declares its properties from one, so the key has to say which declaration a truth belongs to.",
			},
			capability: {
				kind: "string",
				doc: "The capability id, `<name>@<version>` - the same value `probe.capability` carries.",
			},
			name: {
				kind: "string",
				doc: "The property's own name, without a version. `probe.property` names this, and the version travels beside it.",
			},
			version: {
				kind: "integer",
				column: "u32",
				doc: "The property's own monotone version. Seeing the current truth is a separate entitlement, so a reveal pins one of these numbers and a receipt never turns ambiguous when the truth moves on.",
			},
			resource: {
				kind: "string",
				doc: "The lease resource a reveal of this property requires - the entitlement binding. Declared, never supplied: a caller that named its own resource could present a lease on anything it holds.",
			},
			value: {
				kind: "string",
				doc: "The private truth. No subscriber reads it, no reducer returns it, no view projects it: a reveal computes a disclosure from it, and the disclosure is what leaves.",
			},
			evidence: {
				kind: "string",
				doc: "Why the value is believed. Never disclosed, and that is its purpose: a disclosure computed from this row has something it must not copy.",
			},
			updatedAt: {
				kind: "timestamp",
				doc: "`T_ingest` - when the module last accepted a write of this truth. The row is replaced rather than appended, so its own clock is the only record of when the truth moved.",
			},
		},
	},
	module: {
		table: "property",
		key: "id",
		index: ["capability", "resource"],
		public: false,
		doc: "One row per `<capability>:<property>`. Private like the other catalog tables: no subscriber reads it, no reducer returns it, no view projects it. A new version rewrites the row, and the receipt keeps what was told at the old one.",
	},
};

/**
 * What one audience was told about one property, at one version.
 *
 * Immutable, because a probe row is the receipt for a disclosure: rewriting one
 * would destroy the only evidence of what was revealed. There is no column for
 * the private value and no reducer is ever given it - a row states what was
 * disclosed, never the thing it was computed from.
 *
 * It does name the generation it was allowed under, as every catalog row does:
 * a disclosure is an act under an admission policy, so the receipt carries the
 * interpreter that permitted it. That value is the coherence helper's answer and
 * never the caller's string, and a module with nothing bound writes no receipt
 * at all - a receipt that names a policy cannot be written under none.
 *
 * The name is `probe`, not `observation`: the archive already spends
 * `observation` on a channel showing a post, and that table's meaning is fixed.
 * A second `observation` would be a schema collision, and renaming the archive's
 * would rewrite the meaning of every row it holds.
 */
const Probe: Entity = {
	name: "probe",
	doc: "One disclosure: a capability's property, at a version, to an audience.",
	model: {
		type: "ProbeRecord",
		doc: "A receipt for one disclosure - what was revealed, to whom, at which property version, and when.",
		fields: {
			id: {
				kind: "string",
				doc: "`<capability>:<property>:<propertyVersion>:<audience>` - the reveal is its own receipt, so a second probe at the same version finds this row instead of appending a duplicate.",
			},
			capability: { kind: "string", doc: "The capability whose property was probed." },
			property: { kind: "string", doc: "The property that was probed." },
			propertyVersion: {
				kind: "integer",
				column: "u32",
				doc: "The property version the disclosure is pinned to. Seeing the current truth is a separate entitlement, so a version is part of the fact rather than an optimisation.",
			},
			audience: {
				kind: "string",
				doc: "Who was told - the identity the reducer authenticated, never an argument, because a caller-supplied audience is a caller-supplied identity.",
			},
			value: {
				kind: "string",
				doc: "What was disclosed, as the audience would have read it. Never the private value it was computed from.",
			},
			at: {
				kind: "timestamp",
				doc: "`T_event` - when the reading was taken, as the worker states it. A claim, so it travels with the provenance of the run that made it.",
			},
			ingestedAt: {
				kind: "timestamp",
				doc: "`T_ingest` - when the reducer accepted it. Paired with `at` on purpose: the two authorities never share a column, and their difference is the ingestion lag.",
			},
			generation: {
				kind: "string",
				doc: "The generation the disclosure was allowed under, as the coherence helper answered - never the caller's string. A receipt that says what was disclosed but not which interpreter permitted it is not evidence of a policy, so a module with nothing bound has nothing to write here.",
			},
		},
	},
	module: {
		table: "probe",
		key: "id",
		index: ["capability", "property", "audience"],
		public: false,
		doc: "Immutable. One row per disclosure, keyed by content so replaying a probe appends nothing.",
	},
};

/**
 * What an audience infers about a capability from the probes it holds.
 *
 * Derived and disposable: deleting a belief loses nothing that cannot be
 * recomputed from the probe rows behind it, which is why the latest derivation
 * replaces the row instead of appending a second one.
 *
 * A belief grants no access. It is the actor's own reading, which is why it may
 * carry an interpretation at all while `probe` may not carry the truth.
 *
 * It carries no generation, and that is a decision rather than an omission.
 * `trace` and `probe` name the generation their act was permitted under because
 * each is evidence of an admission; a derivation admits nothing - it reads
 * receipts and copies one - so there is no policy for it to name. The receipts
 * are where that fact lives, and they are immutable: a row folding several of
 * them could carry only one id and would then be false about the rest, because
 * `confidence` is a function of all of them and not of the one it copied. The
 * generation the recompute itself ran under is not the row's fact either: it is
 * the latest bound one at that instant by construction, which makes it a fact
 * about when the row was written rather than about what it says - and the
 * replace-on-recompute rule would overwrite it on the next pass anyway. A
 * derivation history, if one is ever wanted, is a `trace` row: that table is
 * append-only and already carries the generation. So this table neither stamps a
 * generation nor refuses for want of one, which is the one position left beside
 * `lease`'s guard-only one.
 */
const Belief: Entity = {
	name: "belief",
	doc: "What an audience infers about a capability, from the probes it holds.",
	model: {
		type: "BeliefRecord",
		doc: "One current inference per audience and capability, with the confidence the probes support it at.",
		fields: {
			id: {
				kind: "string",
				doc: "`<audience>:<capability>` - one current belief per pair, which is what makes it replaceable.",
			},
			audience: {
				kind: "string",
				doc: "The actor the belief belongs to, and the only actor it is about.",
			},
			capability: { kind: "string", doc: "The capability being inferred." },
			value: {
				kind: "string",
				doc: "The audience's own reading of its probes; never the private truth.",
			},
			confidence: {
				kind: "number",
				doc: "How strongly the probes support it, 0 to 1.",
			},
			at: {
				kind: "timestamp",
				doc: "`T_ingest` - when the reducer derived it. An inference has no `T_event`: nothing happened in the world, a row was computed.",
			},
		},
	},
	module: {
		table: "belief",
		key: "id",
		index: ["audience", "capability"],
		public: false,
		doc: "One row per `(audience, capability)`. Not append-only: a belief is derived, so the latest derivation replaces the row.",
	},
};

/**
 * One act of the agentic layer, with the generation it happened under.
 *
 * The shape is `event`'s on purpose - `at`, `kind`, `subject`, `payload`, keyed
 * by content. A second event shape would be a second set of rules for one
 * question, and the two would drift the way two lists always do.
 *
 * It is the one catalog table that carries all four timestamps. A trace can
 * record a scheduled run, and only a row persisted as a one-shot has a
 * `T_scheduled` to be late against: an interval stores the interval, so
 * reconstructing `T_scheduled` as the previous run plus the interval would
 * reproduce the drift the measurement exists to find.
 */
const Trace: Entity = {
	name: "trace",
	doc: "One recorded act of the agentic layer: what happened, to what, under which generation.",
	model: {
		type: "TraceRecord",
		doc: "One trace line, in the same shape as an event: when it happened, what it was, what it was about, and what it carries.",
		fields: {
			id: {
				kind: "string",
				doc: "A digest of the content - `kind`, `subject`, `payload` - so a replay of the same act appends nothing, whatever instant it restates.",
			},
			generation: {
				kind: "string",
				doc: "The generation the act happened under. A trace read without it cannot say which policy allowed the act.",
			},
			kind: {
				kind: "enum",
				values: [
					"capability.declared",
					"generation.bound",
					"admission.refused",
					"lease.claimed",
					"lease.renewed",
					"lease.released",
					"lease.refused",
					"probe.recorded",
					"belief.derived",
				],
				doc: "What happened. A closed set: a new kind is a schema change, not a string a caller may invent.",
			},
			subject: {
				kind: "string",
				doc: "What it happened to - a resource, a generation, a capability, a property.",
			},
			payload: {
				kind: "json",
				fallback: "{}",
				doc: "Whatever the kind needs to say. Opaque, so a new payload shape needs no migration; never a private value.",
			},
			at: {
				kind: "timestamp",
				doc: "`T_event` - when it happened in the world, as the writer states it.",
			},
			ingestedAt: {
				kind: "timestamp",
				doc: "`T_ingest` - when the reducer accepted the row, from the reducer context.",
			},
			scheduledAt: {
				kind: "timestamp",
				optional: true,
				doc: "`T_scheduled` - when a scheduled run was due. Present only when the row was persisted as a one-shot, because an interval has no per-occurrence instant to store.",
			},
			ranAt: {
				kind: "timestamp",
				optional: true,
				doc: "`T_run` - when the scheduled reducer actually ran, from the reducer context. Its difference from `scheduledAt` is the scheduler's lateness, and from `ingestedAt` the post-ingest delay.",
			},
		},
	},
	module: {
		table: "trace",
		key: "id",
		index: ["generation", "kind", "subject"],
		public: false,
		doc: "Append-only, keyed by a digest of the content. Evidence, not authority: a trace records a decision after it was taken, and is the one place a refused write still leaves a mark.",
	},
};

/** Every entity, in declaration order. Order is what the rendered files follow. */
export const Entities: readonly Entity[] = [
	Post,
	Author,
	Person,
	Media,
	Metrics,
	Channel,
	Observation,
	Event,
	Membership,
	Decision,
	Voted,
	Curated,
	Capability,
	Generation,
	Lease,
	Property,
	Probe,
	Belief,
	Trace,
];

/** The entities a target carries, by name. */
export function entity(name: string): Entity {
	const found = Entities.find((entry) => entry.name === name);
	if (found === undefined) throw new Error(`unknown entity: ${name}`);
	return found;
}

/** The entities that have a SpacetimeDB table. */
export const Tables: readonly Entity[] = Entities.filter((entry) => entry.module !== undefined);

/** The entities that are a site content collection. */
export const Collections: readonly Entity[] = Entities.filter(
	(entry) => entry.site?.collection !== undefined,
);

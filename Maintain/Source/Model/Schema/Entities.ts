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

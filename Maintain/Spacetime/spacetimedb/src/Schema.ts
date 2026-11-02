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

export const spacetimedb = schema({
	post,
	author,
	media,
	observation,
	event,
	membership,
});

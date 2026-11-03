// Generated from Maintain/Source/Model/Schema/Entities.ts - do not edit.
//
// `pnpm run Schema` rewrites this file; `pnpm run check` fails while it is
// stale. A field that needs to exist belongs in the declaration, never here.

import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { defineCollection } from "astro:content";

/**
	* The site's content is written by the pipeline, not by hand.
	*
	* Every collection is a `glob` over JSON under `Source/Content/`. The
	* content config sits next to `srcDir` (`./Source`), but `base` resolves
	* against the project root, which is why the paths start with `./Source`.
	* Nothing is fetched at build time: the files are the source of truth, and
	* no build ever reads the shadow store or the database.
	*/

const Timestamp = z.iso.datetime({ offset: true });

/** The identity as the site renders it inside a bookmark, a candidate or an author page. */
const Author = z.object({
	/** The handle without its `@`. */
	handle: z.string(),
	/** The display name the page rendered. */
	name: z.string(),
	/** Whether the page marked the account verified. */
	verified: z.boolean(),
});

/** One attachment, as the site renders it. */
const Media = z.object({
	/** What the attachment is; a link card is media because it is part of the post's payload. */
	kind: z.enum(["image", "video", "gif", "link"]),
	/** Where the attachment lives. */
	url: z.string(),
});

/** The counts the site shows. Every one is required: a record the pipeline wrote always carries all four. */
const Metrics = z.object({
	/** Reply count. */
	replies: z.number().int(),
	/** Repost count. */
	reposts: z.number().int(),
	/** Like count. */
	likes: z.number().int(),
	/** View count. */
	views: z.number().int(),
});

/** A published post, as the site's Bookmark collection keeps it. */
const Bookmark = z.object({
	/** X status id - the same key the file store uses, and the filename it becomes. */
	id: z.string(),
	/** The permalink the page showed. */
	url: z.url(),
	/** The account behind the post, as the page showed it. */
	author: Author,
	/** The post's text, as the page rendered it. */
	text: z.string(),
	/** When the post was written, when the page showed it. Null when it did not. */
	postedAt: Timestamp.nullable(),
	/** Every image, video, gif and link card the post carries. */
	media: z.array(Media),
	/** The counts as the last scrape saw them. */
	metrics: Metrics,
	/** When this pipeline first saw the post - never when it was saved. */
	firstSeenAt: Timestamp,
	/** When the post's fields were last read from the page. */
	scrapedAt: Timestamp,
	/** The configured list slugs the distribution stage filed this author under. */
	lists: z.array(z.string()),
	/** The network the post came from. One value today, and still a field: a second source would change the meaning of every record. */
	source: z.literal("x"),
	/** When this post was first copied into the collection. */
	publishedAt: Timestamp,
});

/** The decision an author page carries. The arithmetic behind it stays out of the site: a page states a decision, not a score. */
const Decision = z.object({
	/** Who decided. `manual` is the person's own answer and no classifier may replace it. */
	by: z.enum(["rule", "model", "manual"]),
	/** How strongly the evidence supported it, 0 to 1. */
	confidence: z.number().optional(),
	/** The evidence the decision names, in prose. */
	reason: z.string().optional(),
});

/** One author page: the identity, what the archive holds of it, and how it was filed. */
const Person = z.object({
	/** The handle without its `@`. */
	handle: z.string(),
	/** The display name the archive last saw. */
	name: z.string(),
	/** Whether the page marked the account verified. */
	verified: z.boolean(),
	/** When this pipeline first saw the account. */
	firstSeenAt: Timestamp,
	/** How many posts of this account the collection holds. */
	postCount: z.number().int(),
	/** The configured list slugs this author was filed under. */
	lists: z.array(z.string()),
	/** How the filing was reached, or null when no classifier has answered yet. */
	decision: Decision.nullable(),
});

/** The event trail the site publishes. */
const Event = z.object({
	/** When it happened. */
	at: Timestamp,
	/** What happened. A closed set: a new kind is a schema change, not a string a caller may invent. */
	kind: z.enum(["scrape.started", "scrape.finished", "bookmark.added", "bookmark.removed", "list.assigned", "list.removed", "bookmark.published", "bookmark.hidden", "vote.nominated", "vote.cast", "vote.approved", "vote.rejected", "vote.ranked"]),
	/** What it happened to - a status id, a source, a list slug. */
	subject: z.string(),
	/** Whatever the kind needs to say. Opaque, so a new event shape needs no migration. */
	payload: z.record(z.string(), z.unknown()).default({}),
});

/** A candidate the site lists on `/Voted/`. The counts are a snapshot, never a live number. */
const Voted = z.object({
	/** The status id, or a slug derived from a URL that carries none. */
	id: z.string(),
	/** The permalink being voted on. */
	url: z.url(),
	/** Optional short label; the site falls back to the URL. */
	title: z.string().optional(),
	/** Optional reason the owner nominated it. */
	note: z.string().optional(),
	/** The account behind the link. */
	author: Author,
	/** The person's own list slugs - open strings, never an enum. */
	lists: z.array(z.string()),
	/** The count on file, refreshed by `maintain vote sync`. */
	votes: z.number().int(),
	/** When `votes` was last observed to change. */
	votedAt: Timestamp,
	/** When the candidate entered the index. */
	nominatedAt: Timestamp,
	/** Where the candidate stands. A rejection is a tombstone, not a deletion. */
	status: z.enum(["candidate", "approved", "rejected"]),
});

/** One curated entry. `rank` is written by the owner, because curation exists to overrule a crowd. */
const Curated = z.object({
	/** Points at the Voted or Bookmark record by id; the payload is never copied. */
	id: z.string(),
	/** Dense and unique, 1..N, written by the owner rather than derived from votes. */
	rank: z.number().int(),
	/** The count frozen at approval time, which is what keeps the build reproducible. */
	votes: z.number().int(),
	/** When the owner approved it. */
	approvedAt: Timestamp,
	/** Who approved it. */
	approvedBy: z.string(),
});

/** A published post, as the site's Bookmark collection keeps it. */
const BookmarkCollection = defineCollection({
	loader: glob({ pattern: "**/*.json", base: "./Source/Content/Bookmark" }),
	schema: Bookmark,
});

/** One author page: the identity, what the archive holds of it, and how it was filed. */
const PersonCollection = defineCollection({
	loader: glob({ pattern: "**/*.json", base: "./Source/Content/Author" }),
	schema: Person,
});

/** The event trail the site publishes. */
const EventCollection = defineCollection({
	loader: glob({ pattern: "**/*.json", base: "./Source/Content/Event" }),
	schema: Event,
});

/** A candidate the site lists on `/Voted/`. The counts are a snapshot, never a live number. */
const VotedCollection = defineCollection({
	loader: glob({ pattern: "**/*.json", base: "./Source/Content/Voted" }),
	schema: Voted,
});

/** One curated entry. `rank` is written by the owner, because curation exists to overrule a crowd. */
const CuratedCollection = defineCollection({
	loader: glob({ pattern: "**/*.json", base: "./Source/Content/Curated" }),
	schema: Curated,
});

/** Every collection the site builds from. */
export const collections = {
	Bookmark: BookmarkCollection,
	Author: PersonCollection,
	Event: EventCollection,
	Voted: VotedCollection,
	Curated: CuratedCollection,
};

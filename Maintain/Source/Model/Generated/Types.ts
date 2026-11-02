// Generated from Maintain/Source/Model/Schema/Entities.ts - do not edit.
//
// `pnpm run Schema` rewrites this file; `pnpm run check` fails while it is
// stale. A field that needs to exist belongs in the declaration, never here.

/** A post as the shadow store keeps it: the record plus the archive bookkeeping. */
export type PostRecord = {
	/** X status id - the same key the file store uses, and the filename it becomes. */
	id: string;
	/** The permalink the page showed. */
	url: string;
	/** The account behind the post, as the page showed it. */
	author: Author;
	/** The post's text, as the page rendered it. */
	text: string;
	/** When the post was written, when the page showed it. Null when it did not. */
	postedAt: string | null;
	/** Every image, video, gif and link card the post carries. */
	media: MediaItem[];
	/** The counts as the last scrape saw them. */
	metrics: Metrics;
	/** Every channel that has shown this post, and when each first did. */
	observations: Observation[];
	/** When this pipeline first saw the post - never when it was saved. */
	firstSeenAt: string;
	/** When the post's fields were last read from the page. */
	lastScrapedAt: string;
	/** The only field that decides whether the post may reach the site. */
	visibility: "shadow" | "public" | "hidden";
	/** The configured list slugs the distribution stage filed this author under. */
	lists: string[];
};

/** The account behind a post, as the page shows it. */
export type Author = {
	/** The handle without its `@`. */
	handle: string;
	/** The display name the page rendered. */
	name: string;
	/** Whether the page marked the account verified. */
	verified: boolean;
};

/** One author record in the site's content collection: `Source/Content/Author/<handle>.json`. */
export type AuthorRecord = {
	/** The handle without its `@`. */
	handle: string;
	/** The display name the archive last saw. */
	name: string;
	/** Whether the page marked the account verified. */
	verified: boolean;
	/** When this pipeline first saw the account. */
	firstSeenAt: string;
	/** How many posts of this account the collection holds. */
	postCount: number;
	/** The configured list slugs this author was filed under. */
	lists: string[];
	/** How the filing was reached, or null when no classifier has answered yet. */
	decision: DecisionRecord | null;
};

/** One image, video, gif or link card attached to a post. */
export type MediaItem = {
	/** What the attachment is; a link card is media because it is part of the post's payload. */
	kind: "image" | "video" | "gif" | "link";
	/** Where the attachment lives. */
	url: string;
};

/** The engagement counts a post carries, as the last scrape saw them. */
export type Metrics = {
	/** Reply count. */
	replies: number;
	/** Repost count. */
	reposts: number;
	/** Like count. */
	likes: number;
	/** View count. */
	views: number;
};

/** One channel that has shown a post, and when it first did. */
export type Observation = {
	/** The channel that showed it. */
	source: "bookmark" | "like" | "history";
	/** When this source first showed the post - never when it was saved. */
	at: string;
};

/** One append-only line: a channel showed a post, at a moment. */
export type ObservationRecord = {
	/** When this source first showed the post - never when it was saved. */
	at: string;
	/** The channel that showed it. */
	source: "bookmark" | "like" | "history";
	/** The post this observation is about. */
	statusId: string;
	/** What happened: the archive saw it, published it, or withheld it. */
	action: "observed" | "published" | "hidden";
};

/** A fact with a timestamp and a subject: what happened, to what, when. */
export type EventRecord = {
	/** When it happened. */
	at: string;
	/** What happened. A closed set: a new kind is a schema change, not a string a caller may invent. */
	kind: "scrape.started" | "scrape.finished" | "bookmark.added" | "bookmark.removed" | "list.assigned" | "list.removed" | "bookmark.published" | "bookmark.hidden" | "vote.nominated" | "vote.cast" | "vote.approved" | "vote.rejected" | "vote.ranked";
	/** What it happened to - a status id, a source, a list slug. */
	subject: string;
	/** Whatever the kind needs to say. Opaque, so a new event shape needs no migration. */
	payload: Record<string, unknown>;
};

/** The latest filing decision for one account under one list. */
export type MembershipRecord = {
	/** The configured list slug. */
	list: string;
	/** The account that was filed. */
	handle: string;
	/** Who decided: a weighted rule, the model pass, or the owner. */
	by: "rule" | "model" | "manual";
	/** How strongly the evidence supported it, 0 to 1. */
	confidence: number;
	/** The evidence the decision names, in prose. */
	reason: string;
	/** When the decision was recorded. */
	at: string;
};

/** How an author's filing was reached. */
export type DecisionRecord = {
	/** Who decided. `manual` is the person's own answer and no classifier may replace it. */
	by: "rule" | "model" | "manual";
	/** How strongly the evidence supported it, 0 to 1. */
	confidence?: number;
	/** The rules' weighted score, or the model's equivalent. */
	score?: number;
	/** The score's lead over the runner-up. */
	gap?: number;
	/** The evidence the decision names, in prose. */
	reason?: string;
};

/** One candidate in the Voted index: the post, why it is here, and how many votes it has. */
export type VotedRecord = {
	/** The status id, or a slug derived from a URL that carries none. */
	id: string;
	/** The permalink being voted on. */
	url: string;
	/** Optional short label; the site falls back to the URL. */
	title?: string;
	/** Optional reason the owner nominated it. */
	note?: string;
	/** The account behind the link. */
	author: Author;
	/** The person's own list slugs - open strings, never an enum. */
	lists: string[];
	/** The count on file, refreshed by `maintain vote sync`. */
	votes: number;
	/** When `votes` was last observed to change. */
	votedAt: string;
	/** When the candidate entered the index. */
	nominatedAt: string;
	/** Where the candidate stands. A rejection is a tombstone, not a deletion. */
	status: "candidate" | "approved" | "rejected";
};

/** One entry of the Curated index - the only thing the homepage leads with. */
export type CuratedRecord = {
	/** Points at the Voted or Bookmark record by id; the payload is never copied. */
	id: string;
	/** Dense and unique, 1..N, written by the owner rather than derived from votes. */
	rank: number;
	/** The count frozen at approval time, which is what keeps the build reproducible. */
	votes: number;
	/** When the owner approved it. */
	approvedAt: string;
	/** Who approved it. */
	approvedBy: string;
};

/** The site's view of post: `Bookmark` in `Source/content.config.ts`. */
export type SiteBookmark = {
	/** X status id - the same key the file store uses, and the filename it becomes. */
	id: string;
	/** The permalink the page showed. */
	url: string;
	/** The account behind the post, as the page showed it. */
	author: SiteAuthor;
	/** The post's text, as the page rendered it. */
	text: string;
	/** When the post was written, when the page showed it. Null when it did not. */
	postedAt: string | null;
	/** Every image, video, gif and link card the post carries. */
	media: SiteMedia[];
	/** The counts as the last scrape saw them. */
	metrics: SiteMetrics;
	/** When this pipeline first saw the post - never when it was saved. */
	firstSeenAt: string;
	/** When the post's fields were last read from the page. */
	scrapedAt: string;
	/** The configured list slugs the distribution stage filed this author under. */
	lists: string[];
	/** The network the post came from. One value today, and still a field: a second source would change the meaning of every record. */
	source: "x";
	/** When this post was first copied into the collection. */
	publishedAt: string;
};

/** The site's view of author: `Author` in `Source/content.config.ts`. */
export type SiteAuthor = {
	/** The handle without its `@`. */
	handle: string;
	/** The display name the page rendered. */
	name: string;
	/** Whether the page marked the account verified. */
	verified: boolean;
};

/** The site's view of person: `Person` in `Source/content.config.ts`. */
export type SitePerson = {
	/** The handle without its `@`. */
	handle: string;
	/** The display name the archive last saw. */
	name: string;
	/** Whether the page marked the account verified. */
	verified: boolean;
	/** When this pipeline first saw the account. */
	firstSeenAt: string;
	/** How many posts of this account the collection holds. */
	postCount: number;
	/** The configured list slugs this author was filed under. */
	lists: string[];
	/** How the filing was reached, or null when no classifier has answered yet. */
	decision: SiteDecision | null;
};

/** The site's view of media: `Media` in `Source/content.config.ts`. */
export type SiteMedia = {
	/** What the attachment is; a link card is media because it is part of the post's payload. */
	kind: "image" | "video" | "gif" | "link";
	/** Where the attachment lives. */
	url: string;
};

/** The site's view of metrics: `Metrics` in `Source/content.config.ts`. */
export type SiteMetrics = {
	/** Reply count. */
	replies: number;
	/** Repost count. */
	reposts: number;
	/** Like count. */
	likes: number;
	/** View count. */
	views: number;
};

/** The site's view of event: `Event` in `Source/content.config.ts`. */
export type SiteEvent = {
	/** When it happened. */
	at: string;
	/** What happened. A closed set: a new kind is a schema change, not a string a caller may invent. */
	kind: "scrape.started" | "scrape.finished" | "bookmark.added" | "bookmark.removed" | "list.assigned" | "list.removed" | "bookmark.published" | "bookmark.hidden" | "vote.nominated" | "vote.cast" | "vote.approved" | "vote.rejected" | "vote.ranked";
	/** What it happened to - a status id, a source, a list slug. */
	subject: string;
	/** Whatever the kind needs to say. Opaque, so a new event shape needs no migration. */
	payload: Record<string, unknown>;
};

/** The site's view of decision: `Decision` in `Source/content.config.ts`. */
export type SiteDecision = {
	/** Who decided. `manual` is the person's own answer and no classifier may replace it. */
	by: "rule" | "model" | "manual";
	/** How strongly the evidence supported it, 0 to 1. */
	confidence?: number;
	/** The evidence the decision names, in prose. */
	reason?: string;
};

/** The site's view of voted: `Voted` in `Source/content.config.ts`. */
export type SiteVoted = {
	/** The status id, or a slug derived from a URL that carries none. */
	id: string;
	/** The permalink being voted on. */
	url: string;
	/** Optional short label; the site falls back to the URL. */
	title?: string;
	/** Optional reason the owner nominated it. */
	note?: string;
	/** The account behind the link. */
	author: SiteAuthor;
	/** The person's own list slugs - open strings, never an enum. */
	lists: string[];
	/** The count on file, refreshed by `maintain vote sync`. */
	votes: number;
	/** When `votes` was last observed to change. */
	votedAt: string;
	/** When the candidate entered the index. */
	nominatedAt: string;
	/** Where the candidate stands. A rejection is a tombstone, not a deletion. */
	status: "candidate" | "approved" | "rejected";
};

/** The site's view of curated: `Curated` in `Source/content.config.ts`. */
export type SiteCurated = {
	/** Points at the Voted or Bookmark record by id; the payload is never copied. */
	id: string;
	/** Dense and unique, 1..N, written by the owner rather than derived from votes. */
	rank: number;
	/** The count frozen at approval time, which is what keeps the build reproducible. */
	votes: number;
	/** When the owner approved it. */
	approvedAt: string;
	/** Who approved it. */
	approvedBy: string;
};

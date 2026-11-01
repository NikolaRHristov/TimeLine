import type { Author } from "../../Model/Author/Author.ts";
import type { ListSlug } from "../../Model/List/List.ts";
import type { Media, Metrics } from "../../Model/Post/Post.ts";

/**
 * The three channels a post can be seen through.
 *
 * They are observations, not kinds of record: a post liked and bookmarked is
 * one record with two observations.
 */
export const Source = ["bookmark", "like", "history"] as const;

export type Source = (typeof Source)[number];

/**
 * `shadow` is the default - archived and never published. `public` has a file
 * in the content collection. `hidden` is a tombstone: it outlives a re-scrape,
 * so withholding a post is a state rather than a deletion.
 */
export const Visibility = ["shadow", "public", "hidden"] as const;

export type Visibility = (typeof Visibility)[number];

/** `at` is when this source first showed the post - never when it was saved. */
export type Observation = { source: Source; at: string };

/** One append-only line in `Observation.jsonl`. */
export type ObservationEntry = {
	at: string;
	source: Source;
	statusId: string;
	action: "observed" | "published" | "hidden";
};

/** A post as the shadow store keeps it: the record plus the archive bookkeeping. */
export type ShadowPost = {
	id: string;
	url: string;
	author: Author;
	text: string;
	postedAt: string | null;
	media: Media[];
	metrics: Metrics;
	observations: Observation[];
	firstSeenAt: string;
	lastScrapedAt: string;
	visibility: Visibility;
	lists: ListSlug[];
};

/**
 * A post as the site keeps it.
 *
 * Same content, without `observations` or `visibility` - those describe the
 * archive, not the post. `firstSeenAt` is a lower bound on when the post was
 * saved; the interface never exposes that timestamp, so nothing here may claim
 * to be it.
 */
export type PublicBookmark = {
	id: string;
	url: string;
	author: Author;
	text: string;
	postedAt: string | null;
	media: Media[];
	metrics: Metrics;
	lists: ListSlug[];
	scrapedAt: string;
	firstSeenAt: string;
	source: "x";
	publishedAt: string;
};

/** The shadow record without its archive fields, plus the publish timestamp. */
export function project(post: ShadowPost, publishedAt: string): PublicBookmark {
	return {
		id: post.id,
		url: post.url,
		author: post.author,
		text: post.text,
		postedAt: post.postedAt,
		media: post.media,
		metrics: post.metrics,
		lists: post.lists,
		scrapedAt: post.lastScrapedAt,
		firstSeenAt: post.firstSeenAt,
		source: "x",
		publishedAt,
	};
}

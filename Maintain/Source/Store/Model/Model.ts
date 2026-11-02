import type { PostRecord, SiteBookmark } from "../../Model/Generated/Types.ts";

/**
 * The store's two views of a post, both rendered from the one declaration.
 *
 * `ShadowPost` is the `post` entity: the page reading plus the archive's own
 * bookkeeping. `PublicBookmark` is the site's projection of it. Neither is
 * written by hand here - the difference between them is declared in
 * `Model/Schema/Entities.ts`, which is what makes the difference checkable.
 */
export type {
	Observation,
	ObservationRecord as ObservationEntry,
	SiteBookmark as PublicBookmark,
	PostRecord as ShadowPost,
} from "../../Model/Generated/Types.ts";

/**
 * `shadow` is the default - archived and never published. `public` has a file
 * in the content collection. `hidden` is a tombstone: it outlives a re-scrape,
 * so withholding a post is a state rather than a deletion.
 */
export const Visibility = ["shadow", "public", "hidden"] as const;

export type Visibility = PostRecord["visibility"];

/** The shadow record without its archive fields, plus the publish timestamp. */
export function project(post: PostRecord, publishedAt: string): SiteBookmark {
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

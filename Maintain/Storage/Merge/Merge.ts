import type { Post } from "../../Model/Post/Post.ts";
import type { ShadowPost, Source } from "../Model/Model.ts";

export type MergeResult = {
	/** The record as it should now be written. */
	post: ShadowPost;
	/** True when the store had never seen this status id before. */
	isNew: boolean;
	/** True when a field other than the timestamps differs from what was on file. */
	changed: boolean;
};

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

/**
 * Fold one reading of a post into the record already on file.
 *
 * Identity is the status id, so a second source adds an observation and never a
 * second record. Three fields are owned by the archive rather than the page and
 * survive the fold untouched: `firstSeenAt` (the lower bound on when the post
 * was saved), `visibility` (`hidden` is a tombstone - no re-scrape may
 * resurrect it), and `lists` (stage 3's decisions, not the page's).
 *
 * An empty reading never erases a good one: the page shows a placeholder while
 * a media grid loads, and a run that caught the placeholder must not blank the
 * text it already had.
 */
export function merge(
	existing: ShadowPost | null,
	incoming: Post,
	observation: { source: Source; at: string },
): MergeResult {
	const at = observation.at;
	const base: ShadowPost = existing ?? {
		id: incoming.id,
		url: incoming.url,
		author: incoming.author,
		text: incoming.text,
		postedAt: incoming.postedAt,
		media: incoming.media,
		metrics: incoming.metrics,
		observations: [],
		firstSeenAt: at,
		lastScrapedAt: at,
		visibility: "shadow",
		lists: [],
	};

	const observations = [...base.observations];
	if (!observations.some((entry) => entry.source === observation.source)) {
		observations.push({ source: observation.source, at });
	}

	const post: ShadowPost = {
		id: base.id,
		url: incoming.url !== "" ? incoming.url : base.url,
		author: incoming.author.handle !== "" ? incoming.author : base.author,
		text: incoming.text !== "" ? incoming.text : base.text,
		postedAt: incoming.postedAt ?? base.postedAt,
		media: incoming.media.length > 0 ? incoming.media : base.media,
		metrics: incoming.metrics,
		observations,
		firstSeenAt: base.firstSeenAt,
		lastScrapedAt: at,
		visibility: base.visibility,
		lists: base.lists,
	};

	const changed =
		existing === null ||
		existing.url !== post.url ||
		existing.text !== post.text ||
		existing.postedAt !== post.postedAt ||
		!same(existing.author, post.author) ||
		!same(existing.media, post.media) ||
		!same(existing.metrics, post.metrics) ||
		existing.observations.length !== post.observations.length;

	return { post, isNew: existing === null, changed };
}

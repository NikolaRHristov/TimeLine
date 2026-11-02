import type { PostRecord } from "../Generated/Types.ts";

export type { MediaItem as Media, Metrics } from "../Generated/Types.ts";

/**
 * One post as a transport reads it off the page.
 *
 * Deliberately narrower than `PostRecord`: a page can show a permalink, an
 * author, the text, the attachments and the counts, and nothing else. The
 * archive bookkeeping - when it was first seen, whether it is published - is
 * the store's, not the page's, so deriving this by `Pick` keeps the reading a
 * subset of the record instead of a second declaration that could drift.
 */
export type Post = Pick<
	PostRecord,
	"id" | "url" | "author" | "text" | "postedAt" | "media" | "metrics"
>;

export const Post = {
	/**
	 * Status id from a permalink (`/handle/status/<id>`), or null when the string
	 * is not a post URL. Checked before a tab is opened, so `--url` fails fast.
	 */
	idFromHref(href: string): string | null {
		const match = /\/status\/(\d+)/.exec(href);
		return match === null ? null : (match[1] ?? null);
	},
};

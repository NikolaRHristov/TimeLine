import type { Author } from "../Author/Author.ts";

export type Media = { kind: "image" | "video" | "gif" | "link"; url: string };

export type Metrics = { replies: number; reposts: number; likes: number; views: number };

/** One post, keyed by its status id - never by its text. */
export type Post = {
	id: string;
	url: string;
	author: Author;
	text: string;
	postedAt: string | null;
	media: Media[];
	metrics: Metrics;
};

export const Post = {
	/**
	 * Status id from a permalink (`/handle/status/<id>`), or null when the string
	 * is not a post URL. Checked before a tab is opened, so `--url` fails fast.
	 */
	idFromHref(href: string): string | null {
		const match = /\/status\/(\d+)/.exec(href);
		return match === null ? null : match[1];
	},
};

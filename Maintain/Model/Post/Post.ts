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
	/** Status id from a permalink; null when the href is not `/handle/status/<id>`. */
	idFromHref(href: string): string | null {
		const match = /\/status\/(\d+)/.exec(href);
		return match ? match[1] : null;
	},

	urlFor(handle: string, id: string): string {
		return `https://x.com/${handle}/status/${id}`;
	},

	empty(): Post {
		return {
			id: "",
			url: "",
			author: { handle: "", name: "", verified: false },
			text: "",
			postedAt: null,
			media: [],
			metrics: { replies: 0, reposts: 0, likes: 0, views: 0 },
		};
	},
};

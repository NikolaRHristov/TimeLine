import type { Post } from "../Post/Post.ts";

/**
 * What one scrape is asked for, and what it answers.
 *
 * These live in `Model/` rather than beside the CDP driver because the value
 * crosses the transport seam: a command says how much to read, and every
 * transport reports the same numbers back. A type that lived in `Browser/`
 * would make the interface depend on the browser, which is the one direction
 * the seam exists to forbid.
 */
export type ScrapeOptions = {
	/** `--tab`: a CDP target id, or its index in `tab list`. */
	tab?: unknown;
	/** Stop once this many distinct posts have been read. */
	limit?: number | undefined;
	/** Stop after this many scrolls in a row that produced nothing new. */
	maxIdle?: number | undefined;
	/** How long one scroll may take to produce a new id, in milliseconds. */
	wait?: number;
	/** Walk every tab the page presents - `/i/history` holds Bookmarks and Likes. */
	followTabs?: boolean;
};

export type ScrapeResult = {
	/** Every distinct post seen, in the order the page first showed it. */
	posts: Post[];
	/** The pages actually walked, after redirects. */
	pages: string[];
	rounds: number;
	stopped: "limit" | "idle";
};

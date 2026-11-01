/** The account behind a post, as the page shows it. */
export type Author = {
	handle: string;
	name: string;
	verified: boolean;
};

export const Author = {
	/** Handle from a profile href (`/handle`); empty when the href is not a profile. */
	fromHref(href: string): string {
		const match = /^\/([A-Za-z0-9_]{1,30})\/?$/.exec(href);
		return match ? match[1] : "";
	},

	empty(): Author {
		return { handle: "", name: "", verified: false };
	},
};

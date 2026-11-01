/** The three curated lists; the slug is the only name a command may take. */
export type ListSlug = "AI" | "UI" | "CODE";

export const ListSlug = {
	values: ["AI", "UI", "CODE"] as const,
	is(value: unknown): value is ListSlug {
		return typeof value === "string" && (ListSlug.values as readonly string[]).includes(value);
	},
};

/** A list as configuration knows it: the id never appears on a command line. */
export type List = {
	slug: string;
	name: string;
	id: string;
	members?: string[];
};

export const List = {
	/** The list page for a configured list. */
	url(list: List): string {
		return `https://x.com/i/lists/${list.id}`;
	},
};

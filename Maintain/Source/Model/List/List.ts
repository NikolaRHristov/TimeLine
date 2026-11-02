/**
 * A list slug is configuration, not code.
 *
 * Nothing here enumerates the slugs: they come from the identifier map, so a
 * stranger's `alpha` is as valid as anyone's `AI`. A slug is the only name a
 * command may take; the list id never appears on a command line.
 */
export type ListSlug = string;

/** A list as configuration knows it: slug to type, id to open. */
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

	/** The configured slugs, in the order the map declares them. */
	slugs(lists: readonly List[]): string[] {
		return lists.map((entry) => entry.slug);
	},

	/** The one list a slug names; undefined when the map does not declare it. */
	find(lists: readonly List[], slug: string): List | undefined {
		return lists.find((entry) => entry.slug === slug);
	},
};

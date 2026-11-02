import { relative } from "node:path";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { load, root } from "../../../Configuration/Load/Load.ts";
import { Source as Sources, type Source } from "../../../Model/Source/Source.ts";
import type { Visibility } from "../../../Store/Model/Model.ts";
import { contentDirectory, shadowDirectory } from "../../../Store/Path/Path.ts";
import { open as openPublic } from "../../../Store/Public/Public.ts";
import { open as openShadow } from "../../../Store/Shadow/Shadow.ts";

/**
 * What each store holds, without reading any post's content.
 *
 * Counts per store, per visibility and per source are the three questions worth
 * asking before a publish: how much is archived, how much is out, and where it
 * came from.
 */
export const Definition: CommandDefinition = {
	path: ["store", "status"],
	summary: "Count what the shadow store and the site's collection hold.",
	options: [],
	async run(): Promise<unknown> {
		// The store's location is the identifier map's business, so a missing
		// map is `no-config` here too - with the copy command attached - rather
		// than a count of whatever the defaults happen to point at.
		load();
		const shadow = openShadow(shadowDirectory());
		const publicStore = openPublic(contentDirectory());
		const posts = shadow.all();

		const byVisibility: Record<Visibility, number> = {
			shadow: 0,
			public: 0,
			hidden: 0,
		};
		const bySource: Record<Source, number> = {
			bookmark: 0,
			like: 0,
			history: 0,
		};

		for (const post of posts) {
			byVisibility[post.visibility] = (byVisibility[post.visibility] ?? 0) + 1;
			for (const source of Sources) {
				if (post.observations.some((entry) => entry.source === source))
					bySource[source] += 1;
			}
		}

		return {
			shadow: {
				// Repository-relative: this repo is public, and an absolute path
				// would publish the machine's layout and the account name.
				directory: relative(root(), shadow.directory),
				posts: posts.length,
				byVisibility,
				bySource,
				observations: shadow.observationCount(),
				events: shadow.events().length,
			},
			public: {
				directory: relative(root(), publicStore.content),
				bookmarks: publicStore.ids().length,
				events: publicStore.events().length,
			},
		};
	},
};

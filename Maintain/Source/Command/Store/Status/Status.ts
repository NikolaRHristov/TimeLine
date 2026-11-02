import { relative } from "node:path";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { load, root } from "../../../Configuration/Load/Load.ts";
import * as Text from "../../../Content/Text.ts";
import { Source as Sources, type Source } from "../../../Model/Source/Source.ts";
import { connect } from "../../../Store/Database/Connect.ts";
import type { Visibility } from "../../../Store/Model/Model.ts";
import { contentDirectory } from "../../../Store/Path/Path.ts";
import { open as openPublic } from "../../../Store/Public/Public.ts";
import type { CommandContext } from "../../Context/Context.ts";

/**
 * What the archive and the site each hold, without reading any post's content.
 *
 * The archive is the database: it is the source of truth, so a count here is a
 * count of what the pipeline actually knows. The site is still files - a static
 * build reads `Source/Content/` and nothing else - so its counts come from the
 * collection.
 *
 * Counts per visibility and per source are the two questions worth asking
 * before a publish: how much is archived, and where it came from.
 */
export const Definition: CommandDefinition = {
	path: ["store", "status"],
	summary: Text.CommandStoreStatusSummary,
	options: [],
	async run(_context: CommandContext): Promise<unknown> {
		// The store's location is the identifier map's business, so a missing
		// map is `no-config` here too - with the copy command attached - rather
		// than a count of whatever the defaults happen to point at.
		load();
		const { store } = connect();
		const publicStore = openPublic(contentDirectory());

		const posts = await store.all();
		const counts = await store.counts();

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
			database: {
				name: store.name,
				posts: posts.length,
				byVisibility,
				bySource,
				observations: counts.observations,
				events: counts.events,
				authors: counts.authors,
				media: counts.media,
			},
			public: {
				directory: relative(root(), publicStore.content),
				bookmarks: publicStore.ids().length,
				events: publicStore.events().length,
			},
		};
	},
};

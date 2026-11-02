import { fail } from "../../Cli/Parser/Output/Failure.ts";
import { configurationPath } from "../../Configuration/Load/Load.ts";
import type { Configuration } from "../../Configuration/Schema/Schema.ts";

/**
 * The three channels a post can be seen through.
 *
 * They are observations, not kinds of record: a post liked and bookmarked is
 * one record with two observations.
 */
export const Source = ["bookmark", "like", "history"] as const;

export type Source = (typeof Source)[number];

export type Route = {
	url: string;
	/**
	 * True when the page is a container whose tabs are the actual feeds.
	 * `/i/history` holds `Bookmarks` and `Likes`; `/i/bookmarks` redirects to it.
	 */
	followTabs: boolean;
};

/** Where one source lives, from the identifier map. */
export function route(configuration: Configuration, source: Source): Route {
	switch (source) {
		case "bookmark":
			return { url: configuration.routes.bookmarks, followTabs: false };
		case "like":
			if (configuration.routes.likes === "") {
				throw fail(
					"no-config",
					"`profile` is not set, so the likes route is unknown",
					{
						expected: configurationPath(),
						field: "profile",
					},
				);
			}
			return { url: configuration.routes.likes, followTabs: false };
		case "history":
			return { url: configuration.routes.history, followTabs: true };
		default:
			throw fail("usage", `unknown source: ${String(source)}`, {
				values: Source,
			});
	}
}

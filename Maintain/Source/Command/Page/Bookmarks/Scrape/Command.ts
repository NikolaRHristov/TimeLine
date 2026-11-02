import { option } from "../../../../Cli/Parser/Argument/Option.ts";
import type { CommandDefinition } from "../../../../Cli/Parser/Parser.ts";
import { ingest } from "../../../../Ingest/Run/Run.ts";

/**
 * The bookmark-only shorthand for `store scrape --source bookmark`.
 *
 * It exists because reading the saved-posts page is the everyday action, and
 * `page bookmarks scrape` reads as what it does. The work is the same: shadow
 * store only, nothing published.
 */
export const Definition: CommandDefinition = {
	path: ["page", "bookmarks", "scrape"],
	summary:
		"Walk the saved-posts page and write every post into the shadow store.",
	options: [
		option("limit", "integer", "Stop after this many posts.", {
			default: 200,
		}),
		option(
			"max-idle",
			"integer",
			"Stop after this many scrolls that produced nothing new.",
			{ default: 3 },
		),
		option("tab", "string", "CDP target id from `tab list`, or its index."),
	],
	async run(values): Promise<unknown> {
		return ingest("bookmark", {
			tab: values["tab"],
			limit:
				typeof values["limit"] === "number"
					? values["limit"]
					: undefined,
			maxIdle:
				typeof values["max-idle"] === "number"
					? values["max-idle"]
					: undefined,
		});
	},
};

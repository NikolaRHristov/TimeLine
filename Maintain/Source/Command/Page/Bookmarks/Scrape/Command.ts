import { option } from "../../../../CLI/Parser/Argument/Option.ts";
import type { CommandDefinition } from "../../../../CLI/Parser/Parser.ts";
import * as Text from "../../../../Content/Text.ts";
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
	summary: Text.CommandPageBookmarksScrapeCommandSummary,
	options: [
		option("limit", "integer", Text.OptionPageBookmarksScrapeCommandLimit, {
			default: 200,
		}),
		option("max-idle", "integer", Text.OptionPageBookmarksScrapeCommandMaxidle, {
			default: 3,
		}),
		option("tab", "string", Text.OptionPageBookmarksScrapeCommandTab),
	],
	transport: "browser",
	async run(context): Promise<unknown> {
		return ingest("bookmark", context.transport, {
			tab: context.values["tab"],
			limit:
				typeof context.values["limit"] === "number" ? context.values["limit"] : undefined,
			maxIdle:
				typeof context.values["max-idle"] === "number"
					? context.values["max-idle"]
					: undefined,
		});
	},
};

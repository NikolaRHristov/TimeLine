import { option } from "../../../CLI/Parser/Argument/Option.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { load } from "../../../Configuration/Load/Load.ts";
import * as Text from "../../../Content/Text.ts";

export const Definition: CommandDefinition = {
	path: ["page", "bookmarks", "open"],
	summary: Text.CommandPageBookmarksOpenSummary,
	options: [option("tab", "string", Text.OptionPageBookmarksOpenTab)],
	transport: "browser",
	async run(context): Promise<unknown> {
		const configuration = load();
		// `onNotReady: "fail"`: the count is the answer, so a page that never
		// painted must not be reported as "0 posts".
		return context.transport.page(
			configuration.routes.bookmarks,
			{
				tab: context.values["tab"],
				ready: "articles",
				onNotReady: "fail",
			},
			async (page) => ({
				navigated: true,
				url: page.url,
				count: await page.articles(),
			}),
		);
	},
};

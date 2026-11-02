import { option } from "../../../CLI/Parser/Argument/Option.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { load } from "../../../Configuration/Load/Load.ts";

export const Definition: CommandDefinition = {
	path: ["page", "bookmarks", "open"],
	summary: "Show the saved-posts page and report how many posts it has.",
	options: [option("tab", "string", "CDP target id from `tab list`, or its index.")],
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

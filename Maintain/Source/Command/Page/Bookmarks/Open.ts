import { withPage } from "../../../Browser/Session/Page.ts";
import { option } from "../../../Cli/Parser/Argument/Option.ts";
import type { CommandDefinition } from "../../../Cli/Parser/Parser.ts";
import { load } from "../../../Configuration/Load/Load.ts";

export const Definition: CommandDefinition = {
	path: ["page", "bookmarks", "open"],
	summary: "Show the saved-posts page and report how many posts it has.",
	options: [option("tab", "string", "CDP target id from `tab list`, or its index.")],
	async run(values): Promise<unknown> {
		const configuration = load();
		// `fail`: the count is the answer, so a page that never painted must not
		// be reported as "0 posts".
		return withPage(
			configuration.routes.bookmarks,
			{
				tab: values["tab"],
				ready: 'document.querySelectorAll("article").length > 0',
				onNotReady: "fail",
			},
			async (context) => {
				const count = await context.session.evaluate<number>(
					'document.querySelectorAll("article").length',
				);
				return {
					navigated: true,
					url: context.href,
					count: typeof count === "number" ? count : 0,
				};
			},
		);
	},
};

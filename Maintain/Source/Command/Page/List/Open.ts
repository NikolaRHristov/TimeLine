import { option } from "../../../CLI/Parser/Argument/Option.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { load, requireList } from "../../../Configuration/Load/Load.ts";
import * as Text from "../../../Content/Text.ts";
import { List as ListModel } from "../../../Model/List/List.ts";

export const Definition: CommandDefinition = {
	path: ["page", "list", "open"],
	summary: Text.CommandPageListOpenSummary,
	options: [
		option("name", "string", Text.OptionPageListOpenName, {
			required: true,
		}),
	],
	transport: "browser",
	async run(context): Promise<unknown> {
		// The slug is not validated against a hardcoded set: `requireList` knows
		// the configured ones, so a stranger's `alpha` opens their list and an
		// unconfigured slug fails `unknown-list` naming what *is* configured.
		const configuration = load();
		const slug = String(context.values["name"]);
		const list = requireList(configuration, slug);

		const url = ListModel.url(list);
		// `onNotReady: "fail"`: "the list is open" is the whole answer, so a page
		// that never arrived must not be reported as one.
		return context.transport.page(
			url,
			{ ready: "list", timeout: 15_000, onNotReady: "fail" },
			async (page) => ({ navigated: true, slug, url: page.url }),
		);
	},
};

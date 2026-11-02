import type { CommandDefinition } from "../../../Cli/Parser/Parser.ts";
import { option } from "../../../Cli/Parser/Argument/Option.ts";
import { load, requireList } from "../../../Configuration/Load/Load.ts";
import { withPage } from "../../../Browser/Session/Page.ts";
import { readyExpression } from "../../../Browser/Selector/List.ts";
import { List as ListModel } from "../../../Model/List/List.ts";

export const Definition: CommandDefinition = {
	path: ["page", "list", "open"],
	summary: "Show one configured list; the id comes from the identifier map, never argv.",
	options: [option("name", "string", "Slug of a list declared in the identifier map.", { required: true })],
	async run(values): Promise<unknown> {
		// The slug is not validated against a hardcoded set: `requireList` knows
		// the configured ones, so a stranger's `alpha` opens their list and an
		// unconfigured slug fails `unknown-list` naming what *is* configured.
		const configuration = load();
		const slug = String(values["name"]);
		const list = requireList(configuration, slug);

		const url = ListModel.url(list);
		return withPage(url, { ready: readyExpression(), timeout: 15_000 }, async (context) => ({
			navigated: true,
			slug,
			url: context.href,
		}));
	},
};

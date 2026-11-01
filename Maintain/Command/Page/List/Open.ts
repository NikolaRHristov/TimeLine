import type { CommandDefinition } from "../../../Cli/Parser/Parser.ts";
import { option } from "../../../Cli/Parser/Argument/Option.ts";
import { fail } from "../../../Cli/Parser/Output/Failure.ts";
import { configurationPath, load } from "../../../Configuration/Load/Load.ts";
import { withPage } from "../../../Browser/Session/Page.ts";
import { readyExpression } from "../../../Browser/Selector/List.ts";
import type { ListSlug } from "../../../Model/List/List.ts";
import { ListSlug as Slug } from "../../../Model/List/List.ts";

export const Definition: CommandDefinition = {
	path: ["page", "list", "open"],
	summary: "Show one curated list; the id comes from the identifier map, never argv.",
	options: [
		option("name", "enum", "Which curated list to open.", { required: true, values: Slug.values }),
	],
	async run(values): Promise<unknown> {
		const configuration = load();
		const name = String(values.name);
		const slug = Slug.is(name) ? name : null;
		if (slug === null) throw fail("usage", `unknown list: ${name}`, { values: Slug.values });

		const list = configuration.lists[slug as ListSlug];
		if (list === undefined) {
			throw fail("no-config", `no list id configured for ${slug}`, {
				expected: configurationPath(),
				slug,
			});
		}

		const url = `https://x.com/i/lists/${list.id}`;
		return withPage(url, { ready: readyExpression(), timeout: 15_000 }, async (context) => ({
			navigated: true,
			slug,
			url: context.href,
		}));
	},
};

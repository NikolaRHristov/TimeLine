import { option } from "../../../CLI/Parser/Argument/Option.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { load, requireList } from "../../../Configuration/Load/Load.ts";
import { List as ListModel } from "../../../Model/List/List.ts";

export const Definition: CommandDefinition = {
	path: ["page", "list", "open"],
	summary: "Show one configured list; the id comes from the identifier map, never argv.",
	options: [
		option("name", "string", "Slug of a list declared in the identifier map.", {
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

import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { Tab as TabModel } from "../../../Model/Tab/Tab.ts";

export const Definition: CommandDefinition = {
	path: ["tab", "list"],
	summary: "List the page targets the CLI may drive.",
	options: [],
	transport: "browser",
	async run(context): Promise<unknown> {
		const tabs = await context.transport.tabs();
		return { tabs: tabs.map((tab) => TabModel.summary(tab)) };
	},
};

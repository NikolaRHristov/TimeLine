import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import * as Text from "../../../Content/Text.ts";
import { Tab as TabModel } from "../../../Model/Tab/Tab.ts";

export const Definition: CommandDefinition = {
	path: ["tab", "list"],
	summary: Text.CommandTabListSummary,
	options: [],
	transport: "browser",
	async run(context): Promise<unknown> {
		const tabs = await context.transport.tabs();
		return { tabs: tabs.map((tab) => TabModel.summary(tab)) };
	},
};

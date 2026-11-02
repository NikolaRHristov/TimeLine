import { discover } from "../../../Browser/Target/Discovery.ts";
import type { CommandDefinition } from "../../../Cli/Parser/Parser.ts";
import { connection } from "../../../Configuration/Load/Load.ts";
import { Tab as TabModel } from "../../../Model/Tab/Tab.ts";

export const Definition: CommandDefinition = {
	path: ["tab", "list"],
	summary: "List the page targets the CLI may drive.",
	options: [],
	async run(): Promise<unknown> {
		const tabs = await discover(connection());
		return { tabs: tabs.map((tab) => TabModel.summary(tab)) };
	},
};

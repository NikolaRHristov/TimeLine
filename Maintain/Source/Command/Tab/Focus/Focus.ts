import type { CommandDefinition } from "../../../Cli/Parser/Parser.ts";
import { option } from "../../../Cli/Parser/Argument/Option.ts";
import { connection } from "../../../Configuration/Load/Load.ts";
import { discover } from "../../../Browser/Target/Discovery.ts";
import { activate } from "../../../Browser/Target/Lifecycle.ts";
import { select } from "../../../Browser/Target/Select.ts";

export const Definition: CommandDefinition = {
	path: ["tab", "focus"],
	summary: "Bring one tab to the front.",
	options: [option("id", "string", "CDP target id from `tab list`.", { required: true })],
	async run(values): Promise<unknown> {
		const endpoint = connection();
		const tabs = await discover(endpoint);
		const tab = select(tabs, { id: String(values.id) });
		await activate(tab.id, endpoint);
		return { focused: true, id: tab.id };
	},
};

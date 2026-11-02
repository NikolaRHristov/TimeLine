import { option } from "../../../CLI/Parser/Argument/Option.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";

export const Definition: CommandDefinition = {
	path: ["tab", "focus"],
	summary: "Bring one tab to the front.",
	options: [
		option("id", "string", "CDP target id from `tab list`.", {
			required: true,
		}),
	],
	transport: "browser",
	async run(context): Promise<unknown> {
		return context.transport.focus(String(context.values["id"]));
	},
};

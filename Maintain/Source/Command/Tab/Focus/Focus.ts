import { option } from "../../../CLI/Parser/Argument/Option.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import * as Text from "../../../Content/Text.ts";

export const Definition: CommandDefinition = {
	path: ["tab", "focus"],
	summary: Text.CommandTabFocusSummary,
	options: [
		option("id", "string", Text.OptionTabFocusId, {
			required: true,
		}),
	],
	transport: "browser",
	async run(context): Promise<unknown> {
		return context.transport.focus(String(context.values["id"]));
	},
};

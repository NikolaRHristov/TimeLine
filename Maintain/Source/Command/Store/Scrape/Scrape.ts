import { option } from "../../../Cli/Parser/Argument/Option.ts";
import { fail } from "../../../Cli/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../Cli/Parser/Parser.ts";
import { ingest } from "../../../Ingest/Run/Run.ts";
import {
	Source as Sources,
	type Source,
} from "../../../Model/Source/Source.ts";

export const Definition: CommandDefinition = {
	path: ["store", "scrape"],
	summary:
		"Walk one source and write every post it shows into the shadow store.",
	options: [
		option("source", "enum", "Which channel to read.", {
			required: true,
			values: Sources,
		}),
		option("limit", "integer", "Stop after this many posts.", {
			default: 200,
		}),
		option(
			"max-idle",
			"integer",
			"Stop after this many scrolls that produced nothing new.",
			{ default: 3 },
		),
		option("tab", "string", "CDP target id from `tab list`, or its index."),
	],
	async run(values): Promise<unknown> {
		const name = String(values["source"]);
		if (!(Sources as readonly string[]).includes(name)) {
			throw fail("usage", `unknown source: ${name}`, { values: Sources });
		}
		return ingest(name as Source, {
			tab: values["tab"],
			limit:
				typeof values["limit"] === "number"
					? values["limit"]
					: undefined,
			maxIdle:
				typeof values["max-idle"] === "number"
					? values["max-idle"]
					: undefined,
		});
	},
};

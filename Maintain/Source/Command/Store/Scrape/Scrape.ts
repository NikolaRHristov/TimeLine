import { option } from "../../../CLI/Parser/Argument/Option.ts";
import { fail } from "../../../CLI/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { ingest } from "../../../Ingest/Run/Run.ts";
import { Source as Sources, type Source } from "../../../Model/Source/Source.ts";

export const Definition: CommandDefinition = {
	path: ["store", "scrape"],
	summary: "Walk one source and write every post it shows into the shadow store.",
	options: [
		option("source", "enum", "Which channel to read.", {
			required: true,
			values: Sources,
		}),
		option("limit", "integer", "Stop after this many posts.", {
			default: 200,
		}),
		option("max-idle", "integer", "Stop after this many scrolls that produced nothing new.", {
			default: 3,
		}),
		option("tab", "string", "CDP target id from `tab list`, or its index."),
	],
	// `store scrape` reads the browser and writes the archive, so it is not
	// transport-agnostic the way `store status`/`publish`/`hide` are.
	transport: "browser",
	async run(context): Promise<unknown> {
		const name = String(context.values["source"]);
		if (!(Sources as readonly string[]).includes(name)) {
			throw fail("usage", `unknown source: ${name}`, { values: Sources });
		}
		return ingest(name as Source, context.transport, {
			tab: context.values["tab"],
			limit:
				typeof context.values["limit"] === "number" ? context.values["limit"] : undefined,
			maxIdle:
				typeof context.values["max-idle"] === "number"
					? context.values["max-idle"]
					: undefined,
		});
	},
};

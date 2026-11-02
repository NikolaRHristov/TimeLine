import { option } from "../../../CLI/Parser/Argument/Option.ts";
import { fail } from "../../../CLI/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import * as Text from "../../../Content/Text.ts";
import { ingest } from "../../../Ingest/Run/Run.ts";
import { Source as Sources, type Source } from "../../../Model/Source/Source.ts";

export const Definition: CommandDefinition = {
	path: ["store", "scrape"],
	summary: Text.CommandStoreScrapeSummary,
	options: [
		option("source", "enum", Text.OptionStoreScrapeSource, {
			required: true,
			values: Sources,
		}),
		option("limit", "integer", Text.OptionStoreScrapeLimit, {
			default: 200,
		}),
		option("max-idle", "integer", Text.OptionStoreScrapeMaxidle, {
			default: 3,
		}),
		option("tab", "string", Text.OptionStoreScrapeTab),
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

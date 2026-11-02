import type { CommandDefinition } from "../../../Cli/Parser/Parser.ts";
import { collect } from "./Collect.ts";

/**
 * One compact evidence record per bookmarked author - and no model call.
 *
 * The folding itself lives in `Collect.ts`, because `author classify rules`
 * reads the same records: two commands that built evidence differently would
 * classify differently, and a classifier is only as good as the record it
 * reads. The record's shape, its exclusions and its determinism are documented
 * there.
 */
export const Definition: CommandDefinition = {
	path: ["author", "evidence", "build"],
	summary:
		"Build one compact evidence record per bookmarked author. No model call.",
	options: [],
	async run(): Promise<unknown> {
		return collect();
	},
};

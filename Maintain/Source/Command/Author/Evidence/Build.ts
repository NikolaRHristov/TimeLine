import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import * as Text from "../../../Content/Text.ts";
import type { CommandContext } from "../../Context/Context.ts";
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
	summary: Text.CommandAuthorEvidenceBuildSummary,
	options: [],
	async run(_context: CommandContext): Promise<unknown> {
		return collect();
	},
};

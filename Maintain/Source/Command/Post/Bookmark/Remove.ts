import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { dryRun, targetAlternatives, targetOf, targetOptions } from "../Target.ts";

export const Definition: CommandDefinition = {
	path: ["post", "bookmark", "remove"],
	summary: "Remove a bookmark, unless the post is not bookmarked.",
	options: [...targetOptions, dryRun],
	alternatives: targetAlternatives,
	transport: "write",
	async run(context): Promise<unknown> {
		const target = targetOf(context.values);
		const dry = context.values["dry-run"] === true;
		const outcome = await context.transport.setBookmark(
			target,
			false,
			dry ? { dryRun: true } : {},
		);
		if (dry) {
			return {
				dryRun: true,
				action: "bookmark remove",
				post: outcome.post,
				was: outcome.was,
			};
		}
		return { bookmarked: outcome.now, post: outcome.post, was: outcome.was };
	},
};

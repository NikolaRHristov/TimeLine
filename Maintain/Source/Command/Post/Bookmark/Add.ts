import { toggle, withPost } from "../../../Browser/Session/Post.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { dryRun, targetAlternatives, targetOptions } from "../Target.ts";

export const Definition: CommandDefinition = {
	path: ["post", "bookmark", "add"],
	summary: "Bookmark a post, unless it is already bookmarked.",
	options: [...targetOptions, dryRun],
	alternatives: targetAlternatives,
	async run(values): Promise<unknown> {
		return withPost(values, async (context) => {
			const post = { id: context.post.id, url: context.post.url };
			if (values["dry-run"] === true) {
				return {
					dryRun: true,
					action: "bookmark add",
					post,
					was: context.controls.bookmark.active,
				};
			}
			const outcome = await toggle(context, "bookmark", "add");
			return { bookmarked: outcome.now, post, was: outcome.was };
		});
	},
};

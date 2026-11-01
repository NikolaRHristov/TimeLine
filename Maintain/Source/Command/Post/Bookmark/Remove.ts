import type { CommandDefinition } from "../../../Cli/Parser/Parser.ts";
import { toggle, withPost } from "../../../Browser/Session/Post.ts";
import { dryRun, targetAlternatives, targetOptions } from "../Target.ts";

export const Definition: CommandDefinition = {
	path: ["post", "bookmark", "remove"],
	summary: "Remove a bookmark, unless the post is not bookmarked.",
	options: [...targetOptions, dryRun],
	alternatives: targetAlternatives,
	async run(values): Promise<unknown> {
		return withPost(values, async (context) => {
			const post = { id: context.post.id, url: context.post.url };
			if (values["dry-run"] === true) {
				return { dryRun: true, action: "bookmark remove", post, was: context.controls.bookmark.active };
			}
			const outcome = await toggle(context, "bookmark", "remove");
			return { bookmarked: outcome.now, post, was: outcome.was };
		});
	},
};

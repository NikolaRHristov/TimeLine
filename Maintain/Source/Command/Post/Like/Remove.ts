import { toggle, withPost } from "../../../Browser/Session/Post.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { dryRun, targetAlternatives, targetOptions } from "../Target.ts";

export const Definition: CommandDefinition = {
	path: ["post", "like", "remove"],
	summary: "Remove a like, unless the post is not liked.",
	options: [...targetOptions, dryRun],
	alternatives: targetAlternatives,
	async run(values): Promise<unknown> {
		return withPost(values, async (context) => {
			const post = { id: context.post.id, url: context.post.url };
			if (values["dry-run"] === true) {
				return {
					dryRun: true,
					action: "like remove",
					post,
					was: context.controls.like.active,
				};
			}
			const outcome = await toggle(context, "like", "remove");
			return { liked: outcome.now, post, was: outcome.was };
		});
	},
};

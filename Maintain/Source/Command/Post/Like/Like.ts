import { toggle, withPost } from "../../../Browser/Session/Post.ts";
import type { CommandDefinition } from "../../../Cli/Parser/Parser.ts";
import { dryRun, targetAlternatives, targetOptions } from "../Target.ts";

export const Definition: CommandDefinition = {
	path: ["post", "like"],
	summary: "Like a post, unless it is already liked.",
	options: [...targetOptions, dryRun],
	alternatives: targetAlternatives,
	async run(values): Promise<unknown> {
		return withPost(values, async (context) => {
			const post = { id: context.post.id, url: context.post.url };
			if (values["dry-run"] === true) {
				return {
					dryRun: true,
					action: "like",
					post,
					was: context.controls.like.active,
				};
			}
			const outcome = await toggle(context, "like", "add");
			return { liked: outcome.now, post, was: outcome.was };
		});
	},
};

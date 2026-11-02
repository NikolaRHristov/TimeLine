import { withPost } from "../../../Browser/Session/Post.ts";
import { option } from "../../../Cli/Parser/Argument/Option.ts";
import type { CommandDefinition } from "../../../Cli/Parser/Parser.ts";

export const Definition: CommandDefinition = {
	path: ["post", "extract"],
	summary: "Read one post out of a tab.",
	options: [
		option("tab", "string", "CDP target id from `tab list`, or its index.", { required: true }),
		option("index", "integer", "Zero-based article index on the page.", {
			default: 0,
		}),
	],
	async run(values): Promise<unknown> {
		return withPost(values, async (context) => ({ post: context.post }));
	},
};

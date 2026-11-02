import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { targetAlternatives, targetOf, targetOptions } from "../Target.ts";

export const Definition: CommandDefinition = {
	path: ["post", "extract"],
	summary: "Read one post, from the live page or from the shadow archive.",
	options: targetOptions,
	alternatives: targetAlternatives,
	transport: "read",
	async run(context): Promise<unknown> {
		// `source` is the transport's, not a branch here: a caller comparing two
		// readings must see one field differ and nothing else.
		return {
			post: await context.transport.post(targetOf(context.values)),
			source: context.transport.source,
		};
	},
};

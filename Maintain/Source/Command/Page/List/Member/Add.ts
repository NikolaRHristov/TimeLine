import { flag } from "../../../../CLI/Parser/Argument/Flag.ts";
import { option } from "../../../../CLI/Parser/Argument/Option.ts";
import { fail } from "../../../../CLI/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../../CLI/Parser/Parser.ts";
import { handle } from "../../../../Model/List/Member.ts";

/**
 * One handle into one curated list, and nothing else.
 *
 * The default is a dry run on purpose: this is the command a distribution pass
 * calls in a loop, and the safe thing for a loop to do by accident is nothing.
 * `--apply` is the only way a membership is written, and a handle that is
 * already on the list is reported as `alreadyMember` rather than added twice.
 */
export const Definition: CommandDefinition = {
	path: ["page", "list", "member", "add"],
	summary: "Add one handle to one curated list; a dry run unless --apply.",
	options: [
		option("name", "string", "Slug of a list declared in the identifier map.", {
			required: true,
		}),
		option("handle", "string", "Handle to add, with or without the leading @.", {
			required: true,
		}),
		flag("apply", "Write the membership. Without this flag nothing is changed."),
		flag(
			"dry-run",
			"Report what would happen. This is the default; the flag only makes it explicit.",
		),
	],
	transport: "write",
	async run(context): Promise<unknown> {
		const requested = String(context.values["handle"]);
		// The configured set is the only authority on what a list is called; the
		// transport resolves the slug, so this command never reads the map.
		const normalized = handle(requested);
		if (normalized === null) {
			throw fail("usage", `not a handle: ${requested}`, {
				handle: requested,
				expected: "letters, digits and underscore, 15 at most",
			});
		}

		if (context.values["apply"] === true && context.values["dry-run"] === true) {
			throw fail("usage", "--apply and --dry-run ask for opposite things; pass one", {
				handle: normalized,
			});
		}

		return context.transport.listMember(String(context.values["name"]), normalized, {
			apply: context.values["apply"] === true,
		});
	},
};

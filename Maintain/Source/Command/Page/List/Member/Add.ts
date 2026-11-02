import { execute, withListMember } from "../../../../Browser/Session/ListMember.ts";
import { flag } from "../../../../Cli/Parser/Argument/Flag.ts";
import { option } from "../../../../Cli/Parser/Argument/Option.ts";
import { fail } from "../../../../Cli/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../../Cli/Parser/Parser.ts";
import { load, requireList } from "../../../../Configuration/Load/Load.ts";
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
	async run(values): Promise<unknown> {
		const configuration = load();
		const name = String(values["name"]);
		// The configured set is the only authority on what a list is called.
		const list = requireList(configuration, name);

		const requested = String(values["handle"]);
		const normalized = handle(requested);
		if (normalized === null) {
			throw fail("usage", `not a handle: ${requested}`, {
				handle: requested,
				expected: "letters, digits and underscore, 15 at most",
			});
		}

		if (values["apply"] === true && values["dry-run"] === true) {
			throw fail("usage", "--apply and --dry-run ask for opposite things; pass one", {
				handle: normalized,
			});
		}

		const apply = values["apply"] === true;
		return withListMember(normalized, async ({ surface, url }) => {
			const report = await execute(surface, {
				handle: normalized,
				name: list.name,
				apply,
			});
			return { ...report, url };
		});
	},
};

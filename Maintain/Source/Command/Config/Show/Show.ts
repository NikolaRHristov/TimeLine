import { option } from "../../../CLI/Parser/Argument/Option.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { configurationPath, load, requireList } from "../../../Configuration/Load/Load.ts";
import type { CommandContext } from "../../Context/Context.ts";

/**
 * A list id, masked.
 *
 * The point of `config show` is to answer "is this wired up?", not to print the
 * ids onto a shared terminal or into an agent's transcript. `--reveal` is the
 * deliberate opt-in.
 */
function mask(id: string): string {
	if (id.length <= 2) return "*".repeat(id.length);
	return `${"*".repeat(id.length - 2)}${id.slice(-2)}`;
}

export const Definition: CommandDefinition = {
	path: ["config", "show"],
	summary: "Print the resolved identifier map; list ids are masked unless --reveal.",
	options: [
		option("reveal", "boolean", "Print list ids instead of masking them."),
		option("list", "string", "Show only the configured list with this slug."),
	],
	async run(context: CommandContext): Promise<unknown> {
		const configuration = load();
		const reveal = context.values["reveal"] === true;
		const slug = context.values["list"];

		// A slug is resolved through the map, never against a hardcoded set: an
		// unconfigured slug fails `unknown-list` naming what *is* configured.
		const shown =
			slug === undefined ? configuration.lists : [requireList(configuration, String(slug))];

		return {
			path: configurationPath(),
			profile: configuration.profile,
			cdp: configuration.cdp,
			lists: shown.map((list) => ({
				slug: list.slug,
				name: list.name,
				id: reveal ? list.id : mask(list.id),
			})),
			routes: configuration.routes,
			content: configuration.content,
			storage: configuration.storage,
			spacetime: configuration.spacetime,
			masked: reveal !== true,
		};
	},
};

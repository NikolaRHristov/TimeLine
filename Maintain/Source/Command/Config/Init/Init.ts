import type { CommandDefinition } from "../../../Cli/Parser/Parser.ts";
import { option } from "../../../Cli/Parser/Argument/Option.ts";
import { fail } from "../../../Cli/Parser/Output/Failure.ts";
import { example } from "../../../Configuration/Load/Load.ts";
import type { Configuration } from "../../../Configuration/Schema/Schema.ts";
import { save } from "../../../Configuration/Write/Write.ts";
import type { List } from "../../../Model/List/List.ts";

/** A slug is the person's word for a list: letters, digits, dash, underscore. */
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** A handle as the interface spells it, without the leading `@`. */
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

/** `alpha=123456` → one configured list. */
function parseList(raw: string): List {
	const split = raw.indexOf("=");
	if (split <= 0 || split === raw.length - 1) {
		throw fail("usage", `--list expects <slug>=<id>, got ${raw}`, { value: raw, form: "--list alpha=123456" });
	}

	const slug = raw.slice(0, split).trim();
	const id = raw.slice(split + 1).trim();
	if (!SLUG.test(slug)) {
		throw fail("usage", `--list slug must match ${SLUG.source}, got ${slug}`, { value: raw, slug });
	}
	if (!/^\S+$/.test(id)) {
		throw fail("usage", `--list id must be one token, got ${id}`, { value: raw, id });
	}

	return { slug, name: slug, id };
}

/** The three commands that turn a written map into a built site. */
function next(configuration: Configuration): string[] {
	const steps: string[] = [];
	if (configuration.profile === "") steps.push("maintain config init --force --profile <your-handle>");
	if (configuration.lists.length === 0) steps.push("maintain config init --force --list <slug>=<list-id>");
	steps.push("maintain store scrape --source bookmark");
	steps.push("maintain store publish --all");
	steps.push("pnpm run build");
	return steps.slice(0, 3);
}

/**
 * Write the local identifier map - the onboarding entry point.
 *
 * It starts from the tracked example, so the written file carries exactly the
 * defaults the documentation describes, then applies whatever the caller
 * passed. It never asks a question: every value is a flag, which is what makes
 * it drivable by any agent.
 */
export const Definition: CommandDefinition = {
	path: ["config", "init"],
	summary: "Write the local identifier map from the tracked example; every value is a flag.",
	options: [
		option("profile", "string", "The handle whose bookmarks are being archived.", { format: "handle" }),
		option("list", "string", "One configured list, as <slug>=<id>. Repeat for more.", { repeat: true }),
		option("cdp-port", "integer", "Port of the browser's debugging endpoint."),
		option("force", "boolean", "Overwrite an existing identifier map."),
	],
	async run(values): Promise<unknown> {
		const configuration = example();

		const profile = values["profile"];
		if (profile !== undefined) {
			const handle = String(profile).trim().replace(/^@/, "");
			if (!HANDLE.test(handle)) {
				throw fail("usage", `--profile expects a handle, got ${String(profile)}`, {
					value: String(profile),
					form: "--profile your-handle",
				});
			}
			configuration.profile = handle;
			// The likes route follows the handle, and only now is it known.
			configuration.routes.likes = `https://x.com/${handle}/likes`;
		}

		const lists = Array.isArray(values["list"]) ? (values["list"] as string[]) : [];
		if (lists.length > 0) configuration.lists = lists.map(parseList);

		const port = values["cdp-port"];
		if (port !== undefined) {
			const number = Number(port);
			if (!Number.isInteger(number) || number < 1 || number > 65_535) {
				throw fail("usage", `--cdp-port expects a port between 1 and 65535, got ${String(port)}`, { value: port });
			}
			configuration.cdp.port = number;
		}

		const path = save(configuration, { force: values["force"] === true });

		return {
			written: path,
			profile: configuration.profile,
			lists: configuration.lists.map((list) => ({ slug: list.slug, name: list.name })),
			cdp: configuration.cdp,
			next: next(configuration),
		};
	},
};

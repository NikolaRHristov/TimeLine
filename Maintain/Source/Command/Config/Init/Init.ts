import { existsSync } from "node:fs";
import { option } from "../../../Cli/Parser/Argument/Option.ts";
import { fail, isFailure } from "../../../Cli/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../Cli/Parser/Parser.ts";
import { configurationPath, example, load } from "../../../Configuration/Load/Load.ts";
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
		throw fail("usage", `--list expects <slug>=<id>, got ${raw}`, {
			value: raw,
			form: "--list alpha=123456",
		});
	}

	const slug = raw.slice(0, split).trim();
	const id = raw.slice(split + 1).trim();
	if (!SLUG.test(slug)) {
		throw fail("usage", `--list slug must match ${SLUG.source}, got ${slug}`, {
			value: raw,
			slug,
		});
	}
	if (!/^\S+$/.test(id)) {
		throw fail("usage", `--list id must be one token, got ${id}`, {
			value: raw,
			id,
		});
	}

	return { slug, name: slug, id };
}

/** The three commands that turn a written map into a built site. */
function next(configuration: Configuration): string[] {
	const steps: string[] = [];
	if (configuration.profile === "")
		steps.push("maintain config init --force --profile <your-handle>");
	if (configuration.lists.length === 0)
		steps.push("maintain config init --force --list <slug>=<list-id>");
	steps.push("maintain store scrape --source bookmark");
	steps.push("maintain store publish --all");
	steps.push("pnpm run build");
	return steps.slice(0, 3);
}

/**
 * The map `config init` starts from.
 *
 * With `--force` on an existing map, the existing values are the base: the
 * onboarding sequence this command prints runs `init --force` once per fact
 * (the handle, then each list), and a later step must not undo an earlier one.
 * Without an existing map - or when the existing one cannot be read - the
 * tracked example is the base, because that is the only thing a fresh clone has.
 */
function base(force: boolean): Configuration {
	if (force) {
		try {
			return load();
		} catch (error) {
			// A corrupt map is exactly what `--force` is for: start over rather
			// than refusing to repair it, but never silently.
			if (!(isFailure(error) && error.code === "no-config")) {
				const detail = error instanceof Error ? error.message : String(error);
				process.stderr.write(
					`maintain: ${configurationPath()} is unreadable (${detail}); starting from the example\n`,
				);
			}
		}
	}
	return example();
}

/**
 * Write the local identifier map - the onboarding entry point.
 *
 * On a fresh clone it starts from the tracked example, so the written file
 * carries exactly the defaults the documentation describes. With `--force` it
 * starts from the map already on disk, so running it once per fact composes.
 * It never asks a question: every value is a flag, which is what makes it
 * drivable by any agent.
 */
export const Definition: CommandDefinition = {
	path: ["config", "init"],
	summary: "Write the local identifier map from the tracked example; every value is a flag.",
	options: [
		option("profile", "string", "The handle whose bookmarks are being archived.", {
			format: "handle",
		}),
		option("list", "string", "One configured list, as <slug>=<id>. Repeat for more.", {
			repeat: true,
		}),
		option("cdp-port", "integer", "Port of the browser's debugging endpoint."),
		option("force", "boolean", "Replace an existing map, keeping its values as the base."),
	],
	async run(values): Promise<unknown> {
		const force = values["force"] === true;
		const configuration = base(force);

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

		// One slug is one entry: `--list` replaces the entry it names and appends
		// the ones it does not, so wiring a second list does not drop the first.
		const lists = Array.isArray(values["list"]) ? (values["list"] as string[]) : [];
		for (const raw of lists) {
			const list = parseList(raw);
			const at = configuration.lists.findIndex((entry) => entry.slug === list.slug);
			if (at === -1) configuration.lists.push(list);
			else configuration.lists[at] = list;
		}

		const port = values["cdp-port"];
		if (port !== undefined) {
			const number = Number(port);
			if (!Number.isInteger(number) || number < 1 || number > 65_535) {
				throw fail(
					"usage",
					`--cdp-port expects a port between 1 and 65535, got ${String(port)}`,
					{ value: port },
				);
			}
			configuration.cdp.port = number;
		}

		// Read before writing: after `save` the file always exists, so the answer
		// to "was this an overwrite?" has to be taken first.
		const existed = existsSync(configurationPath());
		const path = save(configuration, { force });

		return {
			written: path,
			overwritten: existed,
			profile: configuration.profile,
			lists: configuration.lists.map((list) => ({
				slug: list.slug,
				name: list.name,
			})),
			cdp: configuration.cdp,
			next: next(configuration),
		};
	},
};

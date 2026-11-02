import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { option } from "../../../Cli/Parser/Argument/Option.ts";
import { fail } from "../../../Cli/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../Cli/Parser/Parser.ts";
import { load, root } from "../../../Configuration/Load/Load.ts";
import { EventKind } from "../../../Model/Event/Event.ts";
import { stringify } from "../../../Output/Json/Json.ts";

/** The event kinds the site's Event collection accepts. */
export const EVENT_KINDS = EventKind;

export const Definition: CommandDefinition = {
	path: ["event", "append"],
	summary: "Write one event file into the content directory.",
	options: [
		option("kind", "enum", "What happened.", {
			required: true,
			values: EVENT_KINDS,
		}),
		option("subject", "string", "What it happened to - a post id or an author handle.", {
			required: true,
		}),
		option("payload", "json", "Extra event data.", { default: {} }),
	],
	async run(values): Promise<unknown> {
		const configuration = load();
		const at = new Date().toISOString();
		const kind = String(values["kind"]);
		const subject = String(values["subject"]);
		const payload = values["payload"] ?? {};

		const directory = join(root(), configuration.content.root, "Event");
		const name = `${at.replace(/[:.]/g, "-")}-${kind}-${subject.replace(/[^A-Za-z0-9_-]+/g, "-")}.json`;
		const path = join(directory, name);
		try {
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, `${stringify({ at, kind, subject, payload })}\n`, "utf8");
		} catch (error) {
			throw fail("io-error", "could not write the event file", {
				path,
				reason: error instanceof Error ? error.message : String(error),
			});
		}

		return { written: true, path: relative(root(), path) };
	},
};

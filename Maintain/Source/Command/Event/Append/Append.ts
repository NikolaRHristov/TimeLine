import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { option } from "../../../CLI/Parser/Argument/Option.ts";
import { fail } from "../../../CLI/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { load, root } from "../../../Configuration/Load/Load.ts";
import * as Text from "../../../Content/Text.ts";
import { EventKind } from "../../../Model/Event/Event.ts";
import { stringify } from "../../../Output/Json/Json.ts";
import type { CommandContext } from "../../Context/Context.ts";

/** The event kinds the site's Event collection accepts. */
export const EVENT_KINDS = EventKind;

export const Definition: CommandDefinition = {
	path: ["event", "append"],
	summary: Text.CommandEventAppendSummary,
	options: [
		option("kind", "enum", Text.OptionEventAppendKind, {
			required: true,
			values: EVENT_KINDS,
		}),
		option("subject", "string", Text.OptionEventAppendSubject, {
			required: true,
		}),
		option("payload", "json", Text.OptionEventAppendPayload, { default: {} }),
	],
	async run(context: CommandContext): Promise<unknown> {
		const configuration = load();
		const at = new Date().toISOString();
		const kind = String(context.values["kind"]);
		const subject = String(context.values["subject"]);
		const payload = context.values["payload"] ?? {};

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

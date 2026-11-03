import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { option } from "../../../CLI/Parser/Argument/Option.ts";
import { fail } from "../../../CLI/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { root } from "../../../Configuration/Load/Load.ts";
import * as Text from "../../../Content/Text.ts";
import { EventKind, fileName } from "../../../Model/Event/Event.ts";
import { stringify } from "../../../Output/JSON/JSON.ts";
import { contentDirectory } from "../../../Store/Path/Path.ts";
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
		const at = new Date().toISOString();
		const kind = String(context.values["kind"]);
		const subject = String(context.values["subject"]);
		const payload = context.values["payload"] ?? {};

		// Both halves come from one place each: `contentDirectory()` says where
		// the collection is, `fileName()` says what the file is called. A name
		// built here instead would be a second copy of the flattening rule, and
		// this command writes into the directory the site reads - `a/b` and
		// `a?b` would share one file again, one overwriting the other.
		const directory = join(contentDirectory(), "Event");
		const path = join(directory, fileName(at, kind, subject));
		try {
			mkdirSync(directory, { recursive: true });
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

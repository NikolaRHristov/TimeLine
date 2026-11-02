import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { option } from "../../../Cli/Parser/Argument/Option.ts";
import { fail } from "../../../Cli/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../Cli/Parser/Parser.ts";
import { root } from "../../../Configuration/Load/Load.ts";
import type { EventRecord } from "../../../Model/Event/Event.ts";
import { contentDirectory, shadowDirectory } from "../../../Store/Path/Path.ts";

const sleep = (milliseconds: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

type Line = { file: string; record: EventRecord };

/**
 * Read the event directory, oldest first.
 *
 * The directory is the broker: a writer drops a file and a reader lists the
 * directory. Nothing is locked and nothing is acknowledged, which is what keeps
 * the pipeline runnable without a daemon.
 */
function list(directory: string): Line[] {
	let names: string[];
	try {
		names = readdirSync(directory).filter((name) => name.endsWith(".json"));
	} catch {
		return [];
	}

	const lines: Line[] = [];
	for (const name of names.sort()) {
		try {
			const value = JSON.parse(readFileSync(join(directory, name), "utf8")) as EventRecord;
			if (typeof value?.at === "string")
				lines.push({ file: join(directory, name), record: value });
		} catch {
			// A half-written file is the next poll's problem, not this one's.
		}
	}
	return lines.sort((left, right) => left.record.at.localeCompare(right.record.at));
}

/**
 * Print events, one JSON object per line.
 *
 * Without `--follow` this is a normal command: one object, then exit. With it,
 * the command never returns - it polls and prints, and Ctrl-C ends it. The
 * streaming mode deliberately breaks the one-object contract because a tail
 * that ended would not be a tail.
 */
export const Definition: CommandDefinition = {
	path: ["event", "tail"],
	summary: "Print the event log as JSON lines; --follow keeps printing new ones.",
	options: [
		option("follow", "boolean", "Keep polling and print events as they land."),
		option("dir", "enum", "Which event log to read.", {
			values: ["shadow", "public"],
			default: "shadow",
		}),
		option("since", "string", "Only print events at or after this timestamp."),
		option("interval", "integer", "Polling interval in milliseconds.", {
			default: 1000,
		}),
	],
	async run(values): Promise<unknown> {
		const which = String(values["dir"] ?? "shadow");
		const directory = join(
			which === "public" ? contentDirectory() : shadowDirectory(),
			"Event",
		);
		const since = typeof values["since"] === "string" ? values["since"] : null;
		const interval =
			typeof values["interval"] === "number" ? Math.max(values["interval"], 100) : 1000;

		if (since !== null && Number.isNaN(new Date(since).getTime())) {
			throw fail("usage", "--since is not a date", { value: since });
		}

		const after = (line: Line): boolean => since === null || line.record.at >= since;
		const initial = list(directory).filter(after);

		if (values["follow"] !== true) {
			// Repository-relative: the repo is public, so the machine's layout
			// never appears in a command's output.
			return {
				directory: relative(root(), directory),
				count: initial.length,
				events: initial.map((line) => line.record),
			};
		}

		const seen = new Set(initial.map((line) => line.file));
		for (const line of initial) process.stdout.write(`${JSON.stringify(line.record)}\n`);

		const stop = (): void => {
			process.exit(0);
		};
		process.on("SIGINT", stop);
		process.on("SIGTERM", stop);

		for (;;) {
			await sleep(interval);
			for (const line of list(directory)) {
				if (seen.has(line.file) || after(line) !== true) continue;
				seen.add(line.file);
				process.stdout.write(`${JSON.stringify(line.record)}\n`);
			}
		}
	},
};

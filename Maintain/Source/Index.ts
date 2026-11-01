#!/usr/bin/env node
import { commandHelp, commandList } from "./Cli/Parser/Output/Help.ts";
import { toFailure } from "./Cli/Parser/Output/Failure.ts";
import { parse } from "./Cli/Parser/Parser.ts";
import { commands } from "./Cli/Registry/Registry.ts";
import { schema } from "./Cli/Schema/Schema.ts";
import { stringify, write } from "./Output/Json/Json.ts";
import { render } from "./Output/Table/Table.ts";

/**
 * argv in, one JSON object out.
 *
 * `--help` and `--schema` are rendered from the same table the parser matched
 * against, so a new command needs no second description. A table on a TTY is a
 * rendering of the JSON object, never a second code path.
 */
async function main(argv: readonly string[]): Promise<void> {
	const parsed = parse(argv, commands);

	if (parsed.help === true) {
		process.stdout.write(parsed.command === null ? commandList(commands) : commandHelp(parsed.command));
		return;
	}
	if (parsed.command === null) return;

	if (parsed.schema === true) {
		write(schema(parsed.command));
		return;
	}

	const result = await parsed.command.run(parsed.values);
	const interactive = process.stdout.isTTY === true && parsed.json === false;
	process.stdout.write(interactive ? human(parsed.command.path, result) : `${stringify(result)}\n`);
}

/** The only table in the CLI: the same objects `tab list --json` prints. */
function human(path: readonly string[], result: unknown): string {
	if (path.join(" ") === "tab list" && result !== null && typeof result === "object") {
		const tabs = (result as { tabs?: Record<string, unknown>[] }).tabs ?? [];
		return render(tabs, [
			{ key: "active", header: "ACTIVE" },
			{ key: "id", header: "ID" },
			{ key: "title", header: "TITLE" },
			{ key: "url", header: "URL" },
		]);
	}
	return `${stringify(result)}\n`;
}

main(process.argv.slice(2)).catch((error: unknown) => {
	const failure = toFailure(error);
	if (process.env.MAINTAIN_DEBUG !== undefined) {
		process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
	}
	process.stdout.write(`${stringify(failure.toObject())}\n`);
	process.exitCode = 2;
});

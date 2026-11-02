import { universal, type CommandDefinition } from "../Parser.ts";

/** The command table, rendered from the same data the parser matches against. */
export function commandList(commands: readonly CommandDefinition[]): string {
	const width = Math.max(...commands.map((command) => command.path.join(" ").length));
	const lines = commands.map(
		(command) => `  ${command.path.join(" ").padEnd(width)}  ${command.summary}`,
	);
	return [
		"maintain - a clap-shaped CLI over the Chrome DevTools Protocol.",
		"",
		"Usage: pnpm maintain <group> <command> [options] [--json] [--schema] [--help]",
		"",
		"Commands:",
		...lines,
		"",
		"Every command prints one JSON object; failures exit 2 with an `error` code.",
		"",
	].join("\n");
}

/** One command's usage line and option table. */
export function commandHelp(command: CommandDefinition): string {
	const usage = ["pnpm maintain", ...command.path];
	for (const definition of command.options) {
		const placeholder = definition.kind === "integer" ? "n" : "value";
		const repeat = definition.repeat === true ? "..." : "";
		const token =
			definition.kind === "boolean"
				? `--${definition.name}${repeat}`
				: `--${definition.name} <${placeholder}>${repeat}`;
		usage.push(definition.required === true ? token : `[${token}]`);
	}
	usage.push("[--json] [--schema] [--help]");

	const rows = [
		...command.options.map((definition) => ({
			definition,
			required: definition.required === true,
		})),
		...universal.map((definition) => ({ definition, required: false })),
	];
	const nameWidth = Math.max(...rows.map(({ definition }) => `--${definition.name}`.length));
	const kindWidth = Math.max(...rows.map(({ definition }) => definition.kind.length));
	const lines = rows.map(({ definition, required }) => {
		const name = `--${definition.name}`.padEnd(nameWidth);
		const kind = definition.kind.padEnd(kindWidth);
		const values = definition.values ? ` (${definition.values.join("|")})` : "";
		const repeat = definition.repeat === true ? " repeatable" : "";
		const required_ = required ? " required" : "";
		return `  ${name}  ${kind}  ${definition.description}${values}${repeat}${required_}`;
	});

	return [
		`maintain ${command.path.join(" ")} - ${command.summary}`,
		"",
		`Usage: ${usage.join(" ")}`,
		"",
		"Options:",
		...lines,
		"",
	].join("\n");
}

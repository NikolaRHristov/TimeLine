import * as Text from "../../../Content/Text.ts";
import { fill } from "../../../Output/Text/Fill.ts";
import { universal, type CommandDefinition } from "../Parser.ts";

/**
 * The command table, rendered from the same data the parser matches against.
 *
 * The words come from `Content/String/CLI` through the `Text` index, so the help
 * text is editable without touching this file and costs nothing at run time: the
 * `define` map baked each one in at compile time. What stays here is the layout -
 * the blank lines, the padding, the separators - because that is the shape of the
 * table, not a sentence in it.
 */
export function commandList(commands: readonly CommandDefinition[]): string {
	const width = Math.max(...commands.map((command) => command.path.join(" ").length));
	const lines = commands.map(
		(command) => `  ${command.path.join(" ").padEnd(width)}  ${command.summary}`,
	);
	return [
		Text.CLITitle,
		"",
		Text.CLIUsageList,
		"",
		Text.CLICommands,
		...lines,
		"",
		Text.CLIContract,
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
		fill(Text.CLIHeadingCommand, { path: command.path.join(" "), summary: command.summary }),
		"",
		fill(Text.CLIUsageCommand, { usage: usage.join(" ") }),
		"",
		Text.CLIOptions,
		...lines,
		"",
	].join("\n");
}

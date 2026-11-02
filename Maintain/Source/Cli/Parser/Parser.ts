import type { Option } from "./Argument/Option.ts";
import { parseValue, takesValue } from "./Argument/Option.ts";
import { fail } from "./Output/Failure.ts";

export type Values = Record<string, unknown>;

/** A command: its path, the options it accepts, and the work it does. */
export type CommandDefinition = {
	/** Path as typed, e.g. `["post", "like", "remove"]`. */
	path: readonly string[];
	summary: string;
	options: readonly Option[];
	/** Option groups where one of each group is required, e.g. `[["url"], ["tab", "index"]]`. */
	alternatives?: readonly (readonly string[])[];
	run(values: Values): Promise<unknown>;
};

export type Parsed = {
	command: CommandDefinition | null;
	values: Values;
	help: boolean;
	schema: boolean;
	json: boolean;
};

/** Flags every command accepts. */
export const universal: readonly Option[] = [
	{ name: "help", kind: "boolean", description: "Print this command's options." },
	{ name: "schema", kind: "boolean", description: "Print this command's JSON Schema instead of running it." },
	{ name: "json", kind: "boolean", description: "Print JSON (implied when stdout is not a TTY)." },
];

function isFlag(token: string): boolean {
	return token.startsWith("--") && token.length > 2;
}

/**
 * Parse argv against the command table.
 *
 * Words before the first `--` token name the command; everything after it is an
 * option. The path must match in full, so `post like` never swallows
 * `post like remove`.
 */
export function parse(argv: readonly string[], commands: readonly CommandDefinition[]): Parsed {
	const tokens = [...argv];
	let split = tokens.findIndex(isFlag);
	if (split === -1) split = tokens.length;
	const words = tokens.slice(0, split);
	const rest = tokens.slice(split);

	if (words.length === 0) {
		const onlyHelp = rest.every((token) => token === "--help" || token === "--json");
		if (!onlyHelp) {
			throw fail("usage", "no command given", { commands: commands.map((command) => command.path.join(" ")) });
		}
		return { command: null, values: {}, help: true, schema: false, json: rest.includes("--json") };
	}

	const command = commands.find(
		(candidate) =>
			candidate.path.length === words.length &&
			candidate.path.every((word, index) => word === words[index]),
	);
	if (!command) {
		throw fail("usage", `unknown command: ${words.join(" ")}`, {
			commands: commands.map((candidate) => candidate.path.join(" ")),
		});
	}

	const known = new Map<string, Option>();
	for (const definition of [...command.options, ...universal]) known.set(definition.name, definition);

	const values: Values = {};
	for (const definition of command.options) {
		if (definition.default === undefined) continue;
		// An array default is cloned: every parse gets its own bucket, so a
		// repeatable option can never accumulate into the command table itself.
		values[definition.name] = Array.isArray(definition.default) ? [...definition.default] : definition.default;
	}

	for (let index = 0; index < rest.length; index += 1) {
		const token = rest[index]!;
		if (!isFlag(token)) {
			throw fail("usage", `unexpected argument: ${token}`, { command: command.path.join(" ") });
		}
		const body = token.slice(2);
		const equals = body.indexOf("=");
		const rawName = equals === -1 ? body : body.slice(0, equals);
		const inline = equals === -1 ? undefined : body.slice(equals + 1);
		const definition = known.get(rawName);
		if (!definition) {
			throw fail("usage", `unknown option: --${rawName}`, {
				command: command.path.join(" "),
				options: [...known.keys()].map((name) => `--${name}`),
			});
		}
		if (!takesValue(definition)) {
			values[rawName] = inline === undefined ? true : parseValue(definition, inline);
			continue;
		}
		const raw = inline ?? rest[index + 1];
		if (raw === undefined || (inline === undefined && isFlag(raw))) {
			throw fail("usage", `--${rawName} expects a value`, { command: command.path.join(" ") });
		}
		if (inline === undefined) index += 1;
		const value = parseValue(definition, raw);
		if (definition.repeat !== true) {
			values[rawName] = value;
			continue;
		}
		const bucket = Array.isArray(values[rawName]) ? (values[rawName] as unknown[]) : [];
		bucket.push(value);
		values[rawName] = bucket;
	}

	// `--help` and `--schema` describe a command rather than run it, so they must
	// not demand its arguments: a command with a required option has to be able
	// to document itself before the caller knows what to pass.
	if (values["help"] !== true && values["schema"] !== true) {
		for (const definition of command.options) {
			if (definition.required === true && values[definition.name] === undefined) {
				throw fail("usage", `--${definition.name} is required`, {
					command: command.path.join(" "),
					options: command.options.map((item) => `--${item.name}`),
				});
			}
		}
	}

	const parsed: Parsed = {
		command,
		values,
		help: values["help"] === true,
		schema: values["schema"] === true,
		json: values["json"] === true,
	};
	delete values["help"];
	delete values["schema"];
	delete values["json"];
	return parsed;
}

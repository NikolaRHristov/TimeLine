import type { Option } from "../Parser/Argument/Option.ts";
import { universal, type CommandDefinition } from "../Parser/Parser.ts";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";

/** The shape one occurrence has; a repeatable option is an array of these. */
function scalar(definition: Option): Record<string, unknown> {
	const shape: Record<string, unknown> = {};
	switch (definition.kind) {
		case "integer":
			shape["type"] = "integer";
			break;
		case "boolean":
			shape["type"] = "boolean";
			break;
		case "enum":
			shape["type"] = "string";
			shape["enum"] = [...(definition.values ?? [])];
			break;
		case "json":
			shape["type"] = [
				"object",
				"array",
				"string",
				"number",
				"boolean",
				"null",
			];
			break;
		default:
			shape["type"] = "string";
	}
	if (definition.format !== undefined) shape["format"] = definition.format;
	return shape;
}

/** One option as a JSON Schema property; the property name is the flag itself. */
function property(definition: Option): Record<string, unknown> {
	const shape: Record<string, unknown> =
		definition.repeat === true
			? { type: "array", items: scalar(definition) }
			: scalar(definition);
	shape["description"] = definition.description;
	if (definition.default !== undefined) shape["default"] = definition.default;
	return shape;
}

/**
 * The command's contract as JSON Schema 2020-12.
 *
 * Properties are named after the flags (`--url`), so a schema reader and the
 * help table speak the same words. Mutually exclusive argument groups become
 * `anyOf` of `required` lists.
 */
export function schema(command: CommandDefinition): Record<string, unknown> {
	const properties: Record<string, unknown> = {};
	for (const definition of [...command.options, ...universal]) {
		properties[`--${definition.name}`] = property(definition);
	}

	const document: Record<string, unknown> = {
		$schema: DRAFT,
		$id: `https://maintain.local/schema/${command.path.join("/")}.json`,
		title: `maintain ${command.path.join(" ")}`,
		description: command.summary,
		type: "object",
		properties,
		additionalProperties: false,
	};

	const required = command.options
		.filter((definition) => definition.required === true)
		.map((definition) => `--${definition.name}`);
	if (required.length > 0) document["required"] = required;

	if (command.alternatives !== undefined) {
		document["anyOf"] = command.alternatives.map((group) => ({
			required: group.map((name) => `--${name}`),
		}));
	}

	return document;
}

import { fail } from "../Output/Failure.ts";

export type OptionKind = "string" | "integer" | "boolean" | "enum" | "json";

/** One value option (`--url <u>`) or boolean flag (`--dry-run`). */
export type Option = {
	/** Name as typed, without the leading dashes. */
	name: string;
	kind: OptionKind;
	description: string;
	required?: boolean;
	/** Allowed values, for `kind: "enum"`. */
	values?: readonly string[];
	/** JSON Schema `format` hint, e.g. `uri`. */
	format?: string;
	default?: unknown;
};

export function option(
	name: string,
	kind: OptionKind,
	description: string,
	extra: Partial<Option> = {},
): Option {
	return { name, kind, description, ...extra };
}

/** Coerce one raw argv string into the option's kind; a bad value is a usage failure. */
export function parseValue(definition: Option, raw: string): unknown {
	switch (definition.kind) {
		case "string":
			return raw;
		case "integer": {
			if (!/^-?\d+$/.test(raw)) {
				throw fail("usage", `--${definition.name} expects an integer`, { value: raw });
			}
			return Number(raw);
		}
		case "boolean": {
			if (raw === "true") return true;
			if (raw === "false") return false;
			throw fail("usage", `--${definition.name} is a flag`, { value: raw });
		}
		case "json": {
			try {
				return JSON.parse(raw);
			} catch (error) {
				throw fail("usage", `--${definition.name} expects JSON`, {
					value: raw,
					reason: error instanceof Error ? error.message : String(error),
				});
			}
		}
		case "enum": {
			const values = definition.values ?? [];
			if (!values.includes(raw)) {
				throw fail("usage", `--${definition.name} expects one of ${values.join(", ")}`, {
					value: raw,
					values,
				});
			}
			return raw;
		}
		default:
			return raw;
	}
}

/** True when the option takes a value rather than standing alone. */
export function takesValue(definition: Option): boolean {
	return definition.kind !== "boolean";
}

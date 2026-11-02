import { Collections, Entities, entity } from "./Entities.ts";
import { fieldsFor, type Entity, type Field, type FieldMap } from "./Entity.ts";

/**
 * The three artifacts, rendered from the declaration.
 *
 * Rendering is pure text: no filesystem, no clock, no network. That is what
 * lets the same function produce the file that is written and the file that is
 * expected, so `--check` compares bytes instead of re-deriving the schema a
 * second way.
 *
 * Every artifact opens with the same "generated" header, and every artifact's
 * field order follows the declaration, so a diff between two runs shows exactly
 * which field moved.
 */

export type Artifact = { path: string; content: string };

/** Repo-relative, so the generator and the test agree on where each artifact lives. */
export const PATHS = {
	types: "Maintain/Source/Model/Generated/Types.ts",
	content: "Source/content.config.ts",
	module: "Maintain/Spacetime/spacetimedb/src/Schema.ts",
} as const;

const HEADER = [
	"// Generated from Maintain/Source/Model/Schema/Entities.ts - do not edit.",
	"//",
	"// `pnpm run Schema` rewrites this file; `pnpm run check` fails while it is",
	"// stale. A field that needs to exist belongs in the declaration, never here.",
].join("\n");

/** A JSDoc block, indented to sit inside a type or an object literal. */
function doc(text: string | undefined, indent: string): string {
	if (text === undefined || text === "") return "";
	const lines = text.split("\n");
	if (lines.length === 1) return `${indent}/** ${lines[0]} */\n`;
	return `${indent}/**\n${lines.map((line) => `${indent} * ${line}`.trimEnd()).join("\n")}\n${indent} */\n`;
}

/** A field rendered as a TypeScript property. */
function tsType(field: Field): string {
	let base: string;
	switch (field.kind) {
		case "string":
		case "timestamp":
			base = "string";
			break;
		case "integer":
		case "number":
			base = "number";
			break;
		case "boolean":
			base = "boolean";
			break;
		case "json":
			base = "Record<string, unknown>";
			break;
		case "enum":
			base = (field.values ?? []).map((value) => JSON.stringify(value)).join(" | ");
			break;
		case "object":
			base = field.of === undefined ? "unknown" : modelName(field.of);
			break;
		case "array":
			base = `${field.of === undefined ? "unknown" : arrayElement(field.of)}[]`;
			break;
	}
	return field.nullable === true ? `${base} | null` : base;
}

/** The TypeScript type an entity is declared as. */
function modelName(name: string): string {
	return entity(name).model.type;
}

/** The element type of an array field: a scalar's own name, or an entity's model type. */
function arrayElement(of: string): string {
	const scalar = of === "string" || of === "number" || of === "boolean";
	return scalar ? of : modelName(of);
}

/** A field rendered as a TypeScript property of a site type. */
function tsSiteType(field: Field): string {
	if (field.kind !== "object" && field.kind !== "array") return tsType(field);

	const of = field.of ?? "unknown";
	const scalar = of === "string" || of === "number" || of === "boolean";
	const element = scalar ? of : `Site${siteName(of)}`;
	const base = field.kind === "array" ? `${element}[]` : element;
	return field.nullable === true ? `${base} | null` : base;
}

/** A field rendered as a Zod expression. */
function zodType(field: Field): string {
	let base: string;
	switch (field.kind) {
		case "string":
			base = field.format === "url" ? "z.url()" : "z.string()";
			break;
		case "integer":
			base = "z.number().int()";
			break;
		case "number":
			base = "z.number()";
			break;
		case "boolean":
			base = "z.boolean()";
			break;
		case "timestamp":
			base = "Timestamp";
			break;
		case "json":
			base = "z.record(z.string(), z.unknown())";
			break;
		case "enum": {
			const values = field.values ?? [];
			// A one-value enum is a literal, not an enum: `z.enum` is for a choice.
			base =
				values.length === 1
					? `z.literal(${JSON.stringify(values[0])})`
					: `z.enum([${values.map((value) => JSON.stringify(value)).join(", ")}])`;
			break;
		}
		case "object":
			base = field.of === undefined ? "z.unknown()" : siteName(field.of);
			break;
		case "array": {
			const of = field.of ?? "unknown";
			const element =
				of === "string"
					? "z.string()"
					: of === "number"
						? "z.number()"
						: of === "boolean"
							? "z.boolean()"
							: siteName(of);
			base = `z.array(${element})`;
			break;
		}
	}
	if (field.nullable === true) base += ".nullable()";
	if (field.optional === true) base += ".optional()";
	if (field.fallback !== undefined) base += `.default(${field.fallback})`;
	return base;
}

/** The Zod const an entity's site shape is declared as. */
function siteName(name: string): string {
	const found = entity(name).site;
	if (found === undefined) throw new Error(`entity ${name} has no site shape`);
	return found.name;
}

/** The SpacetimeDB column expression for one field. */
function columnType(field: Field): string {
	const column =
		field.column ??
		(field.kind === "boolean"
			? "bool"
			: field.kind === "integer"
				? "u32"
				: field.kind === "number"
					? "f32"
					: "string");
	const base = `t.${column}()`;
	// SpacetimeDB has one notion of "may be absent": the option type. A field
	// the model calls nullable is exactly that here, so both markers collapse
	// into `.optional()` rather than inventing a second convention.
	return field.optional === true || field.nullable === true ? `${base}.optional()` : base;
}

/**
 * The site shapes in an order where a shape is declared before it is used.
 *
 * Zod consts are hoisted `const`s, so a forward reference would be a temporal
 * dead zone at module load - the file would throw before Astro ever read it.
 */
function siteOrder(): Entity[] {
	const shapes = Entities.filter((entry) => entry.site !== undefined);
	const emitted: Entity[] = [];
	const visiting = new Set<string>();

	const visit = (target: Entity): void => {
		if (emitted.includes(target) || visiting.has(target.name)) return;
		visiting.add(target.name);
		for (const field of Object.values(fieldsFor(target, "site"))) {
			if (field.kind !== "object" && field.kind !== "array") continue;
			const of = field.of;
			if (of === undefined) continue;
			const dependency = shapes.find((entry) => entry.name === of);
			if (dependency !== undefined) visit(dependency);
		}
		visiting.delete(target.name);
		emitted.push(target);
	};

	for (const shape of shapes) visit(shape);
	return emitted;
}

function renderFields(
	fields: FieldMap,
	render: (field: Field) => string,
	indent: string,
	markOptional: boolean,
	separator: "," | ";" = ",",
): string {
	const lines: string[] = [];
	for (const [name, field] of Object.entries(fields)) {
		const text = doc(field.doc, indent);
		if (text !== "") lines.push(text.trimEnd());
		const optional = markOptional && field.optional === true ? "?" : "";
		lines.push(`${indent}${name}${optional}: ${render(field)}${separator}`);
	}
	return lines.join("\n");
}

/** `Maintain/Source/Model/Generated/Types.ts`. */
export function renderTypes(): string {
	const blocks: string[] = [HEADER, ""];

	for (const entry of Entities) {
		blocks.push(doc(entry.model.doc ?? entry.doc, "").trimEnd());
		blocks.push(`export type ${entry.model.type} = {`);
		blocks.push(renderFields(entry.model.fields, tsType, "	", true, ";"));
		blocks.push("};");
		blocks.push("");
	}

	// The site's own view of an entity, where it has one. A separate type
	// rather than a `Pick` of the model, because the site drops, renames and
	// adds fields - the point of the projection is that it is not the model.
	for (const entry of Entities) {
		const site = entry.site;
		if (site === undefined) continue;
		blocks.push(
			doc(
				`The site's view of ${entry.name}: \`${site.name}\` in \`Source/content.config.ts\`.`,
				"",
			).trimEnd(),
		);
		blocks.push(`export type Site${site.name} = {`);
		blocks.push(renderFields(fieldsFor(entry, "site"), tsSiteType, "	", true, ";"));
		blocks.push("};");
		blocks.push("");
	}

	return `${blocks.join("\n").trimEnd()}\n`;
}

/** `Source/content.config.ts`. */
export function renderContent(): string {
	const blocks: string[] = [
		HEADER,
		"",
		'import { defineCollection } from "astro:content";',
		'import { glob } from "astro/loaders";',
		'import { z } from "astro/zod";',
		"",
		"/**",
		"	* The site's content is written by the pipeline, not by hand.",
		"	*",
		"	* Every collection is a `glob` over JSON under `Source/Content/`. The",
		"	* content config sits next to `srcDir` (`./Source`), but `base` resolves",
		"	* against the project root, which is why the paths start with `./Source`.",
		"	* Nothing is fetched at build time: the files are the source of truth, and",
		"	* no build ever reads the shadow store or the database.",
		"	*/",
		"",
		"const Timestamp = z.iso.datetime({ offset: true });",
		"",
	];

	// A nested shape first: a `const` referenced before its declaration is a
	// temporal dead zone, so the order here is load-bearing.
	for (const entry of siteOrder()) {
		const site = entry.site;
		if (site === undefined) continue;
		blocks.push(doc(site.doc ?? entry.doc, "").trimEnd());
		blocks.push(`const ${site.name} = z.object({`);
		blocks.push(renderFields(fieldsFor(entry, "site"), zodType, "	", false));
		blocks.push("});");
		blocks.push("");
	}

	for (const entry of Collections) {
		const site = entry.site;
		if (site === undefined || site.collection === undefined) continue;
		blocks.push(doc(site.doc ?? entry.doc, "").trimEnd());
		blocks.push(`const ${site.name}Collection = defineCollection({`);
		blocks.push(
			`	loader: glob({ pattern: "**/*.json", base: "./Source/Content/${site.collection}" }),`,
		);
		blocks.push(`	schema: ${site.name},`);
		blocks.push("});");
		blocks.push("");
	}

	blocks.push(doc("Every collection the site builds from.", "").trimEnd());
	blocks.push("export const collections = {");
	for (const entry of Collections) {
		const site = entry.site;
		if (site === undefined || site.collection === undefined) continue;
		blocks.push(`	${site.collection}: ${site.name}Collection,`);
	}
	blocks.push("};");
	blocks.push("");

	return `${blocks.join("\n").trimEnd()}\n`;
}

/** `Maintain/Spacetime/spacetimedb/src/Schema.ts`. */
export function renderModule(): string {
	const tables = Entities.filter((entry) => entry.module !== undefined);
	const blocks: string[] = [
		HEADER,
		"",
		'import { schema, t, table } from "spacetimedb/server";',
		"",
		"/**",
		" * The archive's tables. Reducers live in `index.ts`: they encode",
		" * behaviour, and behaviour is not derived from a field list.",
		" */",
		"",
	];

	for (const entry of tables) {
		const module = entry.module;
		if (module === undefined) continue;
		const fields = fieldsFor(entry, "module");
		const lines: string[] = [];
		for (const [name, field] of Object.entries(fields)) {
			const text = doc(field.doc, "\t\t");
			if (text !== "") lines.push(text.trimEnd());
			let column = columnType(field);
			if (name === module.key) column += ".primaryKey()";
			else if (module.index?.includes(name) === true) column += ".index()";
			lines.push(`\t\t${name}: ${column},`);
		}

		blocks.push(doc(module.doc ?? entry.doc, "").trimEnd());
		blocks.push(`const ${module.table} = table(`);
		blocks.push(
			`	{ name: ${JSON.stringify(module.table)}, public: ${module.public === true ? "true" : "false"} },`,
		);
		blocks.push("\t{");
		blocks.push(lines.join("\n"));
		blocks.push("\t},");
		blocks.push(");");
		blocks.push("");
	}

	blocks.push("export const spacetimedb = schema({");
	for (const entry of tables) blocks.push(`\t${entry.module?.table ?? ""},`);
	blocks.push("});");
	blocks.push("");

	return `${blocks.join("\n").trimEnd()}\n`;
}

/** Every artifact, in the order they are written. */
export function render(): Artifact[] {
	return [
		{ path: PATHS.types, content: renderTypes() },
		{ path: PATHS.content, content: renderContent() },
		{ path: PATHS.module, content: renderModule() },
	];
}

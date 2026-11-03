import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Entities, entity } from "./Entities.ts";
import { fieldsFor, type Entity, type Target } from "./Entity.ts";
import { PATHS, render, type Artifact } from "./Render.ts";

/**
 * Whether the rendered artifacts are what the declaration says.
 *
 * The comparison is on bytes, not on a re-derived summary: a hand edit to any
 * generated file - a deleted field, a retyped column, a dropped `.index()` -
 * changes the bytes and is therefore caught. The field lists are read out of
 * the file only to say *what* drifted, never to decide *whether* it did.
 */

export type State = "current" | "stale" | "missing";

export type Drift = {
	/** Repo-relative path of the artifact. */
	path: string;
	state: State;
	/** Entities whose field list the file disagrees about. */
	entities: { name: string; missing: string[]; extra: string[] }[];
};

export type Report = {
	ok: boolean;
	drift: Drift[];
	/** The declaration's field lists, one row per entity, for a failure message. */
	table: string;
};

const TARGETS: readonly { target: Target; label: string }[] = [
	{ target: "model", label: "model" },
	{ target: "module", label: "module" },
	{ target: "site", label: "site" },
];

/**
 * Where one entity's rendered block sits in a file.
 *
 * `start` is only needed where the block does not open straight into its
 * properties: `table(options, columns)` takes the table's options object first,
 * and that object closes on its own line, which would end a scan that began at
 * `open`. The other two artifacts have no such argument, so they keep the plain
 * rule - the field list is the line after `open`.
 */
type Block = {
	/** The line the block opens with. */
	open: string;
	/** The indent every property line of the block carries. */
	body: string;
	/** Where the field list begins, when it is not the line after `open`. */
	start?: (line: string) => boolean;
};

/** The identifier a rendered block opens with, per artifact. */
function blockOf(artifact: string, entry: Entity): Block | null {
	if (artifact === PATHS.types) {
		return { open: `export type ${entry.model.type} = {`, body: "	" };
	}
	if (artifact === PATHS.content) {
		const site = entry.site;
		if (site === undefined) return null;
		return { open: `const ${site.name} = z.object({`, body: "	" };
	}
	const module = entry.module;
	if (module === undefined) return null;
	return {
		open: `const ${module.table} = table(`,
		body: "		",
		// The columns are the second argument: the object that opens on a line of
		// its own. The options object before it carries its contents inline, so
		// the two are told apart by the line, not by counting braces.
		start: (line) => line.trimEnd() === "	{",
	};
}

/**
 * The field names a rendered file declares for one entity.
 *
 * Every rendered property line is `<indent>name: …` or `<indent>name?: …`; doc
 * comments and blank lines are skipped. A file whose shape was broken badly
 * enough to defeat this reads as declaring nothing, which is a mismatch - the
 * honest answer.
 */
export function fieldsIn(content: string, artifact: string, entry: Entity): string[] {
	const block = blockOf(artifact, entry);
	if (block === null) return [];

	const lines = content.split("\n");
	const open = lines.findIndex((line) => line.startsWith(block.open));
	if (open === -1) return [];

	// A block that names its own field-list opener is located by it; every other
	// block opens on the `open` line itself, so its field list begins after it.
	const locate = block.start;
	const opening =
		locate === undefined
			? open
			: lines.findIndex((line, index) => index > open && locate(line));
	if (opening === -1) return [];

	const property = new RegExp(`^${block.body}([A-Za-z_][A-Za-z0-9_]*)\\??:`);
	const names: string[] = [];
	for (const line of lines.slice(opening + 1)) {
		if (!line.startsWith(block.body)) break;
		const match = property.exec(line);
		if (match?.[1] !== undefined) names.push(match[1]);
	}
	return names;
}

/** The declaration's field lists, rendered as a table for a failure message. */
export function fieldTable(): string {
	const width = Math.max(...Entities.map((entry) => entry.model.type.length));
	const rows: string[] = [];

	for (const entry of Entities) {
		const columns = TARGETS.map(({ target, label }) => {
			const names = Object.keys(fieldsFor(entry, target));
			return `${label}=${names.length === 0 ? "-" : names.join(",")}`;
		});
		rows.push(`${entry.model.type.padEnd(width)}  ${columns.join("  ")}`);
	}

	return rows.join("\n");
}

/** Compare every artifact with what the declaration renders. */
export function compare(root: string): Report {
	const drift: Drift[] = [];

	for (const artifact of render() as Artifact[]) {
		let onDisk: string | null = null;
		try {
			onDisk = readFileSync(join(root, artifact.path), "utf8");
		} catch {
			onDisk = null;
		}

		if (onDisk === null) {
			drift.push({ path: artifact.path, state: "missing", entities: [] });
			continue;
		}
		if (onDisk === artifact.content) continue;

		const entities: Drift["entities"] = [];
		for (const entry of Entities) {
			const expected = fieldsIn(artifact.content, artifact.path, entry);
			const actual = fieldsIn(onDisk, artifact.path, entry);
			if (expected.length === 0 && actual.length === 0) continue;

			const missing = expected.filter((name) => !actual.includes(name));
			const extra = actual.filter((name) => !expected.includes(name));
			if (missing.length === 0 && extra.length === 0) continue;
			entities.push({ name: entry.model.type, missing, extra });
		}

		drift.push({ path: artifact.path, state: "stale", entities });
	}

	return { ok: drift.length === 0, drift, table: fieldTable() };
}

/** A failure message that names each stale artifact and what it is missing. */
export function explain(report: Report): string {
	const lines = ["the generated schema artifacts are not what the declaration says", ""];

	for (const entry of report.drift) {
		lines.push(`  ${entry.path}: ${entry.state}`);
		for (const entity of entry.entities) {
			const parts: string[] = [];
			if (entity.missing.length > 0) parts.push(`missing ${entity.missing.join(", ")}`);
			if (entity.extra.length > 0) parts.push(`undeclared ${entity.extra.join(", ")}`);
			lines.push(`    ${entity.name}: ${parts.join("; ")}`);
		}
	}

	lines.push("", "the declaration's field lists, side by side:", "", report.table, "");
	lines.push("run `pnpm run Schema` to regenerate.");

	return lines.join("\n");
}

/** The entity a target spells differently from the model, for a quick look. */
export function renames(): string[] {
	const lines: string[] = [];
	for (const entry of Entities) {
		for (const { target } of TARGETS) {
			const fields = fieldsFor(entry, target);
			const model = fieldsFor(entry, "model");
			const added = Object.keys(fields).filter((name) => !(name in model));
			if (added.length > 0)
				lines.push(`${entity(entry.name).name}/${target}: +${added.join(", ")}`);
		}
	}
	return lines;
}

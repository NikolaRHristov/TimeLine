import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { EventKind } from "../Model/Event/Event.ts";
import { compare, explain, fieldTable } from "../Model/Schema/Compare.ts";
import { Entities, entity } from "../Model/Schema/Entities.ts";
import { fieldsFor, namesFor } from "../Model/Schema/Entity.ts";
import { PATHS, render } from "../Model/Schema/Render.ts";
import { Source } from "../Model/Source/Source.ts";
import { VoteStatus } from "../Model/Vote/Vote.ts";
import { Visibility } from "../Store/Model/Model.ts";

/**
 * The conformance test: one declaration, three artifacts, no drift.
 *
 * Each assertion names the file it is about, because the failure this exists
 * for is "one of the three stopped agreeing" and the reader needs to know which
 * one. Deleting a field from a generated artifact fails on bytes; deleting it
 * from the declaration regenerates all three consistently, which is the point
 * of having one declaration at all.
 *
 * `Source/content.config.ts` cannot be imported here - it imports
 * `astro:content`, which only exists inside a Vite build - so the check is on
 * the rendered text. That is the stronger check anyway: it catches a retyped
 * column and a dropped `.index()`, not only a missing name.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("the rendered artifacts match the declaration", () => {
	const report = compare(ROOT);
	assert.equal(report.ok, true, `\n${explain(report)}\n`);
});

/**
 * A temporary root holding the three rendered artifacts, so a case can break
 * one of them without touching the tree the check runs against.
 */
function renderedRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "timeline-schema-"));
	for (const artifact of render()) {
		const path = join(root, artifact.path);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, artifact.content, "utf8");
	}
	return root;
}

/** The module artifact's rendered lines. */
function moduleLines(): string[] {
	const artifact = render().find((entry) => entry.path === PATHS.module);
	assert.ok(artifact !== undefined, `${PATHS.module} must be one of the rendered artifacts`);
	return artifact.content.split("\n");
}

/**
 * The diagnosis of a stale module artifact.
 *
 * `table(options, columns)` puts the options object between the declaration and
 * the columns, so a field scan that stopped at the first dedent read every
 * module table as declaring nothing - and a stale module file was reported as
 * `stale` with no column named. A deleted column and an added one are the two
 * halves of that: `missing` and `undeclared`.
 */
test("a stale module artifact names the column it lost", () => {
	const root = renderedRoot();
	try {
		const lines = moduleLines();
		const at = lines.findIndex((line) => line.startsWith("		visibility: "));
		assert.notEqual(at, -1, `${PATHS.module} must declare the post's visibility column`);
		writeFileSync(
			join(root, PATHS.module),
			[...lines.slice(0, at), ...lines.slice(at + 1)].join("\n"),
			"utf8",
		);

		const report = compare(root);
		assert.deepEqual(
			report.drift.map((entry) => entry.path),
			[PATHS.module],
			`only the file that was edited may drift:\n${explain(report)}`,
		);

		const drift = report.drift[0];
		assert.equal(drift?.state, "stale");
		assert.deepEqual(
			drift?.entities,
			[{ name: "PostRecord", missing: ["visibility"], extra: [] }],
			`the deleted column must be named:\n${explain(report)}`,
		);
		assert.match(
			explain(report),
			/PostRecord: missing visibility/,
			"the failure message must name the column, not only the file",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("a stale module artifact names the column it gained", () => {
	const root = renderedRoot();
	try {
		const lines = moduleLines();
		const at = lines.findIndex((line) => line.startsWith("		visibility: "));
		assert.notEqual(at, -1, `${PATHS.module} must declare the post's visibility column`);
		writeFileSync(
			join(root, PATHS.module),
			[...lines.slice(0, at + 1), "		phantom: t.string(),", ...lines.slice(at + 1)].join("\n"),
			"utf8",
		);

		const report = compare(root);
		const drift = report.drift.find((entry) => entry.path === PATHS.module);
		assert.equal(drift?.state, "stale");
		assert.deepEqual(
			drift?.entities,
			[{ name: "PostRecord", missing: [], extra: ["phantom"] }],
			`the added column must be named:\n${explain(report)}`,
		);
		assert.match(
			explain(report),
			/PostRecord: undeclared phantom/,
			"the failure message must name the column, not only the file",
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("every artifact is produced, and each opens with the generated header", () => {
	const artifacts = render();
	assert.deepEqual(
		artifacts.map((artifact) => artifact.path),
		[PATHS.types, PATHS.content, PATHS.module],
		"the generator must produce exactly the three artifacts the check compares",
	);

	for (const artifact of artifacts) {
		assert.match(
			artifact.content,
			/^\/\/ Generated from Maintain\/Source\/Model\/Schema\/Entities\.ts - do not edit\./,
			`${artifact.path} must carry the generated header`,
		);
	}
});

test("every entity declares a model type, and no two share a name", () => {
	const types = new Set<string>();
	const sites = new Set<string>();

	for (const entry of Entities) {
		assert.ok(
			entry.model.type.length > 0,
			`entity ${entry.name} must name the TypeScript type it is`,
		);
		assert.equal(types.has(entry.model.type), false, `two entities are ${entry.model.type}`);
		types.add(entry.model.type);

		const site = entry.site;
		if (site === undefined) continue;
		assert.equal(sites.has(site.name), false, `two entities are the Zod const ${site.name}`);
		sites.add(site.name);
	}
});

test("every table has a primary key among its columns", () => {
	for (const entry of Entities) {
		const module = entry.module;
		if (module === undefined) continue;

		const columns = namesFor(entry, "module");
		assert.ok(
			columns.includes(module.key),
			`${PATHS.module}: table ${module.table} is keyed by ${module.key}, which it does not declare`,
		);

		for (const index of module.index ?? []) {
			assert.ok(
				columns.includes(index),
				`${PATHS.module}: table ${module.table} indexes ${index}, which it does not declare`,
			);
		}
	}
});

test("every field naming an entity names one that exists", () => {
	for (const entry of Entities) {
		for (const target of ["model", "module", "site"] as const) {
			for (const [name, field] of Object.entries(fieldsFor(entry, target))) {
				if (field.kind !== "object" && field.kind !== "array") continue;
				const of = field.of;
				assert.ok(of !== undefined, `${entry.name}.${name} names no type`);

				const scalar = of === "string" || of === "number" || of === "boolean";
				if (scalar) continue;

				assert.doesNotThrow(
					() => entity(of),
					`${entry.name}.${name} (${target}) names an entity that does not exist: ${of}`,
				);

				// Only the site renders a Zod const, so only there must the target
				// have a shape. A model-only entity is a legitimate nested type.
				if (target !== "site") continue;
				assert.equal(
					entity(of).site !== undefined,
					true,
					`${entry.name}.${name} (${target}) references ${of}, which has no site shape to render`,
				);
			}
		}
	}
});

/**
 * The catalog's names, and the one that was not free.
 *
 * The archive already spends `observation` on a channel showing a post, so the
 * agentic layer's disclosure table is `probe` and the archive's table keeps its
 * meaning and its columns. A rename in either direction would regenerate
 * cleanly - the byte comparison would simply accept the new bytes - which is
 * why the names are asserted here instead of left to the generator.
 */
test("the catalog tables are declared, and the archive keeps its own names", () => {
	assert.deepEqual(
		Entities.filter((entry) => entry.module !== undefined).map((entry) => entry.module?.table),
		[
			"post",
			"author",
			"media",
			"observation",
			"event",
			"membership",
			"capability",
			"generation",
			"lease",
			"probe",
			"belief",
			"trace",
		],
		`${PATHS.module}: the table set moved`,
	);

	assert.deepEqual(
		namesFor(entity("probe"), "module"),
		[
			"id",
			"capability",
			"property",
			"propertyVersion",
			"audience",
			"value",
			"at",
			"ingestedAt",
		],
		"the disclosure table is `probe`, and it declares the columns the catalog names",
	);

	// The archive's observation is not the catalog's: same columns, same key, and
	// no `probe` column creeping into it.
	assert.deepEqual(
		namesFor(entity("observation"), "module"),
		["at", "source", "postId", "action", "id"],
		"the archive's observation table must keep its own columns",
	);
});

/**
 * The fence is a `u64`, and the trace carries all four timestamps.
 *
 * Both are read out of the rendered module rather than the declaration: a
 * `column` hint that stopped reaching the file, or an optional marker that was
 * dropped, is invisible in the declaration and would only surface as a runtime
 * type error at the first insert.
 */
test("the lease's fence is a u64 column and the trace carries four timestamps", () => {
	const lines = moduleLines();
	const column = (name: string) =>
		lines.find((line) => line.startsWith(`		${name}: `))?.trim() ?? "";

	assert.equal(
		column("fence"),
		"fence: t.u64(),",
		"a fence that is not a u64 is a fence that can wrap",
	);
	assert.equal(column("policyChanged"), "policyChanged: t.bool(),");
	assert.equal(column("scheduledAt"), "scheduledAt: t.string().optional(),");
	assert.equal(column("ranAt"), "ranAt: t.string().optional(),");

	for (const name of ["at", "ingestedAt", "scheduledAt", "ranAt"]) {
		assert.ok(
			namesFor(entity("trace"), "module").includes(name),
			`trace must carry ${name}, one of the four timestamps`,
		);
	}
});

/**
 * The runtime vocabularies.
 *
 * A union type cannot be enumerated, so each closed set exists twice: once in
 * the declaration, which the Zod schema and the table column both derive from,
 * and once as a `as const` array a command iterates. This is the assertion that
 * keeps the second from falling behind the first.
 */
test("every runtime vocabulary matches the declaration", () => {
	assert.deepEqual(
		[...EventKind],
		[...(entity("event").model.fields["kind"]?.values ?? [])],
		"Model/Event/Event.ts EventKind disagrees with the event entity",
	);
	assert.deepEqual(
		[...Source],
		[...(entity("channel").model.fields["source"]?.values ?? [])],
		"Model/Source/Source.ts Source disagrees with the channel entity",
	);
	assert.deepEqual(
		[...Visibility],
		[...(entity("post").model.fields["visibility"]?.values ?? [])],
		"Store/Model/Model.ts Visibility disagrees with the post entity",
	);
	assert.deepEqual(
		[...VoteStatus],
		[...(entity("voted").model.fields["status"]?.values ?? [])],
		"Model/Vote/Vote.ts VoteStatus disagrees with the voted entity",
	);
});

test("the field lists can be printed side by side", () => {
	const table = fieldTable();
	for (const entry of Entities) assert.ok(table.includes(entry.model.type), entry.model.type);
});

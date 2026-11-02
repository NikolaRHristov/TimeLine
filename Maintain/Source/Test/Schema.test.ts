import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
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

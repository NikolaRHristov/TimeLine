import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { isFailure } from "../Cli/Parser/Output/Failure.ts";
import { requireList, root } from "../Configuration/Load/Load.ts";
import { scope } from "../Configuration/Rules/Rules.ts";
import { validate } from "../Configuration/Schema/Schema.ts";
import type { Rules } from "../Model/Author/Decision.ts";
import type { ListSlug } from "../Model/List/List.ts";

/** Whatever a piece of code writes to stderr, and whatever it returns. */
function capture<T>(work: () => T): { value: T; text: string } {
	const original = process.stderr.write.bind(process.stderr);
	let text = "";
	process.stderr.write = ((chunk: unknown) => {
		text += String(chunk);
		return true;
	}) as typeof process.stderr.write;
	try {
		const value = work();
		return { value, text };
	} finally {
		process.stderr.write = original;
	}
}

/** A rules file with weights for the given slugs, and a threshold that passes. */
function rules(...slugs: string[]): Rules {
	const lists: Rules["lists"] = {};
	for (const slug of slugs) lists[slug] = { keywords: { term: 1 }, domains: {} };
	return { version: 1, threshold: { score: 1, gap: 1 }, lists };
}

function configuration(...slugs: string[]) {
	return validate(
		{ lists: slugs.map((slug, index) => ({ slug, name: slug.toUpperCase(), id: String(index + 1) })) },
		"the test map",
	);
}

test("the identifier map accepts whatever slugs the person uses", () => {
	const slug: ListSlug = "reading";
	assert.equal(typeof slug, "string");

	const parsed = configuration("reading", "recipes");
	assert.deepEqual(
		parsed.lists.map((entry) => entry.slug),
		["reading", "recipes"],
	);
});

test("an unknown slug fails unknown-list naming the configured set", () => {
	let thrown: unknown = null;
	try {
		requireList(configuration("reading", "recipes"), "foo");
	} catch (error) {
		thrown = error;
	}

	assert.equal(isFailure(thrown), true);
	if (!isFailure(thrown)) return;
	assert.equal(thrown.code, "unknown-list");
	assert.equal(thrown.detail, `"foo" is not configured; configured lists: reading, recipes`);
	assert.deepEqual(thrown.toObject()["configured"], ["reading", "recipes"]);
});

test("an empty map says none rather than naming an empty list", () => {
	let thrown: unknown = null;
	try {
		requireList(configuration(), "foo");
	} catch (error) {
		thrown = error;
	}

	assert.equal(isFailure(thrown), true);
	if (!isFailure(thrown)) return;
	assert.equal(thrown.detail, `"foo" is not configured; configured lists: none`);
	assert.deepEqual(thrown.toObject()["configured"], []);
});

test("a configured slug resolves to its id", () => {
	const found = requireList(configuration("reading"), "reading");
	assert.deepEqual(found, { slug: "reading", name: "READING", id: "1" });
});

test("the rules are narrowed to the configured lists, and the rest are dropped", () => {
	const { value: scoped, text } = capture(() => scope(rules("recipes", "CODE"), configuration("reading", "recipes")));

	// `reading` is configured but unweighted: the rules pass cannot place anyone
	// there, while the model pass may still choose it.
	assert.deepEqual(scoped.slugs, ["reading", "recipes"]);
	assert.deepEqual(Object.keys(scoped.rules.lists), ["recipes"]);
	assert.deepEqual(scoped.dropped, ["CODE"]);
	assert.match(text, /dropping weights for CODE/);
});

test("no identifier map leaves the rules file as the vocabulary, and says so", () => {
	const { value: scoped, text } = capture(() => scope(rules("CODE"), null));

	assert.deepEqual(scoped.slugs, ["CODE"]);
	assert.deepEqual(scoped.dropped, []);
	assert.match(text, /no identifier map/);
});

test("a map that declares no lists leaves the rules file as the vocabulary, and says so", () => {
	const { value: scoped, text } = capture(() => scope(rules("CODE"), configuration()));

	assert.deepEqual(scoped.slugs, ["CODE"]);
	assert.match(text, /declares no lists/);
});

test("the content schema takes list slugs as strings, never as an enumeration", () => {
	// `astro:content` only resolves inside a build, so the claim is read off the
	// file: this is the second place a closed taxonomy could grow back.
	const schema = readFileSync(join(root(), "Source/content.config.ts"), "utf8");

	assert.match(schema, /lists: z\.array\(z\.string\(\)\)/);
	assert.equal(/["'](AI|UI|CODE)["']/.test(schema), false);
});

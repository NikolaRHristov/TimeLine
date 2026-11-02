#!/usr/bin/env node
/**
 * Write the host redirect map from the route map.
 *
 * One source of truth, two emitted copies. `Public/_redirects` is the copy a
 * static host reads; `Target/_redirects` is the copy that survives a build
 * directory wiped between `astro build` runs. Both are written from the same
 * render, so they cannot disagree - and neither is ever edited by hand, because
 * the next run overwrites it.
 *
 * Run with bare Node, which strips the types on the way in:
 *
 *     node Maintain/Script/GenerateRedirects.ts
 *
 * Node needs no flags for that from 22.18 on. The file imports the route map
 * by its real `.ts` path rather than a bundler alias, because this script runs
 * outside Vite: an alias would resolve in the page build and fail here, which
 * is exactly the drift the shared module exists to prevent.
 *
 * Output is byte-identical for identical input: the rules are sorted by code
 * unit, not by locale, and the column widths are computed from the widest
 * value rather than fixed. That is what makes "delete the file and re-run"
 * a safe check instead of a diff.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { CanonicalPath, Pair, PrefixPair } from "../../Source/Function/Route/Map.ts";

const Here = dirname(fileURLToPath(import.meta.url));
const Root = join(Here, "..", "..");

/** Where the generated file goes: served copy, then built copy. */
const Destination = [join(Root, "Public", "_redirects"), join(Root, "Target", "_redirects")];

/** Sort by code unit. `localeCompare` orders punctuation by locale, not by byte. */
const Order = (Left: string, Right: string): number => (Left < Right ? -1 : Left > Right ? 1 : 0);

/** Pad a cell to a column width, always leaving at least one space after it. */
const Pad = (Value: string, Width: number): string =>
	`${Value}${" ".repeat(Width - Value.length + 1)}`;

/** One `[source, target]` rule, as the host reads it. */
type Rule = readonly [string, string];

/**
 * Every rule, in one list, sorted by source.
 *
 * Three groups, and the order they end up in is the order the host evaluates
 * them: a host applies the first rule that matches, so an exact alias has to
 * come before the prefix rule that would also match it.
 *
 * - The exact aliases, twice each: `/bookmarks` and `/bookmarks/`. A host does
 *   not normalise a trailing slash before matching, and a visitor who types one
 *   should not land on a 404.
 * - The prefix rules, which carry the remainder of the path through `:splat`,
 *   so `/bookmark/example-post` reaches `/Bookmark/example-post` without an
 *   entry per id.
 *
 * Canonical paths are deliberately absent. They are served, not redirected, and
 * a rule pointing a canonical at itself is a loop.
 */
const Rule = (): readonly Rule[] => {
	const Collected: Rule[] = [];

	for (const [Source, Target] of Pair()) {
		Collected.push([Source, Target]);
		Collected.push([`${Source}/`, Target]);
	}

	for (const [Source, Target] of PrefixPair()) {
		Collected.push([Source, Target]);
	}

	return Collected.sort(([Left], [Right]) => Order(Left, Right));
};

/**
 * Render the whole file.
 *
 * The header names the generator and the module it reads, by repository-relative
 * path only. An absolute path here would be a machine's home directory in a
 * public repository, and the file is copied into the build output verbatim.
 */
const Render = (Rules: readonly Rule[]): string => {
	const Source = Math.max(...Rules.map(([From]) => From.length));
	const Target = Math.max(...Rules.map(([, To]) => To.length));

	const Line = [
		"# Generated file - do not edit.",
		"#",
		"# Source of truth: Source/Function/Route/Map.ts",
		"# Regenerate:     node Maintain/Script/GenerateRedirects.ts",
		"#",
		`# ${[...CanonicalPath].length} canonical paths are served, not redirected.`,
		`# ${Rules.length} rules below are the aliases: lowercase and semantic spellings`,
		"# that must reach the same page. Every one of them is a 301.",
		"#",
		"# Syntax: /from /to 301",
		"",
	];

	for (const [From, To] of Rules) {
		Line.push(`${Pad(From, Source)}${Pad(To, Target)}301`);
	}

	return `${Line.join("\n")}\n`;
};

const Content = Render(Rule());

for (const Path of Destination) {
	mkdirSync(dirname(Path), { recursive: true });

	writeFileSync(Path, Content, "utf8");

	console.log(`Wrote ${relative(Root, Path)} (${Content.split("\n").length - 1} lines)`);
}

// Archived tool: TokenContract.mjs
//
// What it does: Fail the build on a stray colour literal, an orphan token, an undefined token, a second stage map or a redefined Material mixin.
// Kept here so a later session reuses it instead of rewriting it.
// Run it from the repository root; it reads the paths it names and nothing else.
// Archived: 2026-11-02 by Documentation/Skill/Tool-Archive/Reference/archive_tool.py
/**
 * The token contract: five checks that fail the build when the design system
 * drifts.
 *
 * A token set is a convention until something enforces it, and the edit that
 * breaks it is the hurried one: a hex typed into a component sheet because the
 * token was one file away. This script is the enforcement. It reads the sheets
 * and the components under `Source/` and reports every place the token set
 * stopped being the only place a colour is stated.
 *
 * The five checks, and the failure each one prevents:
 *
 * 1. No stray literal. A hex or an `rgb()` in any sheet but `Global.css` is a
 *    second palette, and the two drift the moment one is edited.
 * 2. No orphan token. A token declared in `Global.css` that nothing reads is
 *    worse than absent: it reads as intent, so the next person themes against a
 *    value that changes nothing.
 * 3. No undefined token. A `var(--x)` with no declaration and no fallback is a
 *    property the browser drops silently, and the surface renders as if the rule
 *    had never been written.
 * 4. One stage map. `Source/Library/Stage.ts` holds the stage-to-accent table. A
 *    second module naming a stage accent is a second table, and two tables
 *    disagree.
 * 5. One material. A sheet that redefines a `Material` mixin overrides the one
 *    place the material is defined, so the two definitions drift invisibly.
 *
 * Every message names the file and the line. A check that reports only "failed"
 * costs more to diagnose than it saves.
 *
 * Usage
 * -----
 *     node Documentation/Skill/Tool-Archive/Reference/TokenContract.mjs
 *     node TokenContract.mjs --root <path-to-checkout>
 *
 * `pnpm run check` runs it with no arguments from the repository root; the root
 * is then found by walking up from the working directory, and failing that from
 * this file's own directory. Exit code 0 means the contract holds, 1 means at
 * least one violation was reported, 2 means the checkout could not be found.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const STYLESHEET = join("Source", "Stylesheet");
const GLOBAL = "Source/Stylesheet/Global.css";
const MATERIAL = "Source/Stylesheet/Material.scss";
const STAGE_MODULE = "Source/Library/Stage.ts";

const SHEET_EXTENSIONS = new Set([".css", ".scss"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".astro"]);

/**
 * The token a stage accent is declared as. The set of these is not written down
 * here: it is read from `Global.css`, so adding a stage does not mean editing
 * the check.
 */
const STAGE_TOKEN = /^--stage-[A-Za-z0-9-]+$/;

const CHECK_TITLES = [
	"no stray colour literal",
	"no orphan token",
	"no undefined token",
	"one stage map",
	"one material",
];

/* ------------------------------------------------------------------ reading */

function isFile(path) {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

function isDirectory(path) {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

/** A checkout is a directory holding both the sheets and the root manifest. */
function looksLikeRoot(directory) {
	return isDirectory(join(directory, STYLESHEET)) && isFile(join(directory, "package.json"));
}

function findRoot(start) {
	let here = resolve(start);

	for (;;) {
		if (looksLikeRoot(here)) {
			return here;
		}

		const up = dirname(here);

		if (up === here) {
			return null;
		}

		here = up;
	}
}

function walk(directory, extensions, into = []) {
	let entries;

	try {
		entries = readdirSync(directory, { withFileTypes: true });
	} catch {
		return into;
	}

	for (const entry of entries) {
		if (entry.name.startsWith(".") || entry.name === "node_modules") {
			continue;
		}

		const full = join(directory, entry.name);

		if (entry.isDirectory()) {
			walk(full, extensions, into);
		} else if (extensions.has(extname(entry.name))) {
			into.push(full);
		}
	}

	return into;
}

/**
 * Replace comments with spaces, keeping every newline where it was.
 *
 * A sheet's prose quotes the very literals this check forbids - `Material.scss`
 * explains the palette by naming a hex - so a check that read comments would
 * fail on its own documentation. Blanking instead of deleting keeps the line
 * numbers of everything after a comment correct, which is what makes a message
 * point at the right line.
 *
 * `//` is a comment in Sass and in TypeScript, but not in CSS, and never after a
 * protocol colon: `url(http://...)` is not a comment.
 */
function stripComments(text, mode) {
	const lineComments = mode !== "css";
	let out = "";
	let quote = null;

	for (let index = 0; index < text.length;) {
		const character = text[index];
		const next = text[index + 1];

		if (quote !== null) {
			out += character;

			if (character === "\\") {
				out += next ?? "";
				index += 2;
				continue;
			}

			if (character === quote) {
				quote = null;
			}

			index += 1;
			continue;
		}

		if (character === '"' || character === "'" || (mode === "js" && character === "`")) {
			quote = character;
			out += character;
			index += 1;
			continue;
		}

		if (character === "/" && next === "*") {
			const end = text.indexOf("*/", index + 2);
			const stop = end === -1 ? text.length : end + 2;

			out += text.slice(index, stop).replace(/[^\n]/g, " ");
			index = stop;
			continue;
		}

		if (lineComments && character === "/" && next === "/") {
			let back = index - 1;

			while (back >= 0 && (text[back] === " " || text[back] === "\t")) {
				back -= 1;
			}

			if (text[back] !== ":") {
				const end = text.indexOf("\n", index);
				const stop = end === -1 ? text.length : end;

				out += " ".repeat(stop - index);
				index = stop;
				continue;
			}
		}

		out += character;
		index += 1;
	}

	return out;
}

/* ------------------------------------------------------------------ scanning */

/** The 1-based line an offset sits on. */
function lineAt(text, offset) {
	let line = 1;

	for (let index = 0; index < offset && index < text.length; index += 1) {
		if (text.charCodeAt(index) === 10) {
			line += 1;
		}
	}

	return line;
}

/** `#abc` and `#aabbcc` are the same colour, and compare as one. */
function normalizeHex(hex) {
	const digits = hex.slice(1).toLowerCase();

	if (digits.length === 3 || digits.length === 4) {
		return `#${[...digits].map((digit) => digit + digit).join("")}`;
	}

	return `#${digits}`;
}

const DECLARATION = /^[ \t]*(--[A-Za-z0-9-]+)[ \t]*:[ \t]*([^;\n]*);/gm;
const READ = /\bvar\(\s*(--[A-Za-z0-9-]+)\s*(,)?/g;
const SETTER = /["'`]?(--[A-Za-z0-9-]+)["'`]?[ \t]*:/g;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const FUNCTIONAL = /\b(?:rgba?|hsla?|oklch|lch|lab)\([^()]*\)/g;
const MIXIN = /@mixin[ \t]+([A-Za-z0-9_-]+)/g;
const STAGE_REFERENCE = /--stage-[A-Za-z0-9-]+/g;

function main() {
	const argument = process.argv.slice(2);
	let explicit = null;

	for (let index = 0; index < argument.length; index += 1) {
		if (argument[index] === "--root") {
			explicit = argument[index + 1] ?? null;
		}
	}

	const root =
		explicit !== null
			? findRoot(explicit)
			: (findRoot(process.cwd()) ?? findRoot(dirname(fileURLToPath(import.meta.url))));

	if (root === null) {
		console.error(
			explicit === null
				? "token contract: no checkout found above the working directory - pass --root <path>"
				: `token contract: ${explicit} is not a checkout - it holds no ${STYLESHEET} and no package.json`,
		);

		return 2;
	}

	const relativeTo = (path) => relative(root, path).split(sep).join("/");

	const sheets = new Map(
		walk(join(root, "Source", "Stylesheet"), SHEET_EXTENSIONS).map((path) => [
			relativeTo(path),
			{
				path,
				text: stripComments(
					readFileSync(path, "utf8"),
					extname(path) === ".css" ? "css" : "scss",
				),
			},
		]),
	);

	const sources = new Map(
		walk(join(root, "Source"), SOURCE_EXTENSIONS).map((path) => [
			relativeTo(path),
			{ path, text: stripComments(readFileSync(path, "utf8"), "js") },
		]),
	);

	if (!sheets.has(GLOBAL)) {
		console.error(
			`token contract: ${GLOBAL} is missing - it is the only place a token may be declared`,
		);

		return 2;
	}

	const declarations = new Map();
	const reads = [];
	const setters = new Map();

	for (const [file, { text }] of sheets) {
		for (const match of text.matchAll(DECLARATION)) {
			const [, name, value] = match;

			if (!declarations.has(name)) {
				declarations.set(name, []);
			}

			declarations
				.get(name)
				.push({ file, line: lineAt(text, match.index), value: value.trim() });
		}
	}

	for (const [file, { text }] of [...sheets, ...sources]) {
		for (const match of text.matchAll(READ)) {
			reads.push({
				file,
				line: lineAt(text, match.index),
				name: match[1],
				fallback: match[2] === ",",
			});
		}
	}

	for (const [file, { text }] of sources) {
		for (const match of text.matchAll(SETTER)) {
			if (!setters.has(match[1])) {
				setters.set(match[1], []);
			}

			setters.get(match[1]).push({ file, line: lineAt(text, match.index) });
		}
	}

	const violations = [];
	const report = (check, file, line, message) => violations.push({ check, file, line, message });

	/* 1. No stray literal ------------------------------------------------ */

	for (const [file, { text }] of sheets) {
		if (file === GLOBAL) {
			continue;
		}

		for (const match of text.matchAll(HEX)) {
			const start = text.lastIndexOf("\n", match.index) + 1;

			// `url(#marker)` is a reference to an element, not a colour.
			if (/\burl\(\s*$/.test(text.slice(start, match.index))) {
				continue;
			}

			report(
				1,
				file,
				lineAt(text, match.index),
				`stray colour literal "${match[0]}" - name a token from ${GLOBAL} instead, and declare one there if the palette has no step for it`,
			);
		}

		for (const match of text.matchAll(FUNCTIONAL)) {
			report(
				1,
				file,
				lineAt(text, match.index),
				`stray colour literal "${match[0]}" - name a token from ${GLOBAL} instead, or mix one with color-mix() so the value stays a token`,
			);
		}
	}

	/* 2. No orphan token -------------------------------------------------- */

	const readNames = new Set(reads.map((read) => read.name));

	for (const [name, sites] of declarations) {
		if (!readNames.has(name)) {
			const [site] = sites;

			report(
				2,
				site.file,
				site.line,
				`${name} is declared here and read by nothing - delete it, or give it a reader`,
			);
		}
	}

	/* 3. No undefined token ----------------------------------------------- */

	for (const read of reads) {
		if (declarations.has(read.name) || setters.has(read.name) || read.fallback) {
			continue;
		}

		report(
			3,
			read.file,
			read.line,
			`var(${read.name}) is not declared anywhere and passes no fallback - declare it in ${GLOBAL}, or write var(${read.name}, <fallback>)`,
		);
	}

	/* 4. One stage map ---------------------------------------------------- */

	const stageTokens = new Map(
		[...declarations]
			.filter(([name]) => STAGE_TOKEN.test(name))
			.map(([name, sites]) => [name, sites]),
	);

	const stageModule = sources.get(STAGE_MODULE);

	if (stageModule === undefined) {
		report(
			4,
			STAGE_MODULE,
			1,
			"the stage-to-accent map is missing - it is the one module allowed to name a stage accent",
		);
	} else {
		for (const [name, sites] of stageTokens) {
			if (!stageModule.text.includes(name)) {
				const [site] = sites;

				report(
					4,
					site.file,
					site.line,
					`${name} is declared here and missing from ${STAGE_MODULE} - add it to the stage map, or drop the token`,
				);
			}
		}

		for (const match of stageModule.text.matchAll(STAGE_REFERENCE)) {
			if (!stageTokens.has(match[0])) {
				report(
					4,
					STAGE_MODULE,
					lineAt(stageModule.text, match.index),
					`${match[0]} is named here and not declared in ${GLOBAL} - declare it, or drop it from the map`,
				);
			}
		}
	}

	const stageHexes = new Map();

	for (const [, sites] of stageTokens) {
		for (const site of sites) {
			if (site.value.startsWith("#")) {
				stageHexes.set(normalizeHex(site.value), site);
			}
		}
	}

	for (const [file, { text }] of sources) {
		if (file === STAGE_MODULE) {
			continue;
		}

		for (const match of text.matchAll(HEX)) {
			const accent = stageHexes.get(normalizeHex(match[0]));

			if (accent !== undefined) {
				report(
					4,
					file,
					lineAt(text, match.index),
					`hardcodes the stage accent "${match[0]}" (${accent.file}:${accent.line}) - read StageAccent from ${STAGE_MODULE}`,
				);
			}
		}

		for (const match of text.matchAll(STAGE_REFERENCE)) {
			report(
				4,
				file,
				lineAt(text, match.index),
				`names the stage accent ${match[0]} - the map is ${STAGE_MODULE}; read it from there`,
			);
		}
	}

	/* 5. One material ----------------------------------------------------- */

	const material = sheets.get(MATERIAL);

	if (material === undefined) {
		report(
			5,
			MATERIAL,
			1,
			"the material sheet is missing - it is the one place a mixin may be defined",
		);
	} else {
		const provided = new Set([...material.text.matchAll(MIXIN)].map((match) => match[1]));

		for (const [file, { text }] of sheets) {
			if (file === MATERIAL) {
				continue;
			}

			for (const match of text.matchAll(MIXIN)) {
				if (!provided.has(match[1])) {
					continue;
				}

				report(
					5,
					file,
					lineAt(text, match.index),
					`@mixin ${match[1]} redefines Material.${match[1]} - write @include Material.${match[1]}, or rename it if it is a different rule`,
				);
			}
		}
	}

	/* --------------------------------------------------------------- report */

	if (violations.length === 0) {
		console.log(
			`token contract: clean - ${sheets.size} sheet(s), ${declarations.size} token(s), ${reads.length} read(s), ${CHECK_TITLES.length} checks`,
		);

		return 0;
	}

	violations.sort(
		(left, right) =>
			left.check - right.check ||
			left.file.localeCompare(right.file) ||
			left.line - right.line,
	);

	let current = 0;

	for (const violation of violations) {
		if (violation.check !== current) {
			current = violation.check;
			console.log(`\n${violation.check}. ${CHECK_TITLES[current - 1]}`);
		}

		console.log(`   ${violation.file}:${violation.line}: ${violation.message}`);
	}

	const files = new Set(violations.map((violation) => violation.file));

	console.log(`\ntoken contract: ${violations.length} violation(s) in ${files.size} file(s)`);

	return 1;
}

process.exit(main());

// Archived tool: TokenContract.mjs
//
// What it does: Fail the build on a stray colour literal, an orphan token, an undefined token, a second stage map or a redefined Material mixin.
// Kept here so a later session reuses it instead of rewriting it.
// Run it from the repository root; it reads the paths it names and nothing else.
// Archived: 2026-11-02 by Documentation/Skill/Tool-Archive/Reference/archive_tool.py
/**
 * The token contract: eight checks that fail the build when the design system
 * drifts.
 *
 * A token set is a convention until something enforces it, and the edit that
 * breaks it is the hurried one: a hex typed into a component sheet because the
 * token was one file away. This script is the enforcement. It reads the sheets
 * and the components under `Source/` and reports every place the token set
 * stopped being the only place a colour is stated.
 *
 * The eight checks, and the failure each one prevents:
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
 * 6. One state vocabulary. The seven component states (RFC-0049) and the six
 *    data states (RFC-0050) are declared in `Source/Library/`, and nothing else
 *    may name a state. A sheet that invents `--pressed`, a component that
 *    publishes `data-control-state="hovered"` or a read passed as an `IsEmpty`
 *    flag is the drift eleven components make into eleven systems. The state
 *    sheet's mixins are compared to the module, so the two cannot disagree about
 *    which states exist or which channel each one moves.
 * 7. One failure vocabulary. A page that prints a code the CLI never emits names
 *    a failure the operator cannot look up. The site's codes are read from
 *    `Source/Library/DataState.ts` and checked against the CLI's own
 *    declaration, because the site must not import the tool layer to agree with
 *    it.
 * 8. Focus is never removed. `outline: none` in a component sheet, with nothing
 *    put back, removes the only affordance a keyboard reader has (RFC-0049 rule
 *    3). The global `img` reset is out of scope: an image is not focusable.
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
const STATE_MODULE = "Source/Library/ComponentState.ts";
const STATE_SHEET = "Source/Stylesheet/State.scss";
const DATA_MODULE = "Source/Library/DataState.ts";
const FAILURE_MODULE = "Maintain/Source/CLI/Parser/Output/Failure.ts";
const COMPONENT_SHEETS = "Source/Stylesheet/Component/";

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
	"one state vocabulary",
	"one failure vocabulary",
	"focus is never removed",
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

/**
 * The quoted names in `export const Name = [ ... ]`.
 *
 * The closed sets are read from the modules that declare them rather than
 * restated here, so adding a state is one edit in one file and this check
 * follows it. A set that is not an array any more returns `null`, which the
 * caller reports: a check that silently accepted a renamed export would stop
 * checking anything.
 */
function arrayOf(text, name) {
	const match = new RegExp(`export const ${name}\\b[^=]*=\\s*\\[([\\s\\S]*?)\\]`, "m").exec(text);

	if (match === null) {
		return null;
	}

	return [...match[1].matchAll(/"([^"]*)"/g)].map((entry) => entry[1]);
}

/** The value of `export const Name = "value";`. */
function stringOf(text, name) {
	const match = new RegExp(`export const ${name}\\b[^=]*=\\s*"([^"]*)"`).exec(text);

	return match === null ? null : match[1];
}

/** The `name: "value"` pairs in `export const Name = { ... };`. */
function recordOf(text, name) {
	const match = new RegExp(`export const ${name}\\b[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`, "m").exec(
		text,
	);

	if (match === null) {
		return null;
	}

	return new Map(
		[...match[1].matchAll(/([A-Za-z][A-Za-z0-9]*)\s*:\s*"([^"]*)"/g)].map((entry) => [
			entry[1],
			entry[2],
		]),
	);
}

const DECLARATION = /^[ \t]*(--[A-Za-z0-9-]+)[ \t]*:[ \t]*([^;\n]*);/gm;
const READ = /\bvar\(\s*(--[A-Za-z0-9-]+)\s*(,)?/g;
const SETTER = /["'`]?(--[A-Za-z0-9-]+)["'`]?[ \t]*:/g;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const FUNCTIONAL = /\b(?:rgba?|hsla?|oklch|lch|lab)\([^()]*\)/g;
const MIXIN = /@mixin[ \t]+([A-Za-z0-9_-]+)/g;
const STAGE_REFERENCE = /--stage-[A-Za-z0-9-]+/g;

/** A published state: `data-control-state="x"`, `data-read="x"`, `[data-read="x"]`. */
const STATE_ATTRIBUTE = /data-(control-state|read|state)\s*=\s*["']([^"']*)["']/g;

/** A state passed as a flag instead of derived. */
const STATE_FLAG =
	/\bIs(Empty|Error|Failed|Partial|Stale|Ready|Pending|Loading|Selected|Locked|Busy)\b/g;

/** A focus ring removed and nothing put back. */
const FOCUS_REMOVED = /\boutline(?:-[a-z]+)?\s*:\s*(?:none|0)\b|@apply[^;\n]*\boutline-none\b/g;

/** A mixin with its parameter list, so a state's arity can be counted. */
const MIXIN_SIGNATURE = /@mixin[ \t]+([A-Za-z0-9_-]+)[ \t]*\(([^)]*)\)/g;

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
		// The names the map states, exactly - a substring test would let
		// `--stage-source-extra` satisfy `--stage-source`.
		const named = new Set(
			[...stageModule.text.matchAll(STAGE_REFERENCE)].map((match) => match[0]),
		);

		for (const [name, sites] of stageTokens) {
			if (!named.has(name)) {
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

	/* 6. One state vocabulary --------------------------------------------- */

	const stateModule = sources.get(STATE_MODULE);
	const dataModule = sources.get(DATA_MODULE);

	if (stateModule === undefined) {
		report(
			6,
			STATE_MODULE,
			1,
			"the component state model is missing - it is the one module allowed to name a state (RFC-0049)",
		);
	}

	if (dataModule === undefined) {
		report(
			6,
			DATA_MODULE,
			1,
			"the data state model is missing - it is the one module allowed to name what a read found (RFC-0050)",
		);
	}

	const states =
		stateModule === undefined ? [] : (arrayOf(stateModule.text, "ComponentState") ?? []);
	const channels =
		stateModule === undefined
			? new Map()
			: (recordOf(stateModule.text, "StateChannel") ?? new Map());
	const readStates =
		dataModule === undefined ? [] : (arrayOf(dataModule.text, "DataState") ?? []);
	const codes = dataModule === undefined ? [] : (arrayOf(dataModule.text, "FailureCode") ?? []);

	// The attribute a state is published on is declared in the module too, so the
	// name the check scans for is stated once. A module that renames it is not
	// silently unenforced: the mismatch is reported until this check follows.
	const stateAttribute =
		stateModule === undefined ? null : (stringOf(stateModule.text, "StateAttribute") ?? null);
	const readAttribute =
		dataModule === undefined ? null : (stringOf(dataModule.text, "ReadAttribute") ?? null);

	if (stateAttribute !== null && stateAttribute !== "data-control-state") {
		report(
			6,
			STATE_MODULE,
			1,
			`StateAttribute is "${stateAttribute}" and this check scans for "data-control-state" - rename it here too, or the vocabulary stops being enforced`,
		);
	}

	if (readAttribute !== null && readAttribute !== "data-read") {
		report(
			6,
			DATA_MODULE,
			1,
			`ReadAttribute is "${readAttribute}" and this check scans for "data-read" - rename it here too, or the vocabulary stops being enforced`,
		);
	}

	if (stateModule !== undefined && states.length === 0) {
		report(
			6,
			STATE_MODULE,
			1,
			"no `ComponentState` array was found - the set is read from it, so it stays an exported array of names",
		);
	}

	if (dataModule !== undefined && readStates.length === 0) {
		report(
			6,
			DATA_MODULE,
			1,
			"no `DataState` array was found - the set is read from it, so it stays an exported array of names",
		);
	}

	const stateSet = new Set(states);
	const readSet = new Set(readStates);
	const mixins = new Map();
	const stateSheet = sheets.get(STATE_SHEET);

	if (stateSheet === undefined) {
		report(
			6,
			STATE_SHEET,
			1,
			"the state sheet is missing - it is the one place a state is drawn (RFC-0049 rule 1)",
		);
	} else {
		for (const match of stateSheet.text.matchAll(MIXIN_SIGNATURE)) {
			const parameters = match[2]
				.split(",")
				.map((parameter) => parameter.trim())
				.filter((parameter) => parameter !== "");

			mixins.set(match[1], {
				line: lineAt(stateSheet.text, match.index),
				arity: parameters.length,
			});
		}

		for (const [name, site] of mixins) {
			if (!stateSet.has(name)) {
				report(
					6,
					STATE_SHEET,
					site.line,
					`@mixin ${name} is not a state - the set is read from ${STATE_MODULE}, so an eighth state is a change there and not a new mixin`,
				);
				continue;
			}

			if (channels.get(name) === "none") {
				report(
					6,
					STATE_SHEET,
					site.line,
					`@mixin ${name} draws a state that changes no channel - ${name} is the baseline, so the rule that draws it is the component's own base rule`,
				);
			}

			if (site.arity !== 1) {
				report(
					6,
					STATE_SHEET,
					site.line,
					`@mixin ${name} takes ${site.arity} parameter(s) - a state takes exactly one, named for the single channel it moves (RFC-0049 rule 7)`,
				);
			}
		}

		for (const name of stateSet) {
			if (channels.get(name) !== "none" && !mixins.has(name)) {
				report(
					6,
					STATE_SHEET,
					1,
					`${name} is a state in ${STATE_MODULE} and has no mixin here - add one, or the state exists in the module and nowhere on the page`,
				);
			}
		}
	}

	for (const [file, { text }] of [...sheets, ...sources]) {
		for (const match of text.matchAll(STATE_ATTRIBUTE)) {
			const [, attribute, value] = match;
			const line = lineAt(text, match.index);

			if (attribute === "control-state" && !stateSet.has(value)) {
				report(
					6,
					file,
					line,
					`data-control-state="${value}" is not one of the seven (${states.join(", ")}) - a state outside the set is a vocabulary change in ${STATE_MODULE}`,
				);
			}

			if (attribute === "read" && !readSet.has(value)) {
				report(
					6,
					file,
					line,
					`data-read="${value}" is not one of the six (${readStates.join(", ")}) - a read's state is derived by ${DATA_MODULE}, never named by hand`,
				);
			}

			if (attribute === "state" && (stateSet.has(value) || readSet.has(value))) {
				report(
					6,
					file,
					line,
					`"${value}" is published under the bare data-state, which is the capability set's (RFC-0046) - write data-control-state or data-read so the three sets stay apart`,
				);
			}
		}
	}

	for (const [file, { text }] of sheets) {
		const use = /@use[ 	]+["'][^"']*State\.scss["'][ 	]+as[ 	]+([A-Za-z0-9_-]+)/.exec(text);

		if (use === null) {
			continue;
		}

		for (const match of text.matchAll(
			new RegExp(`@include[ \	]+${use[1]}\\.([A-Za-z0-9_-]+)`, "g"),
		)) {
			if (!mixins.has(match[1])) {
				report(
					6,
					file,
					lineAt(text, match.index),
					`${use[1]}.${match[1]} is not a state - the set is ${states.join(", ")} (${STATE_MODULE})`,
				);
			}
		}
	}

	for (const [file, { text }] of sources) {
		for (const match of text.matchAll(STATE_FLAG)) {
			report(
				6,
				file,
				lineAt(text, match.index),
				`Is${match[1]} is a state passed as a flag - a boolean cannot carry the ratio, the time, the code or the reason, so derive it with ${STATE_MODULE} or ${DATA_MODULE}`,
			);
		}
	}

	/* 7. One failure vocabulary ------------------------------------------- */

	const failurePath = join(root, FAILURE_MODULE);
	const declared = isFile(failurePath)
		? new Set(
				[...readFileSync(failurePath, "utf8").matchAll(/"([a-z][a-z0-9-]*)"/g)].map(
					(match) => match[1],
				),
			)
		: null;

	if (declared === null) {
		report(
			7,
			FAILURE_MODULE,
			1,
			"the CLI's failure codes could not be read - the site and the CLI share one vocabulary, so the file that declares them must exist",
		);
	} else {
		for (const code of codes) {
			if (declared.has(code)) {
				continue;
			}

			const at = dataModule === undefined ? -1 : dataModule.text.indexOf(`"${code}"`);

			report(
				7,
				DATA_MODULE,
				at === -1 ? 1 : lineAt(dataModule.text, at),
				`"${code}" is printed by the site and is not a code ${FAILURE_MODULE} declares - one vocabulary, or the page names a failure the operator cannot look up`,
			);
		}
	}

	/* 8. Focus is never removed ------------------------------------------- */

	for (const [file, { text }] of sheets) {
		if (!file.startsWith(COMPONENT_SHEETS)) {
			continue;
		}

		for (const match of text.matchAll(FOCUS_REMOVED)) {
			report(
				8,
				file,
				lineAt(text, match.index),
				`"${match[0].trim()}" removes the focus ring and puts nothing back - draw it with @include State.focus(<line>), or the control has no keyboard affordance at all (RFC-0049 rule 3)`,
			);
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

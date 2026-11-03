#!/usr/bin/env node
/**
 * The record header: one frontmatter block, rendered from the record and checked.
 *
 *   node Scripts/RFC-Frontmatter.mjs                  # check every record's frontmatter
 *   node Scripts/RFC-Frontmatter.mjs --write          # rewrite the frontmatter of every record
 *   node Scripts/RFC-Frontmatter.mjs --write --only 0002
 *   node Scripts/RFC-Frontmatter.mjs --show 0002      # print one rendered block, write nothing
 *
 * A record is a document a generator can read. Its metadata is a YAML block at the
 * top of the file, not a run of bold labels in prose, and the block is rendered
 * from the record's own sections rather than typed by hand:
 *
 *   - `title`, `date`, `owner`, `applies_to`, `supersedes`, `superseded_by` and
 *     `depends` are carried. They were facts only a person could decide, so the
 *     tool reads them from the block it finds and never re-derives one.
 *   - `rfc` is the file's own number, `kind` is the document type, and `category`
 *     and `horizon` are the classification the assignment table in
 *     `Documentation/Reference/RFC-Classification.md` holds. The table stays the
 *     authority: a record and the audit cannot drift apart if only the audit is
 *     read.
 *   - `statuses` is derived from the record's Decision section, one entry per
 *     rule. `evidence` is the file or command that rule itself names, and `state`
 *     is `current` only when that file is in the tree today or that command is a
 *     script the repository runs. A rule that names nothing, or names something
 *     that is not there, is `open`: an unverified rule that reads as settled is
 *     the one failure this field could cause.
 *
 * `rfc` is emitted zero-padded. YAML 1.2 reads `0002` as the integer 2, so a
 * reader pads it back to four digits; the filename carries the same number.
 *
 * The block is emitted here rather than by a YAML writer so the field order and
 * the four-space sequence indent are the file's own and do not move when a
 * library changes its defaults. Every rendered block is parsed back with a real
 * YAML parser before it is written, and a block that does not round-trip is a
 * failure rather than a file.
 *
 * Idempotent: a record whose block already matches is not opened for writing.
 *
 * Exit 0 every record agrees, 1 a record disagrees, 2 the inputs are wrong (no
 * corpus, no assignment table, a block that will not parse, an unknown value).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The one dependency beyond the standard library, and the one failure worth a
// sentence rather than a stack trace: a clone that has not run `pnpm install`
// should be told what to run, not shown where the resolver gave up.
let ParseYaml;
try {
	({ parse: ParseYaml } = await import("yaml"));
} catch {
	console.error("rfc-frontmatter: the `yaml` package is not installed; run `pnpm install` first");
	process.exit(2);
}

const Here = dirname(fileURLToPath(import.meta.url));
const Root = resolve(Here, "..");

const Corpus = "Documentation/RFC/proposed";
const Report = "Documentation/Reference/RFC-Classification.md";
const Registry = "Documentation/RFC/README.md";
const RecordName = /^RFC-(\d{4})-[a-z0-9-]+\.md$/;

/** The closed vocabularies. A value outside one is a typo, not a decision. */
const Axes = new Map([
	["Kind", ["architecture", "contract", "policy", "specification", "method"]],
	[
		"Subject",
		["data", "transport", "identity", "surface", "network", "operation", "economy", "text"],
	],
	["Horizon", ["now", "next", "later"]],
]);

const Statuses = ["proposed", "settled", "superseded"];
const RuleStates = ["current", "open"];
const Kinds = ["rfc"];

const Fail = (message) => {
	console.error(`rfc-frontmatter: ${message}`);
	process.exit(2);
};

/** The fields, in the order the block states them. */
const Order = [
	"title",
	"rfc",
	"category",
	"kind",
	"date",
	"status",
	"horizon",
	"registry",
	"index",
	"owner",
	"applies_to",
	"supersedes",
	"superseded_by",
	"depends",
	"statuses",
];

// --------------------------------------------------------------------------- #
// Inputs
// --------------------------------------------------------------------------- #

/**
 * The assignment table, keyed by the zero-padded number.
 *
 * Read from the audit rather than restated here: seventy-six judgements written
 * twice is one copy that goes stale, and the copy that goes stale is the one a
 * reader trusts. The table is bounded by its own heading and the bucket-count
 * heading that follows it, so the verdict table above it - whose third column is
 * a judgement, not a subject - cannot be mistaken for this one.
 */
function Assignments() {
	let text;
	try {
		text = readFileSync(resolve(Root, Report), "utf8");
	} catch {
		Fail(`cannot read ${Report}; run this from inside the repository`);
	}
	const start = text.indexOf("## Every record assigned");
	const end = text.indexOf("### The bucket counts", start);
	if (start === -1 || end === -1) {
		Fail(`${Report} has no assignment table under "## Every record assigned"`);
	}
	const rows = new Map();
	for (const line of text.slice(start, end).split("\n")) {
		if (!line.startsWith("|")) continue;
		const cells = line.split("|").map((cell) => cell.trim());
		if (cells.length < 6) continue;
		const [, number, kind, subject, horizon] = cells;
		if (!/^\d{4}$/.test(number)) continue;
		for (const [axis, value] of [
			["Kind", kind],
			["Subject", subject],
			["Horizon", horizon],
		]) {
			if (!Axes.get(axis).includes(value)) {
				Fail(`RFC-${number}: ${axis} ${JSON.stringify(value)} is not in the vocabulary`);
			}
		}
		rows.set(number, { kind, subject, horizon });
	}
	if (rows.size === 0) Fail(`the assignment table in ${Report} parsed to no rows`);
	return rows;
}

function Records() {
	let names;
	try {
		names = readdirSync(resolve(Root, Corpus));
	} catch {
		Fail(`cannot read ${Corpus}; run this from inside the repository`);
	}
	return names.filter((name) => RecordName.test(name)).sort();
}

/** The date the file entered the repository, for a record that never stated one. */
function FirstCommit(relative) {
	try {
		const out = execFileSync(
			"git",
			["-C", Root, "log", "--diff-filter=A", "--format=%ad", "--date=short", "--", relative],
			{ encoding: "utf8" },
		)
			.trim()
			.split("\n")
			.filter(Boolean);
		return out.length ? out[out.length - 1] : null;
	} catch {
		return null;
	}
}

// --------------------------------------------------------------------------- #
// Reading a record
// --------------------------------------------------------------------------- #

/** Everything before the first `## ` at column zero. */
function SplitHeader(text) {
	const index = text.indexOf("\n## ");
	if (index === -1) return [text, ""];
	return [text.slice(0, index), text.slice(index)];
}

/** The body's named sections, keyed by heading text. */
function Sections(body) {
	const out = new Map();
	const marks = [...body.matchAll(/\n## (.+)\n/g)].map((match) => ({
		name: match[1].trim(),
		at: match.index,
		start: match.index + match[0].length,
	}));
	for (let index = 0; index < marks.length; index += 1) {
		const end = index + 1 < marks.length ? marks[index + 1].at : body.length;
		out.set(marks[index].name, body.slice(marks[index].start, end));
	}
	return out;
}

/**
 * A YAML block at the top of the file, and the text after it.
 *
 * The block is read with the YAML parser, not with a line pattern: a value that
 * wrapped, a quoted scalar that holds a colon, and a nested sequence all arrive
 * as the shape they were written as.
 */
function SplitFrontmatter(text) {
	if (!text.startsWith("---\n")) return { data: null, body: text };
	const end = text.indexOf("\n---\n", 3);
	if (end === -1) return { data: null, body: text, error: "the block is never closed" };
	const raw = text.slice(4, end + 1);
	let data;
	try {
		data = ParseYaml(raw);
	} catch (error) {
		return { data: null, body: text, error: String(error.message ?? error) };
	}
	if (data === null || typeof data !== "object" || Array.isArray(data)) {
		return { data: null, body: text, error: "the block is not a mapping" };
	}
	return { data, body: text.slice(end + 5), raw, block: text.slice(0, end + 5) };
}

/** The legacy `# RFC-00NN - Title` and `**Field:** value` header, for migration. */
function LegacyHeader(header) {
	const lines = header.split("\n");
	const h1 = (lines[0] ?? "").match(/^#\s+RFC-(\d{4})\s+[-\u2014]\s+(.+)$/);
	const flat = header.replace(/\s+/g, " ").trim();
	const fields = {};
	const marks = [...flat.matchAll(/\*\*([A-Za-z ]+):\*\*/g)];
	for (let index = 0; index < marks.length; index += 1) {
		const start = marks[index].index + marks[index][0].length;
		const end = index + 1 < marks.length ? marks[index + 1].index : flat.length;
		fields[marks[index][1]] = flat.slice(start, end).trim();
	}
	return { number: h1 ? h1[1] : null, title: h1 ? h1[2].trim() : null, fields };
}

// --------------------------------------------------------------------------- #
// The statuses list
// --------------------------------------------------------------------------- #

/** One line, so a value split by a line break reads as one value. */
const Flat = (text) => text.replace(/\s+/g, " ").trim();

/** The record's rules, as its Decision section states them. */
function Rules(decision) {
	const subsections = [...decision.matchAll(/\n### (.+)\n/g)];
	if (subsections.length) {
		return subsections.map((match, index) => {
			const start = match.index + match[0].length;
			const end =
				index + 1 < subsections.length ? subsections[index + 1].index : decision.length;
			const heading = match[1]
				.replace(/^\d+\.\s+/, "")
				.replace(/\*\*/g, "")
				.trim();
			return { name: heading, text: Flat(decision.slice(start, end)) };
		});
	}

	const numbered = [];
	let current = null;
	for (const line of decision.split("\n")) {
		const item = line.match(/^\d+\.\s+(.*)$/);
		if (item) {
			if (current) numbered.push(current);
			current = item[1];
		} else if (current && /^\s{2,}\S/.test(line)) current += ` ${line.trim()}`;
		else if (current) {
			numbered.push(current);
			current = null;
		}
	}
	if (current) numbered.push(current);
	if (numbered.length) {
		return numbered.map((text) => ({ name: FirstSentence(text), text: Flat(text) }));
	}

	// A bullet list is the same statement as a numbered one: a Decision that
	// carries one is a record whose rules are its items, and its lead-in
	// paragraph is the sentence that introduces them.
	const bullets = [];
	let bullet = null;
	for (const line of decision.split("\n")) {
		const item = line.match(/^[-*]\s+(.*)$/);
		if (item) {
			if (bullet) bullets.push(bullet);
			bullet = item[1];
		} else if (bullet && /^\s{2,}\S/.test(line)) bullet += ` ${line.trim()}`;
		else if (bullet && line.trim()) {
			bullets.push(bullet);
			bullet = null;
		}
	}
	if (bullet) bullets.push(bullet);
	if (bullets.length) {
		return bullets.map((text) => ({ name: FirstSentence(text), text: Flat(text) }));
	}

	return decision
		.split(/\n\s*\n/)
		.map((block) => block.trim())
		.filter((block) => block && !/^[|#>\-*]/.test(block))
		.map((block) => {
			const text = Flat(block);
			return { name: FirstSentence(text), text };
		});
}

/** The rule in a few words: its first sentence, without the emphasis around it. */
function FirstSentence(text) {
	const flat = Flat(text).replace(/\*\*/g, "");
	const match = flat.match(/^.+?[.:](?=\s|$)/);
	const sentence = (match ? match[0] : flat).replace(/[.:]$/, "").trim();
	if (sentence.length <= 80) return sentence;
	const cut = sentence.slice(0, 80);
	return `${cut.slice(0, cut.lastIndexOf(" ")) || cut}...`;
}

const Commands = new Set(
	"pnpm node npx npm python python3 gh git spacetime firebase curl jq grep rg test cat ls echo make cargo uv docker".split(
		" ",
	),
);

const Code = /\.(?:mjs|cjs|js|jsx|ts|tsx|astro|json|sh|py|toml|ya?ml|css|rs)$/;
const Skipped = new Set(["node_modules", ".git", "Target", ".astro", ".turbo", ".hermes", "dist"]);

let paths = null;

/** Every path in the tree, by basename, so `TokenContract.mjs` resolves from a citation. */
function Paths() {
	if (paths) return paths;
	paths = new Map();
	const walk = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (Skipped.has(entry.name)) continue;
			const path = join(directory, entry.name);
			const relative = path.slice(Root.length + 1);
			const known = paths.get(entry.name) ?? [];
			known.push(relative);
			paths.set(entry.name, known);
			if (entry.isDirectory()) walk(path);
		}
	};
	walk(Root);
	return paths;
}

let scriptNames = null;

/** The scripts `package.json` declares, so a citation of one can be checked. */
function Scripts() {
	if (scriptNames) return scriptNames;
	try {
		const manifest = JSON.parse(readFileSync(resolve(Root, "package.json"), "utf8"));
		scriptNames = new Set(Object.keys(manifest.scripts ?? {}));
	} catch {
		scriptNames = new Set();
	}
	return scriptNames;
}

/**
 * The first file or command a rule names, and whether the tree holds it.
 *
 * A citation is read from the rule's own backticked spans: `Scripts/Foo.mjs:12`
 * is a file and a line, `pnpm run check` is a script. A record number
 * (`RFC-0013`), a term or a bare command name is not evidence and is skipped -
 * what is wanted is the artifact that settles the rule, not the record the rule
 * cites.
 */
function Artifact(text) {
	for (const match of text.matchAll(/`([^`]+)`/g)) {
		const raw = match[1].trim().replace(/[.,;:]$/, "");
		const tokens = raw.split(/\s+/);
		if (tokens.length === 1 && Commands.has(tokens[0])) continue;
		for (const token of tokens) {
			if (!token || Commands.has(token)) continue;
			if (token.includes("<") || token.includes("$") || token.startsWith("-")) continue;
			const bare = token.replace(/:\d+(?:-\d+)?$/, "").replace(/^\.\//, "");
			if (!Code.test(bare) || bare.includes("*")) continue;
			if (existsSync(resolve(Root, bare))) return { evidence: token, exists: true };
			const known = Paths().get(basename(bare));
			if (known) return { evidence: token, exists: true, path: known[0] };
			return { evidence: token, exists: false };
		}
	}
	for (const match of text.matchAll(/`pnpm (?:run )?([A-Za-z:]+)`/g)) {
		if (Scripts().has(match[1])) return { evidence: `pnpm run ${match[1]}`, exists: true };
	}
	return null;
}

/**
 * One entry per rule: the rule's name, whether the tree holds it, and the file or
 * command that settles it. A rule that names none is `open` and says so.
 */
function RuleStatuses(decision) {
	return Rules(decision).map((rule) => {
		const artifact = Artifact(rule.text);
		const intent = /\bUNKNOWN\b|\(intent/.test(rule.text);
		const state = artifact?.exists && !intent ? "current" : "open";
		const evidence = artifact ? artifact.evidence : "the rule names no file or command";
		if (!RuleStates.includes(state)) {
			Fail(`a rule resolved to ${JSON.stringify(state)}, which is not a state`);
		}
		return { name: rule.name, state, evidence };
	});
}

// --------------------------------------------------------------------------- #
// Rendering
// --------------------------------------------------------------------------- #

const Plain = /^[A-Za-z0-9][A-Za-z0-9 ._/'(),+&-]*$/;
const Reserved = /^(?:true|false|null|yes|no|on|off|~)$/i;
const Numeric = /^[-+]?(?:\d+\.?\d*|\.\d+)$/;

/**
 * One scalar.
 *
 * A value is written plain only when plain reads back as the same string: no
 * colon, no comment marker, no leading punctuation, no reserved word, nothing a
 * reader would resolve as a number or a boolean. Everything else is a
 * double-quoted scalar, which is valid YAML 1.2 for any string this corpus holds.
 */
function Scalar(value) {
	const text = String(value);
	if (!text) return '""';
	const safe =
		Plain.test(text) &&
		!Reserved.test(text) &&
		!Numeric.test(text) &&
		!text.includes(" #") &&
		!text.includes(": ") &&
		!text.endsWith(":");
	if (safe) return text;
	// A single-quoted scalar is what a formatter reaches for when the text holds a
	// double quote: it needs no escape, so it is the shorter and steadier form.
	if (text.includes('"') && !text.includes("'")) return `'${text}'`;
	return JSON.stringify(text);
}

/** A block sequence under a key, indented four spaces, one item per line. */
function Sequence(key, values) {
	if (!values.length) return [`${key}: []`];
	return [`${key}:`, ...values.flatMap((value) => Item(4, value))];
}

/** One mapping entry, as a scalar or as a literal block when it would run past the column. */
function Entry(indent, key, value) {
	const pad = " ".repeat(indent);
	const line = `${pad}${key}: ${Scalar(value)}`;
	if (line.length <= 100) return [line];
	return [`${pad}${key}: |-`, `${pad}    ${value}`];
}

/** One sequence item, by the same rule. */
function Item(indent, value) {
	const pad = " ".repeat(indent);
	const line = `${pad}- ${Scalar(value)}`;
	if (line.length <= 100) return [line];
	return [`${pad}- |-`, `${pad}    ${value}`];
}

function Render(model) {
	const lines = ["---"];
	for (const field of Order) {
		const value = model[field];
		if (value === undefined || value === null) continue;
		if (field === "rfc") {
			lines.push(`rfc: ${String(value).padStart(4, "0")}`);
			continue;
		}
		if (field === "statuses") {
			if (!value.length) {
				lines.push("statuses: []");
				continue;
			}
			lines.push("statuses:");
			for (const entry of value) {
				lines.push(...Entry(4, "- name", entry.name));
				lines.push(...Entry(6, "state", entry.state));
				lines.push(...Entry(6, "evidence", entry.evidence));
			}
			continue;
		}
		if (field === "depends") {
			lines.push(...Sequence("depends", value));
			continue;
		}
		lines.push(...Entry(0, field, value));
	}
	lines.push("---");
	return `${lines.join("\n")}\n`;
}

/** Split a run-on dependency line on its own commas, respecting quotes and brackets. */
function Dependencies(text) {
	if (!text || /^none\b/i.test(text)) return [];
	const items = [];
	let depth = 0;
	let quote = null;
	let current = "";
	for (const character of text) {
		if (quote) {
			if (character === quote) quote = null;
			current += character;
			continue;
		}
		if (character === '"' || character === "`") {
			quote = character;
			current += character;
			continue;
		}
		if (character === "(" || character === "[") depth += 1;
		if (character === ")" || character === "]") depth = Math.max(0, depth - 1);
		if (character === "," && depth === 0) {
			items.push(current.trim());
			current = "";
			continue;
		}
		current += character;
	}
	if (current.trim()) items.push(current.trim());
	return items.filter(Boolean);
}

// --------------------------------------------------------------------------- #
// The model
// --------------------------------------------------------------------------- #

const Capital = (word) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * One record's frontmatter, from what the file states and what the audit holds.
 *
 * `carried` is read from the frontmatter when the file has one and from the
 * legacy header when it does not, so the same function migrates a record and
 * then checks it on every later run.
 */
function Model(name, text, assignments) {
	const number = name.match(RecordName)[1];
	const assignment = assignments.get(number);
	if (!assignment) return { problem: `${name}: no row in the assignment table` };

	const { data: front, body, error, block: existing } = SplitFrontmatter(text);
	if (error) return { problem: `${name}: the frontmatter does not parse (${error})` };

	// A block that exists is expected to be complete: the defaults below exist to
	// migrate a legacy header, and using one to paper over a deleted field would
	// write a value nobody chose.
	if (front) {
		for (const field of ["title", "status", "kind"]) {
			if (front[field] === undefined)
				return { problem: `${name}: the frontmatter has no ${field}` };
		}
	}

	const [header, remainder] = SplitHeader(body);
	const legacy = LegacyHeader(header);
	const carried = front ?? {};
	const fields = legacy.fields ?? {};

	const title = carried.title ?? legacy.title;
	if (!title)
		return { problem: `${name}: no title in the frontmatter and no H1 to read one from` };

	const sections = Sections(remainder || body);
	const decision = sections.get("Decision");
	if (decision === undefined) return { problem: `${name}: no Decision section` };

	const status = String(carried.status ?? fields.Status ?? "proposed").toLowerCase();
	if (!Statuses.includes(status)) {
		return {
			problem: `${name}: status ${JSON.stringify(status)} is not one of ${Statuses.join(", ")}`,
		};
	}

	const model = {
		title,
		rfc: number,
		category: `${Capital(assignment.kind)}/${Capital(assignment.subject)}`,
		kind: carried.kind ?? "rfc",
		date: carried.date ?? fields.Date ?? FirstCommit(`${Corpus}/${name}`),
		status,
		horizon: assignment.horizon,
		registry: Registry,
		index: Registry,
		owner: carried.owner ?? fields.Owner ?? "operator",
		applies_to: carried.applies_to ?? fields["Applies to"],
		supersedes: carried.supersedes ?? fields.Supersedes ?? "none",
		superseded_by: carried.superseded_by ?? fields["Superseded by"] ?? "none",
		depends: Array.isArray(carried.depends)
			? carried.depends.map(String)
			: Dependencies(fields["Task dependencies"] ?? ""),
		statuses: RuleStatuses(decision),
	};

	if (!Kinds.includes(model.kind)) {
		return {
			problem: `${name}: kind ${JSON.stringify(model.kind)} is not one of ${Kinds.join(", ")}`,
		};
	}

	// The rendered block is parsed back before it is trusted: a quoting decision
	// that reads as another type is a failure of this tool, not a record's defect.
	const rendered = Render(model);
	const parsed = RoundTrip(rendered);
	if (!parsed) return { problem: `${name}: the rendered block does not parse back` };
	const disagree = Compare(model, parsed);
	if (disagree) return { problem: `${name}: the rendered block reads back as ${disagree}` };

	return {
		number,
		model,
		block: rendered,
		body: remainder || body,
		existing: existing ?? null,
	};
}

function RoundTrip(block) {
	try {
		return ParseYaml(block.slice(4, block.lastIndexOf("---")));
	} catch {
		return null;
	}
}

/** The first field whose read-back value is not the value that was written. */
function Compare(model, parsed) {
	for (const field of Order) {
		const wanted = model[field];
		if (wanted === undefined || wanted === null) continue;
		const got = parsed[field];
		if (field === "rfc") {
			if (Number(String(got).padStart(4, "0")) !== Number(wanted)) {
				return `${field}=${JSON.stringify(got)}`;
			}
			continue;
		}
		if (field === "statuses") {
			if (!Array.isArray(got) || got.length !== wanted.length) return `${field} length`;
			for (let index = 0; index < wanted.length; index += 1) {
				for (const key of ["name", "state", "evidence"]) {
					if (String(got[index]?.[key]) !== String(wanted[index][key])) {
						return `${field}[${index}].${key}`;
					}
				}
			}
			continue;
		}
		if (field === "depends") {
			const left = (got ?? []).map(String).join("\u0000");
			const right = wanted.map(String).join("\u0000");
			if (left !== right) return `${field}=${JSON.stringify(got)}`;
			continue;
		}
		if (String(got ?? "") !== String(wanted)) return `${field}=${JSON.stringify(got)}`;
	}
	return null;
}

// --------------------------------------------------------------------------- #
// Commands
// --------------------------------------------------------------------------- #

function main(argv) {
	const write = argv.includes("--write");
	const show = argv.indexOf("--show");
	const only = argv.indexOf("--only");
	const wanted = show !== -1 ? argv[show + 1] : only !== -1 ? argv[only + 1] : null;

	const assignments = Assignments();
	const names = Records();
	const problems = [];
	const changed = [];
	let agreed = 0;
	const perState = { current: 0, open: 0 };
	const perCategory = new Map();

	for (const name of names) {
		const number = name.match(RecordName)[1];
		if (wanted && number !== wanted.padStart(4, "0")) continue;
		const path = resolve(Root, Corpus, name);
		const result = Model(name, readFileSync(path, "utf8"), assignments);
		if (result.problem) {
			problems.push(result.problem);
			continue;
		}
		const { model, block, body } = result;
		for (const entry of model.statuses) perState[entry.state] += 1;
		perCategory.set(model.category, (perCategory.get(model.category) ?? 0) + 1);

		if (show !== -1) {
			process.stdout.write(block);
			return 0;
		}

		if (result.existing === block) {
			agreed += 1;
			continue;
		}
		changed.push({ name, block, body });
		if (write) {
			writeFileSync(path, block + (body.startsWith("\n") ? body : `\n${body}`), "utf8");
		}
	}

	if (show !== -1) return 0;

	console.log(`records: ${names.length}   assignment rows: ${assignments.size}`);
	console.log(
		`statuses: ${perState.current} current, ${perState.open} open across ` +
			`${perState.current + perState.open} rules`,
	);
	const categories = [...perCategory.entries()].sort(
		(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
	);
	console.log(
		`categories: ${categories.map(([value, count]) => `${value} ${count}`).join(", ")}`,
	);
	console.log(
		`${write ? "written" : "checked"}: ${changed.length} changed, ${agreed} already agreed, ` +
			`${problems.length} problem(s)`,
	);

	for (const entry of changed.slice(0, 12)) {
		console.log(`  ${write ? "write" : "differs"} ${entry.name}`);
	}
	if (changed.length > 12) console.log(`  ... and ${changed.length - 12} more`);
	for (const problem of problems) console.error(`  ${problem}`);

	if (problems.length) return 1;
	return changed.length && !write ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));

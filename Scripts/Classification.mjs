#!/usr/bin/env node
/**
 * The classification guard, and the one tool allowed to write it.
 *
 *   node Scripts/Classification.mjs          # check every record states its three axes
 *   node Scripts/Classification.mjs --write  # write the axes into each record's header
 *
 * A record states what it decides, what it is about and what it presupposes, in
 * three header fields beside its status. The assignment for all seventy-six
 * records is the table under `## Every record assigned` in
 * `Documentation/Reference/RFC-Classification.md` - the audit that produced the
 * taxonomy - and this script is the only thing that writes it into the corpus.
 *
 * Two reasons it exists rather than a hundred hand edits:
 *
 *   1. Seventy-six headers, three values each, is a transform nobody should do
 *      by hand. A header wraps at a hundred columns and the label itself can
 *      land on a line break (`**Decision` then `class:** policy`), so a
 *      find-and-replace that assumes one line is wrong on three of them.
 *   2. The previous round shipped a board field that was null on every item,
 *      because nothing checked it. `--check` is that check: it exits non-zero
 *      when a record is missing an axis, carries a value outside the closed
 *      vocabulary, or disagrees with the assignment. It runs inside
 *      `pnpm run check`.
 *
 * Idempotent by construction: a record whose three values already agree with the
 * assignment is not opened for writing, so a second `--write` changes no bytes.
 *
 * Exit 0 every record is classified and agrees, 1 a record does not, 2 the
 * inputs are wrong (no corpus, no assignment table, an unknown value).
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const Here = dirname(fileURLToPath(import.meta.url));
const Root = resolve(Here, "..");

const Corpus = "Documentation/RFC/proposed";
const Report = "Documentation/Reference/RFC-Classification.md";

/**
 * The closed vocabularies. A value that is not in these lists is not a
 * classification, it is a typo that reads like one, so an unknown value fails
 * the run rather than being written.
 */
const Axes = [
	["Kind", ["architecture", "contract", "policy", "specification", "method"]],
	[
		"Subject",
		["data", "transport", "identity", "surface", "network", "operation", "economy", "text"],
	],
	["Horizon", ["now", "next", "later"]],
];

const AxesByName = new Map(Axes);
const RecordName = /^RFC-(\d{4})-[a-z0-9-]+\.md$/;

/** Every value, with the axis that owns it, for the collision check. */
function Owner(value) {
	for (const [axis, values] of Axes) {
		if (values.includes(value)) return axis;
	}
	return null;
}

function Fail(message) {
	console.error(`classification: ${message}`);
	process.exit(2);
}

/**
 * The assignment table, keyed by the zero-padded number.
 *
 * Read from the report rather than restated here: the audit is the argument for
 * the taxonomy, and a second copy of seventy-six judgements would be the copy
 * that goes stale. The table is bounded by its own heading and the bucket-count
 * heading that follows it, so the audit table above it - whose third column is a
 * verdict, not a subject - cannot be mistaken for this one.
 */
function Assignments() {
	const path = resolve(Root, Report);
	let text;
	try {
		text = readFileSync(path, "utf8");
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
		// A leading pipe gives an empty first cell; the row is number, kind,
		// subject, horizon, and then prose that may hold no pipe at all.
		if (cells.length < 6) continue;
		const [, number, kind, subject, horizon] = cells;
		if (!/^\d{4}$/.test(number)) continue;
		for (const [axis, value] of [
			["Kind", kind],
			["Subject", subject],
			["Horizon", horizon],
		]) {
			if (!AxesByName.get(axis).includes(value)) {
				Fail(`RFC-${number}: ${axis} ${JSON.stringify(value)} is not in the vocabulary`);
			}
		}
		rows.set(number, { kind, subject, horizon });
	}
	if (rows.size === 0) Fail(`the assignment table in ${Report} parsed to no rows`);
	return rows;
}

/** The record's header block: everything before the first `## ` at column zero. */
function Split(text) {
	const index = text.indexOf("\n## ");
	if (index === -1) return [text, ""];
	return [text.slice(0, index), text.slice(index)];
}

/** One line, so a field split by a line break reads as one value. */
function Flat(text) {
	return text.replace(/\s+/g, " ").trim();
}

function Field(flat, name) {
	const match = flat.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*([A-Za-z]+)`));
	return match ? match[1] : null;
}

/** The triple this record must carry. */
function Triple({ kind, subject, horizon }) {
	return `**Kind:** ${kind} **Subject:** ${subject} **Horizon:** ${horizon}`;
}

/**
 * The header with its classification applied, or the header untouched when it
 * already agrees. Returns null when there is nothing to replace: a record with
 * neither `Decision class:` nor a `Kind:` line is one this script cannot
 * classify, and guessing at its shape is worse than failing.
 */
function Apply(header, assignment) {
	const flat = Flat(header);
	const current = {
		kind: Field(flat, "Kind"),
		subject: Field(flat, "Subject"),
		horizon: Field(flat, "Horizon"),
	};
	if (current.kind && current.subject && current.horizon) {
		if (
			current.kind === assignment.kind &&
			current.subject === assignment.subject &&
			current.horizon === assignment.horizon
		) {
			return header;
		}
		const existing =
			/\*\*Kind:\*\*\s*[A-Za-z]+[\s\S]*?\*\*Subject:\*\*\s*[A-Za-z]+[\s\S]*?\*\*Horizon:\*\*\s*[A-Za-z]+/;
		if (existing.test(header)) return header.replace(existing, Triple(assignment));
	}
	// The label itself can wrap: `**Decision` on one line, `class:** policy` on
	// the next, which is why the match allows whitespace inside the name.
	const decision = /\*\*Decision\s+class:\*\*\s*[A-Za-z]+/;
	if (decision.test(header)) return header.replace(decision, Triple(assignment));
	return null;
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

/**
 * The board's own collision, as an executable check: a value that means one
 * thing on two axes teaches a reader nothing on the second, which is what
 * `governance` did when it was both a class and an area.
 */
function NoCollision() {
	const owners = new Map();
	for (const [axis, values] of Axes) {
		for (const value of values) {
			if (owners.has(value)) {
				Fail(`${value} appears on ${owners.get(value)} and on ${axis}`);
			}
			owners.set(value, axis);
		}
	}
	return owners.size;
}

function Count(values) {
	const counts = new Map();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return [...counts.entries()].sort(
		(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
	);
}

function main(argv) {
	const write = argv.includes("--write");
	const distinct = NoCollision();
	const assignments = Assignments();
	const names = Records();

	const problems = [];
	const perAxis = new Map(Axes.map(([axis]) => [axis, []]));
	const present = new Set();
	let unchanged = 0;
	let written = 0;

	for (const name of names) {
		const number = name.match(RecordName)[1];
		const path = resolve(Root, Corpus, name);
		const text = readFileSync(path, "utf8");
		const [header, body] = Split(text);
		const assignment = assignments.get(number);
		if (!assignment) {
			problems.push(`${name}: no row in the assignment table`);
			continue;
		}
		present.add(number);
		const applied = Apply(header, assignment);
		if (applied === null) {
			problems.push(`${name}: no "Decision class:" or "Kind:" line to replace`);
			continue;
		}
		if (applied === header) {
			unchanged += 1;
		} else if (write) {
			writeFileSync(path, applied + body, "utf8");
			written += 1;
		} else {
			const flat = Flat(header);
			const carried = ["Kind", "Subject", "Horizon"].map((axis) => Field(flat, axis));
			problems.push(
				`${name}: header says ${JSON.stringify(carried)}, assignment says ` +
					`${JSON.stringify([assignment.kind, assignment.subject, assignment.horizon])}`,
			);
		}
		// The counts are read back from the file as it will stand, not from the
		// assignment, so a write that half-landed cannot report a full table.
		const settled = Flat(write ? applied : header);
		perAxis.get("Kind").push(Field(settled, "Kind") ?? "MISSING");
		perAxis.get("Subject").push(Field(settled, "Subject") ?? "MISSING");
		perAxis.get("Horizon").push(Field(settled, "Horizon") ?? "MISSING");
	}

	for (const number of assignments.keys()) {
		if (!present.has(number)) problems.push(`RFC-${number}: assigned but no record file`);
	}

	console.log(`records: ${names.length}   assignment rows: ${assignments.size}`);
	console.log(`vocabulary: ${distinct} values, none on two axes`);
	for (const [axis] of Axes) {
		const counts = Count(perAxis.get(axis));
		const missing = counts.find(([value]) => value === "MISSING");
		console.log(
			`${axis}: ${counts.map(([value, count]) => `${value} ${count}`).join(", ")}` +
				(missing ? `   MISSING ${missing[1]}` : ""),
		);
	}
	console.log(
		`${write ? "written" : "checked"}: ${names.length - unchanged} changed, ` +
			`${unchanged} already agreed, ${written} file(s) written, ${problems.length} problem(s)`,
	);

	if (problems.length) {
		for (const problem of problems) console.error(`  ${problem}`);
		return 1;
	}
	return 0;
}

process.exit(main(process.argv.slice(2)));

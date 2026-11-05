import { readFileSync } from "node:fs";
import { fail } from "../../CLI/Parser/Output/Failure.ts";
import type { Rules } from "../../Model/Author/Decision.ts";
import { buckets, type Vocabulary } from "../../Model/Author/Evidence.ts";
import { Keyword } from "../Keyword/Keyword.ts";
import { loadVocabulary } from "../Keyword/Load.ts";
import { locate } from "../Load/Load.ts";
import type { Configuration } from "../Schema/Schema.ts";

/** Where the tracked weights live, relative to the repository root. */
export const DEFAULT_RULES = "Maintain/Configuration/Rules/Rules.json";

/**
 * The rules file in use.
 *
 * `MAINTAIN_RULES` exists so a test - or a person trying a different tuning -
 * can point the classifier at another file without editing the tracked one.
 */
export function rulesPath(): string {
	return locate(undefined, "MAINTAIN_RULES", DEFAULT_RULES);
}

function record(value: unknown): Record<string, unknown> | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

/** A weight: a finite number that is not negative. */
function amount(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
	return value;
}

/**
 * One weight map, normalized.
 *
 * Keys are lowercased and trimmed so `Figma.com` and `figma.com` are the same
 * host, and a bad entry is dropped with a warning rather than taking the whole
 * file down: one typo in a long weights list must not stop a run.
 */
function amounts(value: unknown, field: string, source: string): Record<string, number> {
	if (value === undefined || value === null) return {};
	const map = record(value);
	if (map === null) {
		throw fail("schema-invalid", `\`${field}\` must be an object of name → weight`, {
			path: source,
			field,
		});
	}

	const collected: Record<string, number> = {};
	for (const [raw, value] of Object.entries(map)) {
		const name = raw.toLowerCase().trim();
		const parsed = amount(value);
		if (name === "" || parsed === null) {
			process.stderr.write(
				`maintain: ${source}: ignoring \`${field}.${raw}\` (${String(value)}); a weight is a number ≥ 0\n`,
			);
			continue;
		}
		collected[name] = parsed;
	}
	return collected;
}

/**
 * Validate a parsed rules file.
 *
 * The threshold is required, not defaulted: a classifier whose cut-off lives in
 * code is a classifier nobody can tune. A missing threshold is a failure that
 * names the field, never a silent fallback.
 */
export function validate(value: unknown, source: string): Rules {
	const document = record(value);
	if (document === null) {
		throw fail("schema-invalid", "the rules file must be a JSON object", {
			path: source,
		});
	}

	const threshold = record(document["threshold"]);
	if (threshold === null) {
		throw fail("schema-invalid", "`threshold` must be an object with `score` and `gap`", {
			path: source,
			field: "threshold",
		});
	}
	const score = amount(threshold["score"]);
	if (score === null) {
		throw fail("schema-invalid", "`threshold.score` must be a number ≥ 0", {
			path: source,
			field: "threshold.score",
		});
	}
	const gap = amount(threshold["gap"]);
	if (gap === null) {
		throw fail("schema-invalid", "`threshold.gap` must be a number ≥ 0", {
			path: source,
			field: "threshold.gap",
		});
	}

	const declared = record(document["lists"]);
	if (declared === null) {
		throw fail("schema-invalid", "`lists` must be an object keyed by list slug", {
			path: source,
			field: "lists",
		});
	}

	const lists: Rules["lists"] = {};
	for (const [slug, entry] of Object.entries(declared)) {
		const name = slug.trim();
		const detail = record(entry);
		if (name === "" || detail === null) {
			process.stderr.write(
				`maintain: ${source}: ignoring \`lists.${slug}\`; a list is an object of weights\n`,
			);
			continue;
		}
		lists[name] = {
			keywords: amounts(detail["keywords"], `lists.${name}.keywords`, source),
			domains: amounts(detail["domains"], `lists.${name}.domains`, source),
		};
	}

	if (Object.keys(lists).length === 0) {
		throw fail("schema-invalid", "`lists` names no list", {
			path: source,
			field: "lists",
		});
	}

	const version = document["version"];
	return {
		version: typeof version === "number" ? version : 1,
		threshold: { score, gap },
		lists,
	};
}

/** What the identifier map and the rules file agree a list is. */
export type Scope = {
	/** The weights to score with: only lists the map declares, when it declares any. */
	rules: Rules;
	/** Every slug a decision may name, in the authority's order. */
	slugs: string[];
	/** Rules keys the map does not declare, and which are therefore dropped. */
	dropped: string[];
};

/**
 * Narrow the rules to the lists the identifier map declares.
 *
 * The map is the authority on what a list is *called*; the rules file only says
 * how to weigh one. A rule for a slug the map does not declare is dropped,
 * because keeping it would make the weights file a second taxonomy - a map of
 * `reading` and `recipes` would still be told to place authors into `CODE`.
 *
 * Two degradations, both announced rather than silent: no map at all, and a map
 * that declares no lists. In either case there is nothing to narrow to, so the
 * rules file's own keys are the only list vocabulary available and every
 * command keeps working.
 */
export function scope(rules: Rules, configuration: Configuration | null): Scope {
	const source = rulesPath();
	const declared = configuration?.lists.map((entry) => entry.slug) ?? [];

	if (declared.length === 0) {
		process.stderr.write(
			`maintain: ${source}: ${configuration === null ? "no identifier map" : "the identifier map declares no lists"}; the rules file's own keys are the list vocabulary\n`,
		);
		return { rules, slugs: Object.keys(rules.lists), dropped: [] };
	}

	const configured = new Set(declared);
	const kept: Rules["lists"] = {};
	for (const slug of declared) {
		const rule = rules.lists[slug];
		if (rule !== undefined) kept[slug] = rule;
	}

	const dropped = Object.keys(rules.lists).filter((slug) => !configured.has(slug));
	if (dropped.length > 0) {
		process.stderr.write(
			`maintain: ${source}: dropping weights for ${sample(dropped)}; the identifier map does not declare ${dropped.length === 1 ? "that list" : "those lists"}\n`,
		);
	}

	return { rules: { ...rules, lists: kept }, slugs: declared, dropped };
}

/** The first few of a list, with a count of the rest. */
function sample(entries: readonly string[]): string {
	const shown = entries.slice(0, 5).join(", ");
	return entries.length > 5 ? `${shown}, and ${entries.length - 5} more` : shown;
}

/**
 * Say what the rules cannot do, without stopping.
 *
 * Three ways a hand-edited weights file goes quietly wrong, and each is worth a
 * line on stderr rather than a failure: a keyword weight for a list the
 * evidence has no bucket for, a weight naming a term the vocabulary never
 * counts, and a vocabulary term the file forgot to weight.
 */
export function warn(rules: Rules, source: string, vocabulary: Vocabulary = Keyword): void {
	const declared = new Set<string>(buckets(vocabulary));
	const notes: string[] = [];

	for (const [list, rule] of Object.entries(rules.lists)) {
		if (declared.has(list) || Object.keys(rule.keywords ?? {}).length === 0) continue;
		notes.push(`keyword weights for "${list}" are inert: the evidence has no "${list}" bucket`);
	}

	const dead: string[] = [];
	const unweighted: string[] = [];
	for (const bucket of buckets(vocabulary)) {
		const rule = rules.lists[bucket];
		if (rule === undefined) continue;
		const weighted = rule.keywords ?? {};
		const terms = (vocabulary[bucket] ?? []).map((term) => term.toLowerCase().trim());
		const known = new Set(terms);
		for (const term of Object.keys(weighted))
			if (!known.has(term)) dead.push(`${bucket}:${term}`);
		for (const term of terms)
			if (weighted[term] === undefined) unweighted.push(`${bucket}:${term}`);
	}
	if (dead.length > 0) notes.push(`weights terms the vocabulary does not count: ${sample(dead)}`);
	if (unweighted.length > 0)
		notes.push(`does not weight every vocabulary term (they score 0): ${sample(unweighted)}`);

	if (notes.length > 0) process.stderr.write(`maintain: ${source}: ${notes.join("; ")}\n`);
}

/** Read, validate and report on the rules file. */
export function load(): Rules {
	const path = rulesPath();
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch {
		throw fail("no-rules", "the rules file is missing", {
			expected: path,
			next: "restore the tracked file: git checkout -- Maintain/Configuration/Rules/Rules.json",
		});
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw fail("schema-invalid", "the rules file is not JSON", {
			path,
			reason: error instanceof Error ? error.message : String(error),
		});
	}

	const rules = validate(parsed, path);
	warn(rules, path, loadVocabulary());
	return rules;
}

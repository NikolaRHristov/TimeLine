import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { Vocabulary } from "../../Model/Author/Evidence.ts";
import { Keyword } from "./Keyword.ts";

/**
 * Where the vocabulary comes from.
 *
 * The tracked `Keyword.ts` is a default, not a rule: a person whose lists are
 * their own slugs can point this at a JSON file of `{ "<slug>": ["term", ...] }`
 * and count their own words without editing tracked code. Buckets follow that
 * file's keys, in its order.
 */
export const VOCABULARY_ENV = "MAINTAIN_VOCABULARY";

function record(value: unknown): Record<string, unknown> | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

/**
 * One vocabulary, normalized.
 *
 * A bucket whose value is not an array of strings is dropped with a warning
 * rather than taking the file down: one typo in a long word list must not stop
 * a run. Terms are trimmed and a term that becomes empty is dropped, because an
 * empty needle would match everywhere.
 */
export function validate(value: unknown, source: string): Vocabulary | null {
	const document = record(value);
	if (document === null) {
		process.stderr.write(
			`maintain: ${source}: a vocabulary is an object of list slug → array of terms; ignoring it\n`,
		);
		return null;
	}

	const vocabulary: Record<string, string[]> = {};
	for (const [raw, entry] of Object.entries(document)) {
		const slug = raw.trim();
		if (slug === "" || !Array.isArray(entry)) {
			process.stderr.write(
				`maintain: ${source}: ignoring \`${raw}\`; a bucket is an array of terms\n`,
			);
			continue;
		}

		const terms: string[] = [];
		for (const term of entry) {
			if (typeof term !== "string") {
				process.stderr.write(
					`maintain: ${source}: ignoring \`${raw}\` entry (${String(term)}); a term is a string\n`,
				);
				continue;
			}
			const trimmed = term.trim();
			if (trimmed !== "") terms.push(trimmed);
		}
		vocabulary[slug] = terms;
	}

	if (Object.keys(vocabulary).length === 0) {
		process.stderr.write(`maintain: ${source}: names no bucket; ignoring it\n`);
		return null;
	}

	return vocabulary;
}

/**
 * The vocabulary in use: the tracked default unless `MAINTAIN_VOCABULARY`
 * names a readable file.
 *
 * Every failure here degrades to the default with a line on stderr, because a
 * counting vocabulary is an aid, not a prerequisite - a run with the wrong
 * words is still better than no run at all.
 */
export function loadVocabulary(): Vocabulary {
	const configured = process.env[VOCABULARY_ENV];
	if (configured === undefined || configured.trim() === "") return Keyword;

	const path = isAbsolute(configured) ? configured : resolve(process.cwd(), configured);

	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch (error) {
		process.stderr.write(
			`maintain: ${VOCABULARY_ENV}=${configured}: cannot read ${path} (${
				error instanceof Error ? error.message : String(error)
			}); using the tracked vocabulary\n`,
		);
		return Keyword;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		process.stderr.write(
			`maintain: ${VOCABULARY_ENV}=${configured}: ${path} is not JSON (${
				error instanceof Error ? error.message : String(error)
			}); using the tracked vocabulary\n`,
		);
		return Keyword;
	}

	const vocabulary = validate(parsed, path);
	if (vocabulary === null) return Keyword;
	return vocabulary;
}

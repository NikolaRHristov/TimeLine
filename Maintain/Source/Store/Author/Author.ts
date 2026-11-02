import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fail } from "../../CLI/Parser/Output/Failure.ts";
import type { AuthorRecord, DecisionRecord } from "../../Model/Generated/Types.ts";
import { stringify } from "../../Output/Json/Json.ts";

/**
 * A handle as X spells it. The same pattern guards the file name: a handle is
 * part of a path here, so a value carrying `/` or `..` must never reach one.
 */
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

/**
 * A decision as an author record carries it.
 *
 * `by` is the whole contract: `manual` is the person's own answer and no
 * classifier may replace it, while `rule` and `model` are answers a later run
 * is allowed to revise.
 */
export type { AuthorRecord, DecisionRecord } from "../../Model/Generated/Types.ts";

/**
 * One author record in the site's content collection:
 * `Source/Content/Author/<handle>.json`.
 *
 * The rules classifier reads it and never writes it - it is the one place a
 * manual decision can be seen. `author classify infer` is the only writer, and
 * it refuses to touch a record whose decision is `manual`.
 */
export type AuthorStore = {
	/** Absolute path of the Author collection. */
	directory: string;
	/** Every readable record, by handle. Unreadable files are skipped. */
	all(): AuthorRecord[];
	/** One record, or null when the handle has none. */
	get(handle: string): AuthorRecord | null;
	/** Write one record whole; returns its path. */
	write(record: AuthorRecord): string;
};

function record(value: unknown): Record<string, unknown> | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function strings(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

/**
 * Who may have written a decision. A value outside this set is not a decision
 * this version can act on, so a hand-edited typo cannot outrank the classifier.
 */
const BY = new Set<string>(["rule", "model", "manual"]);

function decision(value: unknown): DecisionRecord | null {
	const detail = record(value);
	if (detail === null) return null;
	const by = text(detail["by"]);
	if (by === null || !BY.has(by)) return null;
	const parsed: DecisionRecord = { by: by as DecisionRecord["by"] };
	const confidence = detail["confidence"];
	if (typeof confidence === "number" && Number.isFinite(confidence))
		parsed.confidence = confidence;
	const score = detail["score"];
	if (typeof score === "number" && Number.isFinite(score)) parsed.score = score;
	const gap = detail["gap"];
	if (typeof gap === "number" && Number.isFinite(gap)) parsed.gap = gap;
	const reason = text(detail["reason"]);
	if (reason !== null) parsed.reason = reason;
	return parsed;
}

/** One record, or null when the file is not an author record at all. */
function author(value: unknown): AuthorRecord | null {
	const detail = record(value);
	if (detail === null) return null;
	const handle = text(detail["handle"]);
	if (handle === null || !HANDLE.test(handle)) return null;

	const postCount = detail["postCount"];

	return {
		handle,
		name: text(detail["name"]) ?? handle,
		verified: detail["verified"] === true,
		firstSeenAt: text(detail["firstSeenAt"]) ?? "",
		postCount: typeof postCount === "number" ? postCount : 0,
		lists: strings(detail["lists"]),
		decision: decision(detail["decision"]),
	};
}

/**
 * The Author collection.
 *
 * A missing directory is empty, not an error: a fresh clone has no author
 * records, and a classifier that refused to run until one existed could never
 * produce the first one.
 */
export function open(content: string): AuthorStore {
	const directory = join(content, "Author");

	const read = (path: string): AuthorRecord | null => {
		let raw: string;
		try {
			raw = readFileSync(path, "utf8");
		} catch {
			return null;
		}
		try {
			return author(JSON.parse(raw));
		} catch {
			return null;
		}
	};

	return {
		directory,

		all(): AuthorRecord[] {
			let names: string[];
			try {
				names = readdirSync(directory)
					.filter((name) => name.endsWith(".json"))
					.sort();
			} catch {
				return [];
			}

			const found = new Map<string, AuthorRecord>();
			for (const name of names) {
				const parsed = read(join(directory, name));
				// First file wins: two records for one handle is a hand-edit
				// accident, and picking one deterministically beats reporting both.
				if (parsed !== null && !found.has(parsed.handle)) found.set(parsed.handle, parsed);
			}
			return [...found.values()].sort((left, right) =>
				left.handle < right.handle ? -1 : left.handle > right.handle ? 1 : 0,
			);
		},

		get(handle: string): AuthorRecord | null {
			if (!HANDLE.test(handle)) return null;
			return read(join(directory, `${handle}.json`));
		},

		/**
		 * Write one record whole, over whatever was there.
		 *
		 * Whole and not merged: the caller has already read the record and
		 * decided what survives it, so a merge here would be a second, hidden
		 * opinion about the same fields. The handle is re-validated because it
		 * is a filename: a value carrying `/` or `..` must never reach a path,
		 * however it got here.
		 */
		write(entry: AuthorRecord): string {
			if (!HANDLE.test(entry.handle)) {
				throw fail("io-error", "a handle must be simple before it becomes a filename", {
					handle: entry.handle,
				});
			}

			const path = join(directory, `${entry.handle}.json`);
			try {
				mkdirSync(directory, { recursive: true });
				writeFileSync(path, `${stringify(entry)}\n`, "utf8");
			} catch (error) {
				throw fail("io-error", "could not write the author record", {
					path,
					reason: error instanceof Error ? error.message : String(error),
				});
			}

			return path;
		},
	};
}

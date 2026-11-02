import { fail } from "../../CLI/Parser/Output/Failure.ts";
import type { AuthorRecord, DecisionRecord } from "../../Store/Author/Author.ts";
import type { Completion } from "../Inference/Client.ts";
import type { Evidence } from "./Evidence.ts";

/**
 * How many authors one request may carry.
 *
 * A cap, not a target: it bounds what one reply has to get right, and it is
 * what keeps a 157-author ambiguity from becoming one enormous answer that a
 * model truncates halfway through. The number is deliberately not an option -
 * a caller that could raise it could also make a batch unanswerable.
 */
export const BATCH_LIMIT = 25;

/**
 * A decision as it becomes a record.
 *
 * The rules classifier's `Decision` and the model's answer carry the same
 * fields, and both end up in `Source/Content/Author/<handle>.json`, so the
 * shape that writes one is shared rather than copied: the rules about not
 * restamping an author's history live in `place`, and a second copy of them
 * would drift from this one. `manual` is deliberately absent - a manual record
 * is the person's own answer and no pass may write it.
 */
export type Placement = {
	handle: string;
	list: string | null;
	score?: number;
	gap?: number;
	reason: string;
	/** Who decided it. */
	by: "rule" | "model";
};

/**
 * A placement the model made.
 *
 * The same schema the rules classifier emits - `{handle, list, score, gap,
 * reason}` - with `by` saying who said it. `score` and `gap` are the model's own
 * numbers, not a re-derivation: the rules already refused to decide, so there
 * is no arithmetic here to trust. Both are optional because a reply that names
 * the list and the reason is still a usable answer.
 *
 * `list: null` is a decline, and it is a decision like any other: an account
 * that fits none of the lists is an answer worth caching, and asking again on
 * the next run would only spend the same tokens for the same reply.
 */
export type ModelDecision = Placement & { by: "model" };

/** One entry the reply carried that could not be trusted, and why. */
export type Rejected = { handle: string | null; reason: string };

export type Parsed = {
	decisions: ModelDecision[];
	rejected: Rejected[];
	/** Asked handles with no accepted decision - a superset of `rejected`. */
	unanswered: string[];
};

/** Order by UTF-16 code unit: `localeCompare` depends on the machine's locale. */
function compare(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function record(value: unknown): Record<string, unknown> | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Split the ambiguous authors into requests.
 *
 * In the order given, so the batches are a function of the archive alone: the
 * same evidence always yields the same groups, which is what makes a resumed
 * run ask about the same authors a previous run asked about.
 */
export function batches(evidences: readonly Evidence[], limit: number = BATCH_LIMIT): Evidence[][] {
	if (!Number.isInteger(limit) || limit < 1) {
		throw fail("usage", "a batch holds at least one author", { limit });
	}

	const grouped: Evidence[][] = [];
	for (let index = 0; index < evidences.length; index += limit) {
		grouped.push(evidences.slice(index, index + limit));
	}
	return grouped;
}

/**
 * The standing instruction: who the model is, and the one shape it may answer in.
 *
 * The lists are named here rather than left to the reply, because a slug the
 * person never configured is a decision nothing can apply. The rules' weights
 * are deliberately absent: the model is asked to judge the account, not to
 * audit the arithmetic that could not.
 */
export function system(lists: readonly string[]): string {
	return [
		"You file X (Twitter) accounts into the lists of one person's bookmark collection.",
		"",
		"Judge each account by its body of work, not by a single post. A mixed timeline is",
		"normal: what matters is the subject the account keeps returning to.",
		"",
		`The lists are: ${lists.join(", ")}.`,
		"",
		"Reply with JSON only. No prose, no markdown fence, no commentary outside the JSON.",
		'Shape: {"decisions":[{"handle":"<handle>","list":"<list>","score":<number>,"gap":<number>,"reason":"<one line>"}]}',
		"",
		"- One entry for every handle in the request, and for no other handle.",
		"- `list` is one of the list names above, or null when the account belongs in none of them.",
		"- `score` and `gap` are optional numbers of your own; they are recorded, not checked.",
		"- `reason` is one line of plain English naming the evidence that decided it.",
	].join("\n");
}

/** One bucket's counts as a person reads them: `reading 4, recipes 1, notes 9`. */
function keywordLine(hits: Record<string, number>): string {
	const entries = Object.entries(hits);
	if (entries.length === 0) return "none";
	return entries.map(([bucket, count]) => `${bucket} ${count}`).join(", ");
}

/** One author's aggregated evidence, as the request spells it. */
function block(evidence: Evidence, index: number, total: number): string {
	const domains =
		evidence.domains.length === 0
			? "none"
			: evidence.domains.map((hit) => `${hit.domain}\u00d7${hit.count}`).join(", ");

	const lines = [
		`AUTHOR ${index}/${total}`,
		`handle: ${evidence.handle}`,
		`name: ${evidence.name === "" ? evidence.handle : evidence.name}`,
		`verified: ${evidence.verified ? "yes" : "no"}`,
		`bookmarked posts: ${evidence.posts}`,
		`domains: ${domains}`,
		`keyword hits: ${keywordLine(evidence.keywords)}`,
		"excerpts:",
	];

	if (evidence.excerpts.length === 0) lines.push("- none");
	for (const excerpt of evidence.excerpts) lines.push(`- ${excerpt}`);

	return lines.join("\n");
}

/**
 * One request for one batch: per author, over the aggregated record.
 *
 * Per author and not per post, because that is the judgement the rules could
 * not make. A prompt that listed every post would spend the batch's whole
 * budget on one prolific account, and would invite the model to answer about a
 * post instead of about the account.
 */
export function prompt(evidences: readonly Evidence[], lists: readonly string[]): Completion {
	const blocks = evidences.map((evidence, index) => block(evidence, index + 1, evidences.length));
	return {
		system: system(lists),
		user: [`AUTHORS: ${evidences.length}`, "", blocks.join("\n\n")].join("\n"),
	};
}

/** A reply is JSON, optionally wrapped in the fence a model adds out of habit. */
const FENCE = /^```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)\r?\n?```$/;

function unfence(text: string): string {
	const trimmed = text.trim();
	const fenced = FENCE.exec(trimmed);
	return (fenced?.[1] ?? trimmed).trim();
}

/** The decisions array of a reply: bare, or under the documented `decisions` key. */
function entries(payload: unknown): unknown[] {
	if (Array.isArray(payload)) return payload;

	const listed = record(payload)?.["decisions"];
	if (Array.isArray(listed)) return listed;

	throw fail("model-reply", "the reply is not a JSON array of decisions", {
		expected: '{"decisions":[{"handle":"...","list":"...","reason":"..."}]}',
	});
}

/** One line of text, or null when the value is not one. */
function oneLine(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const flat = value.replace(/\s+/g, " ").trim();
	return flat === "" ? null : flat;
}

/**
 * Read one reply, keeping only what the schema allows.
 *
 * Everything here is a rejection with a reason rather than an exception: a
 * reply that answers 24 of 25 authors correctly is worth 24 cached decisions,
 * and the twenty-fifth must not take the batch down with it. What is *not*
 * forgiven is the reply as a whole not being JSON - that is `model-reply`, and
 * the caller reports the batch as failed rather than inventing decisions.
 *
 * A rejected entry is never written to disk, which is what keeps a malformed
 * answer from becoming a permanent one.
 */
export function parse(
	reply: string,
	handles: ReadonlySet<string>,
	lists: ReadonlySet<string>,
): Parsed {
	const text = unfence(reply);

	let payload: unknown;
	try {
		payload = JSON.parse(text);
	} catch (error) {
		throw fail("model-reply", "the reply is not JSON", {
			reason: message(error),
			preview: text.slice(0, 200),
		});
	}

	const decisions: ModelDecision[] = [];
	const rejected: Rejected[] = [];
	const answered = new Set<string>();

	for (const entry of entries(payload)) {
		const detail = record(entry);
		if (detail === null) {
			rejected.push({
				handle: null,
				reason: "an entry is not an object",
			});
			continue;
		}

		const handle = detail["handle"];
		if (typeof handle !== "string" || handle.trim() === "") {
			rejected.push({ handle: null, reason: "an entry names no handle" });
			continue;
		}
		if (!handles.has(handle)) {
			rejected.push({
				handle,
				reason: "the reply names an author this batch did not ask about",
			});
			continue;
		}
		if (answered.has(handle)) {
			rejected.push({
				handle,
				reason: "the reply answers the same author twice",
			});
			continue;
		}

		let list: string | null;
		const named = detail["list"];
		if (named === null) list = null;
		else if (typeof named === "string" && lists.has(named)) list = named;
		else {
			rejected.push({
				handle,
				reason: `\`list\` must be one of ${[...lists].join(", ")} or null`,
			});
			continue;
		}

		const reason = oneLine(detail["reason"]);
		if (reason === null) {
			rejected.push({
				handle,
				reason: "`reason` must be one line of text",
			});
			continue;
		}

		let score: number | undefined;
		const rawScore = detail["score"];
		if (rawScore !== undefined && rawScore !== null) {
			if (typeof rawScore !== "number" || !Number.isFinite(rawScore)) {
				rejected.push({ handle, reason: "`score` must be a number" });
				continue;
			}
			score = rawScore;
		}

		let gap: number | undefined;
		const rawGap = detail["gap"];
		if (rawGap !== undefined && rawGap !== null) {
			if (typeof rawGap !== "number" || !Number.isFinite(rawGap)) {
				rejected.push({ handle, reason: "`gap` must be a number" });
				continue;
			}
			gap = rawGap;
		}

		const decision: ModelDecision = { handle, list, reason, by: "model" };
		if (score !== undefined) decision.score = score;
		if (gap !== undefined) decision.gap = gap;

		decisions.push(decision);
		answered.add(handle);
	}

	const unanswered = [...handles].filter((handle) => !answered.has(handle)).sort(compare);

	return { decisions, rejected, unanswered };
}

/**
 * The record a decision becomes on disk.
 *
 * Every field the site's Author schema requires is written, whether or not a
 * record existed before: a half-record fails the site's build, and the whole
 * point of caching is that the next run does not have to ask again.
 *
 * Three things are deliberately not the caller's to decide:
 *
 * - `firstSeenAt` and `postCount` come from the record already on file, so a
 *   classification never restamps an author's history. A record written for the
 *   first time starts at `at` - the moment it was observed, which is a lower
 *   bound and is described as one.
 * - `lists` is replaced only when the decision placed the author; a decline
 *   leaves whatever the person had alone.
 * - `confidence` carries the decision's own `score` when it gave one, and is `0`
 *   for a decline. The site requires a number; inventing a high one would make
 *   a guess look certain.
 */
export function place(
	existing: AuthorRecord | null,
	evidence: Evidence,
	decision: Placement,
	at: string,
): AuthorRecord {
	const lists = decision.list === null ? (existing?.lists ?? []) : [decision.list];

	const record: DecisionRecord = {
		by: decision.by,
		confidence: decision.score ?? (decision.list === null ? 0 : 1),
		reason: decision.reason,
	};
	if (decision.score !== undefined) record.score = decision.score;
	if (decision.gap !== undefined) record.gap = decision.gap;

	return {
		handle: decision.handle,
		name: existing?.name ?? (evidence.name === "" ? decision.handle : evidence.name),
		verified: existing?.verified ?? evidence.verified,
		firstSeenAt: existing === null || existing.firstSeenAt === "" ? at : existing.firstSeenAt,
		postCount: existing?.postCount ?? evidence.posts,
		lists,
		decision: record,
	};
}

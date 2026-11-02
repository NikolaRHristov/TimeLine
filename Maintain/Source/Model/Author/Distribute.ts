import { toFailure } from "../../Cli/Parser/Output/Failure.ts";
import type { AuthorRecord, AuthorStore } from "../../Store/Author/Author.ts";
import { classify, type Preserved, type Rules } from "./Decision.ts";
import type { Evidence } from "./Evidence.ts";
import { place, type Placement } from "./Infer.ts";

/**
 * How long one membership write waits after the previous one.
 *
 * X counts list additions over a window and answers a burst with a toast, not
 * an HTTP status this layer can read, so pace is the only control available.
 * The wait is a floor rather than the whole gap: every add loads a profile
 * first, so the real distance between two writes is larger. Slower is the
 * correct direction to be wrong in - a limit costs the rest of the run.
 */
export const SPACING = 3_000;

/**
 * How many identical failures in a row end the run.
 *
 * A limit is its own thing and stops the run on the first answer. Everything
 * else - a control X moved, a list X renamed, a session that went stale -
 * repeats for every handle, and continuing would spend one profile load per
 * author proving the same point. Three tells a coincidence from a condition.
 */
export const REPEAT_LIMIT = 3;

/** Who decided a placement. `manual` is the person's own answer. */
export type DecidedBy = "rule" | "model" | "manual";

/**
 * One membership a run would add.
 *
 * `write` marks the entries whose record does not exist yet: the rules decide
 * in memory and nothing has written them down, so the record has to be created
 * before the membership it justifies can be added. A model or manual decision
 * already has a record, and a manual one is never written again.
 */
export type Planned = {
	handle: string;
	list: string;
	by: DecidedBy;
	/** One line: the same text the record and the report carry. */
	reason: string;
	/**
	 * The rules' own arithmetic, when the decision had any. Carried so the
	 * record it writes keeps the numbers behind the reason - the model pass
	 * already records its own, and a decision nobody can re-check is a decision
	 * nobody can tune.
	 */
	score?: number;
	gap?: number;
	write: boolean;
};

/** A decision this pass will not act on, and the one-line why. */
export type Skipped = { handle: string; list: string; reason: string };

export type Resolution = {
	/** Every membership to add, in handle order so a re-run resumes the same way. */
	plan: Planned[];
	/** Manual decisions on file, untouched and reported whole. */
	preserved: Preserved[];
	/** Authors the model placed in none of the lists. */
	declined: string[];
	/** Authors with no decision at all: `author classify infer` has not run for them. */
	unresolved: string[];
	skipped: Skipped[];
};

/** Order by UTF-16 code unit: `localeCompare` depends on the machine's locale. */
function compare(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * One line, no runs of whitespace.
 *
 * A reason is a sentence a person reads next to a handle, and the rules and the
 * model passes already flatten theirs. A manual record is hand-edited, so the
 * same guarantee has to be made here - without rewriting the record, which is
 * not this pass's to touch.
 */
function oneLine(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat === "" ? "manual decision on file" : flat;
}

/** A record's lists, deduplicated and in file order. */
function listsOf(record: AuthorRecord | null): string[] {
	return [...new Set(record?.lists ?? [])];
}

/**
 * Turn the three sources of decisions into one plan.
 *
 * The precedence is the one the earlier passes already established, and it is
 * not re-decided here: `classify` owns "did the rules place this author", so a
 * rule decision is taken from it rather than recomputed, and an author it left
 * ambiguous is looked up in the Author collection. That is what keeps the two
 * passes from disagreeing about who was ambiguous - the failure mode being
 * memberships added for authors the model was never asked about.
 *
 * The three sources are treated differently on purpose:
 *
 * - A **rule** decision exists only in memory, so its record is written.
 * - A **model** decision is already cached on disk; the record's `lists` is the
 *   filing it decided, and a decline is an empty one. Nothing is rewritten.
 * - A **manual** decision is the person's own answer: the record is never
 *   written again, and the filing is distributed like any other, because a
 *   decision this pass declined to act on would be a decision the person has to
 *   re-enter by hand.
 *
 * A list the identifier map does not declare is skipped rather than applied: a
 * membership is named by the map's slug, and a slug the map never declared
 * would be a row the dialog cannot offer.
 */
export function resolve(
	evidences: readonly Evidence[],
	rules: Rules,
	configured: readonly string[],
	records: readonly AuthorRecord[],
): Resolution {
	const known = new Set(configured);
	const held = new Map(records.map((record) => [record.handle, record]));

	const manual = new Map<string, Preserved>();
	for (const record of records) {
		if (record.decision?.by !== "manual") continue;
		manual.set(record.handle, {
			handle: record.handle,
			list: record.lists[0] ?? null,
			reason: oneLine(record.decision.reason ?? "manual decision on file"),
		});
	}

	const result = classify(evidences, rules, manual);
	const plan: Planned[] = [];
	const skipped: Skipped[] = [];
	const declined: string[] = [];
	const unresolved: string[] = [];

	for (const decision of result.decisions) {
		if (!known.has(decision.list)) {
			skipped.push({
				handle: decision.handle,
				list: decision.list,
				reason: "the identifier map does not declare this list",
			});
			continue;
		}
		plan.push({
			handle: decision.handle,
			list: decision.list,
			by: "rule",
			reason: decision.reason,
			score: decision.score,
			gap: decision.gap,
			write: true,
		});
	}

	for (const entry of result.ambiguous) {
		const record = held.get(entry.handle) ?? null;
		if (record?.decision?.by !== "model") {
			unresolved.push(entry.handle);
			continue;
		}

		const lists = listsOf(record);
		if (lists.length === 0) {
			// A decline: the model answered, and the answer was "none of them".
			// It is a decision, so it is reported rather than left unresolved.
			declined.push(entry.handle);
			continue;
		}

		for (const list of lists) {
			if (!known.has(list)) {
				skipped.push({
					handle: entry.handle,
					list,
					reason: "the identifier map does not declare this list",
				});
				continue;
			}
			plan.push({
				handle: entry.handle,
				list,
				by: "model",
				reason: record.decision.reason ?? "model decision on file",
				write: false,
			});
		}
	}

	for (const entry of result.preserved) {
		const record = held.get(entry.handle) ?? null;
		for (const list of listsOf(record)) {
			if (!known.has(list)) {
				skipped.push({
					handle: entry.handle,
					list,
					reason: "the identifier map does not declare this list",
				});
				continue;
			}
			plan.push({
				handle: entry.handle,
				list,
				by: "manual",
				reason: entry.reason,
				write: false,
			});
		}
	}

	plan.sort(
		(left, right) => compare(left.handle, right.handle) || compare(left.list, right.list),
	);

	return {
		plan,
		preserved: result.preserved,
		declined: declined.sort(compare),
		unresolved: unresolved.sort(compare),
		skipped,
	};
}

/** One handle into one list, through the single-handle primitive. */
export type Add = (handle: string, list: string) => Promise<"added" | "already">;

export type Attempt = { handle: string; list: string; by: DecidedBy };

export type FailureEntry = {
	handle: string;
	list: string;
	error: string;
	detail: string | null;
};

/**
 * Why a run stopped before the end of its plan.
 *
 * `rate-limited` is X answering. `repeated-failure` is this layer noticing that
 * the same error has come back for every handle it tried, which is a condition
 * and not bad luck.
 */
export type Stop = {
	reason: "rate-limited" | "repeated-failure";
	handle: string;
	list: string;
	error: string;
	detail: string | null;
	/** How many memberships were attempted when it stopped, this one included. */
	attempted: number;
};

export type Applied = {
	/** Handles whose record was written, in the order they were written. */
	written: string[];
	added: Attempt[];
	already: Attempt[];
	failed: FailureEntry[];
	/** Memberships never attempted: the rest of the plan, in plan order. */
	remaining: Attempt[];
	stopped: Stop | null;
};

export type Deps = {
	/** False is the default, and it is what keeps a plan a plan. */
	apply: boolean;
	/** The timestamp a record's `firstSeenAt` falls back to. */
	at: string;
	store: AuthorStore;
	/** The evidence a record's history fields come from. */
	evidence(handle: string): Evidence | undefined;
	add: Add;
	/** Injected so a test does not spend a minute waiting for three seconds. */
	pause(ms: number): Promise<void>;
	spacing?: number;
};

/**
 * Write the decision records a plan needs, and say which handles got one.
 *
 * Whole records, through `place`, and not a hand-built object: `place` is where
 * the rules about not restamping an author's history live, and a second copy of
 * them here would drift from the model pass that shares the same collection.
 *
 * The manual guard is checked again at write time. This collection has more
 * than one writer, and a record that appeared between `resolve` reading the
 * collection and this line is the person's answer, which wins over a rule.
 */
function write(plan: readonly Planned[], deps: Deps): { written: string[]; blocked: Set<string> } {
	const written: string[] = [];
	const blocked = new Set<string>();
	const seen = new Set<string>();

	for (const entry of plan) {
		if (!entry.write || seen.has(entry.handle)) continue;
		seen.add(entry.handle);

		const existing = deps.store.get(entry.handle);
		if (existing?.decision?.by === "manual") continue;

		const evidence = deps.evidence(entry.handle);
		if (evidence === undefined) {
			// The record cannot be written without the history fields only the
			// archive has. A membership whose record does not exist would be a
			// write nothing on disk explains, so it is held back and reported.
			blocked.add(entry.handle);
			process.stderr.write(
				`maintain: @${entry.handle} has no evidence in the archive; its record and membership are skipped\n`,
			);
			continue;
		}

		const placement: Placement = {
			handle: entry.handle,
			list: entry.list,
			reason: entry.reason,
			by: "rule",
		};
		if (entry.score !== undefined) placement.score = entry.score;
		if (entry.gap !== undefined) placement.gap = entry.gap;

		deps.store.write(place(existing, evidence, placement, deps.at));
		written.push(entry.handle);
	}

	return { written, blocked };
}

/**
 * Apply a plan: every record first, then one membership at a time.
 *
 * The order is the whole safety story. A record is the durable statement of
 * what this pass decided, and a membership is the part that reaches X; writing
 * the record first means a run that stops halfway leaves a plan on disk that a
 * second run reads instead of re-deriving, and a membership that exists is
 * always one a record explains.
 *
 * Without `apply` this does nothing at all - not even a membership check. A dry
 * run that opened fifty profiles to read their dialogs would be slow, and its
 * answer ("not a member yet") is already known: the plan says what to add.
 *
 * A limit stops the run on the first answer and is reported, never retried: a
 * retry loop against a limit is what turns a pause into a longer one. Any other
 * failure is recorded and the next handle runs, because one unreachable profile
 * must not end a distribution - unless it repeats, which is the `repeated-failure`
 * stop above.
 */
export async function apply(plan: readonly Planned[], deps: Deps): Promise<Applied> {
	const attempted: Attempt[] = plan.map(({ handle, list, by }) => ({
		handle,
		list,
		by,
	}));

	if (!deps.apply) {
		return {
			written: [],
			added: [],
			already: [],
			failed: [],
			remaining: attempted,
			stopped: null,
		};
	}

	const { written, blocked } = write(plan, deps);

	const added: Attempt[] = [];
	const already: Attempt[] = [];
	const failed: FailureEntry[] = [];
	const spacing = deps.spacing ?? SPACING;

	let stopped: Stop | null = null;
	let consumed = 0;
	let streak = 0;
	let repeated = "";

	for (let index = 0; index < attempted.length; index += 1) {
		const entry = attempted[index]!;
		consumed = index + 1;

		if (blocked.has(entry.handle)) {
			failed.push({
				handle: entry.handle,
				list: entry.list,
				error: "no-evidence",
				detail: "the archive holds no evidence for this handle, so no record could be written",
			});
			continue;
		}

		// The pause sits before the second membership onward: one add has
		// nothing to be spaced from, and a trailing sleep would only delay the
		// report.
		if (index > 0) await deps.pause(spacing);

		try {
			const outcome = await deps.add(entry.handle, entry.list);
			if (outcome === "added") added.push(entry);
			else already.push(entry);
			streak = 0;
			repeated = "";
		} catch (error) {
			const failure = toFailure(error);
			const detail = failure.detail ?? null;

			if (failure.code === "rate-limited") {
				stopped = {
					reason: "rate-limited",
					handle: entry.handle,
					list: entry.list,
					error: failure.code,
					detail,
					attempted: consumed,
				};
				break;
			}

			failed.push({
				handle: entry.handle,
				list: entry.list,
				error: failure.code,
				detail,
			});
			streak = failure.code === repeated ? streak + 1 : 1;
			repeated = failure.code;

			if (streak >= REPEAT_LIMIT) {
				stopped = {
					reason: "repeated-failure",
					handle: entry.handle,
					list: entry.list,
					error: failure.code,
					detail,
					attempted: consumed,
				};
				break;
			}
		}
	}

	return {
		written,
		added,
		already,
		failed,
		remaining: attempted.slice(consumed),
		stopped,
	};
}

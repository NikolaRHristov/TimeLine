import { option } from "../../../Cli/Parser/Argument/Option.ts";
import {
	fail,
	toFailure,
	type Failure,
} from "../../../Cli/Parser/Output/Failure.ts";
import type { CommandDefinition, Values } from "../../../Cli/Parser/Parser.ts";
import { optional } from "../../../Configuration/Load/Load.ts";
import {
	load as loadRules,
	scope,
} from "../../../Configuration/Rules/Rules.ts";
import { classify, type Preserved } from "../../../Model/Author/Decision.ts";
import type { Evidence } from "../../../Model/Author/Evidence.ts";
import {
	BATCH_LIMIT,
	batches,
	parse,
	place,
	prompt,
	type ModelDecision,
	type Parsed,
	type Rejected,
} from "../../../Model/Author/Infer.ts";
import {
	open as openModel,
	type Complete,
} from "../../../Model/Inference/Client.ts";
import { open as openAuthors } from "../../../Store/Author/Author.ts";
import { contentDirectory } from "../../../Store/Path/Path.ts";
import { collect } from "../Evidence/Collect.ts";
import { manual } from "./Rules.ts";

/** One batch that produced no usable answer, and why. */
type Failed = { handles: string[]; reason: string };

/** Order by UTF-16 code unit: `localeCompare` depends on the machine's locale. */
function compare(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** `--limit`, when it was given; 0 means "everything that is left". */
function limit(values: Values): number {
	const given = values["limit"];
	if (given === undefined) return 0;
	if (typeof given !== "number" || !Number.isInteger(given) || given < 1) {
		throw fail("usage", "--limit expects a positive integer", {
			value: given,
		});
	}
	return given;
}

/**
 * The model pass: resolve only what the rules could not, and pay for it once.
 *
 * The rules classifier is the first half of this command, not a separate
 * concern: an author it placed is never sent anywhere, and an author it left
 * ambiguous is exactly the work here. That is also why the threshold is read
 * from the rules file rather than restated - two passes that disagreed about
 * "ambiguous" would ask about authors the rules had already decided.
 *
 * Three things keep the spend down, in order of how much they save:
 *
 * - A decision already cached at `Source/Content/Author/<handle>.json` with
 *   `decision.by: "model"` is not asked about again, so a second run over the
 *   same archive asks about nothing and prints `asked: 0`.
 * - A `decision.by: "manual"` record is the person's own answer: it is never
 *   asked about, never scored, and never written over - not even when the model
 *   volunteers an answer for it.
 * - At most `BATCH_LIMIT` authors travel in one request. A batch that fails is
 *   reported and the next one still runs, so one bad reply costs one batch
 *   rather than the run.
 *
 * A rejected entry is not cached. That is the whole of the corruption rule: a
 * malformed answer leaves the file it would have written exactly as it was, so
 * the next run asks again instead of trusting a guess forever.
 */
export const Definition: CommandDefinition = {
	path: ["author", "classify", "infer"],
	summary:
		"Ask the model about the authors the rules left ambiguous; cache every answer.",
	options: [
		option(
			"limit",
			"integer",
			"Ask about at most this many authors this run.",
		),
		option(
			"dry-run",
			"boolean",
			"Report what would be asked and spend nothing.",
		),
	],
	async run(values: Values): Promise<unknown> {
		// The map is the authority on the slug set, so it also decides what the
		// model is allowed to answer: a prompt that offered the rules file's own
		// keys would hand back a list nobody configured.
		const scoped = scope(loadRules(), optional());
		const content = contentDirectory();
		const collection = collect();
		const store = openAuthors(content);

		const result = classify(
			collection.authors,
			scoped.rules,
			manual(content),
		);
		const preserved: Preserved[] = [...result.preserved];
		const held = new Set(preserved.map((entry) => entry.handle));

		const evidence = new Map(
			collection.authors.map((entry) => [entry.handle, entry]),
		);
		const pending: Evidence[] = [];
		let cached = 0;

		// `ambiguous` is already ordered by handle, so the batches are a
		// function of the archive: the same ambiguity always asks the same
		// questions in the same groups.
		for (const entry of result.ambiguous) {
			const record = store.get(entry.handle);
			if (record !== null && record.decision?.by === "manual") {
				// A record that appeared after `classify` read the collection.
				// The person's answer wins over this pass, always.
				if (!held.has(entry.handle)) {
					held.add(entry.handle);
					preserved.push({
						handle: entry.handle,
						list: record.lists[0] ?? null,
						reason:
							record.decision.reason ?? "manual decision on file",
					});
				}
				continue;
			}
			if (record !== null && record.decision?.by === "model") {
				cached += 1;
				continue;
			}
			const found = evidence.get(entry.handle);
			if (found !== undefined) pending.push(found);
		}

		const asked = limit(values);
		const planned = asked > 0 ? pending.slice(0, asked) : pending;
		const lists = scoped.slugs;
		const grouped = batches(planned, BATCH_LIMIT);
		const deferred = pending.length - planned.length;

		if (values["dry-run"] === true) {
			return {
				counts: {
					authors: collection.authors.length,
					ambiguous: result.ambiguous.length,
					asked: 0,
					cached,
					manual: preserved.length,
					placed: 0,
					declined: 0,
					unanswered: 0,
					rejected: 0,
					failed: 0,
					deferred,
				},
				batches: grouped.length,
				planned: planned.map((entry) => entry.handle),
				decisions: [],
				unanswered: [],
				rejected: [],
				failed: [],
				preserved,
			};
		}

		// Nothing to ask means nothing to configure: a fully cached run must
		// not fail because no endpoint is set - that is the run this pass is
		// trying to make free.
		let complete: Complete | null = null;
		if (planned.length > 0) complete = openModel();

		const decisions: ModelDecision[] = [];
		const rejected: Rejected[] = [];
		const unanswered: string[] = [];
		const failed: Failed[] = [];
		const sentHandles: string[] = [];
		const at = new Date().toISOString();
		let sent = 0;
		let first: Failure | null = null;

		for (const group of grouped) {
			const handles = group.map((entry) => entry.handle);
			const ask = complete;
			if (ask === null) break;

			let reply: string;
			try {
				reply = await ask(prompt(group, lists));
			} catch (error) {
				// No reply means no tokens spent, so this batch is not counted
				// as asked - `failed` carries it instead.
				failed.push({ handles, reason: message(error) });
				first ??= toFailure(error);
				continue;
			}
			sent += group.length;
			sentHandles.push(...handles);

			let parsed: Parsed;
			try {
				parsed = parse(reply, new Set(handles), new Set(lists));
			} catch (error) {
				// The endpoint answered, so the tokens are gone; the answer is
				// just not one anything may be cached from.
				failed.push({ handles, reason: message(error) });
				first ??= toFailure(error);
				continue;
			}

			rejected.push(...parsed.rejected);
			unanswered.push(...parsed.unanswered);

			for (const decision of parsed.decisions) {
				const source = evidence.get(decision.handle);
				if (source === undefined) continue;

				const current = store.get(decision.handle);
				if (current !== null && current.decision?.by === "manual") {
					rejected.push({
						handle: decision.handle,
						reason: "a manual decision was written after this batch was built",
					});
					continue;
				}

				store.write(place(current, source, decision, at));
				decisions.push(decision);
			}
		}

		// Every batch failing is not a partial run to report - it is a run that
		// did nothing, and a caller reading `asked: 0` must not mistake it for
		// a cache hit.
		if (grouped.length > 0 && failed.length === grouped.length) {
			throw (
				first ??
				toFailure(new Error("the model pass produced no answer"))
			);
		}

		decisions.sort((left, right) => compare(left.handle, right.handle));
		unanswered.sort(compare);

		return {
			counts: {
				authors: collection.authors.length,
				ambiguous: result.ambiguous.length,
				asked: sent,
				cached,
				manual: preserved.length,
				placed: decisions.filter((decision) => decision.list !== null)
					.length,
				declined: decisions.filter((decision) => decision.list === null)
					.length,
				unanswered: unanswered.length,
				rejected: rejected.length,
				failed: failed.length,
				deferred,
			},
			batches: grouped.length,
			asked: sentHandles,
			decisions,
			unanswered,
			rejected,
			failed,
			preserved,
		};
	},
};

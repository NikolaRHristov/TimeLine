import { option } from "../../../CLI/Parser/Argument/Option.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { age, candidates, totals } from "../../../Model/Vote/Vote.ts";
import { contentDirectory } from "../../../Store/Path/Path.ts";
import { open as openVote } from "../../../Store/Vote/Vote.ts";
import type { CommandContext } from "../../Context/Context.ts";

/**
 * The curation view: what is waiting, best-supported first.
 *
 * This is the page the owner actually reads, so it answers the three questions
 * a queue has to answer - how many votes, how long it has been waiting, and
 * which list it belongs to - and nothing else. Approved entries are absent
 * because they are answered; rejected ones are absent because they are closed.
 */
export const Definition: CommandDefinition = {
	path: ["vote", "queue"],
	summary: "Every candidate, sorted by votes, with age and list.",
	options: [option("limit", "integer", "Show at most this many candidates.")],
	async run(context: CommandContext): Promise<unknown> {
		const store = openVote(contentDirectory());
		const all = store.votedAll();
		const now = new Date().toISOString();
		const limit = typeof context.values["limit"] === "number" ? context.values["limit"] : null;

		const queue = candidates(all).map((entry) => {
			const row: Record<string, unknown> = {
				id: entry.id,
				votes: entry.votes,
				age: age(entry.nominatedAt, now),
				lists: entry.lists,
				url: entry.url,
				nominatedAt: entry.nominatedAt,
			};
			if (entry.title !== undefined) row["title"] = entry.title;
			if (entry.note !== undefined) row["note"] = entry.note;
			return row;
		});

		const shown = limit === null ? queue : queue.slice(0, Math.max(limit, 0));
		return {
			count: queue.length,
			shown: shown.length,
			totals: totals(all),
			entries: shown,
		};
	},
};

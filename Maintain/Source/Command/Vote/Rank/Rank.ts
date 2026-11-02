import { option } from "../../../CLI/Parser/Argument/Option.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { place } from "../../../Model/Vote/Vote.ts";
import { contentDirectory } from "../../../Store/Path/Path.ts";
import { open as openVote } from "../../../Store/Vote/Vote.ts";
import type { CommandContext } from "../../Context/Context.ts";
import { requireCurated } from "../Entry/Entry.ts";

/**
 * Reorder the Curated index, without touching what is approved.
 *
 * Rank is the owner's instrument: a crowd can decide what is worth looking at,
 * and it cannot decide what the front page leads with. Moving an entry rewrites
 * every rank after it, because ranks are positions - a gap is a hole in the
 * page and a duplicate is an ambiguous order.
 */
export const Definition: CommandDefinition = {
	path: ["vote", "rank"],
	summary: "Move a curated entry to a new position.",
	options: [
		option("id", "string", "Status id of the curated entry.", {
			required: true,
		}),
		option("rank", "integer", "New position, 1 is the top.", {
			required: true,
		}),
	],
	async run(context: CommandContext): Promise<unknown> {
		const id = String(context.values["id"]);
		const rank = Number(context.values["rank"]);
		const store = openVote(contentDirectory());
		const entry = requireCurated(store, id);

		const index = place(store.curatedAll(), entry, rank);
		const moved = index.find((candidate) => candidate.id === id) ?? entry;
		const unchanged = moved.rank === entry.rank;

		if (unchanged !== true) {
			store.writeCuratedMany(index);
			store.event("vote.ranked", id, { rank: moved.rank }, new Date().toISOString());
		}

		return {
			ranked: true,
			id,
			rank: moved.rank,
			was: entry.rank,
			unchanged,
		};
	},
};

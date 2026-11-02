import { option } from "../../../CLI/Parser/Argument/Option.ts";
import { fail } from "../../../CLI/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { place, type CuratedEntry } from "../../../Model/Vote/Vote.ts";
import { contentDirectory } from "../../../Store/Path/Path.ts";
import { open as openVote } from "../../../Store/Vote/Vote.ts";
import { requireVoted } from "../Entry/Entry.ts";

/**
 * The gate. The only command that puts anything in the Curated index.
 *
 * Approval is a human decision made from a terminal, which is the whole design:
 * a vote can rank a candidate and cannot publish it. Approving freezes the vote
 * count into the Curated file, so the published site is reproducible even after
 * the live count moves on.
 *
 * Idempotent in the way that matters: approving again reuses the rank and the
 * timestamp already on file and reports `unchanged`, so a script that re-runs
 * is never a second publication. Approving with a different `--rank` reorders
 * without touching approval state.
 */
export const Definition: CommandDefinition = {
	path: ["vote", "approve"],
	summary: "Move a candidate into the Curated index.",
	options: [
		option("id", "string", "Status id of the candidate to approve.", {
			required: true,
		}),
		option("rank", "integer", "Position in the Curated index; appended by default."),
	],
	async run(values): Promise<unknown> {
		const id = String(values["id"]);
		const requested = typeof values["rank"] === "number" ? values["rank"] : null;
		const store = openVote(contentDirectory());

		const voted = requireVoted(store, id);
		if (voted.status === "rejected") {
			throw fail("tombstone", "that entry was rejected and stays rejected", {
				id,
				status: voted.status,
				next: "nominate a different entry; a tombstone is a decision, not a queue item",
			});
		}

		const at = new Date().toISOString();
		const existing = store.curated(id);

		if (existing !== null) {
			// Already approved: a rank is the only thing that can still change,
			// and the frozen votes and approval timestamp are carried through.
			const index = place(store.curatedAll(), existing, requested);
			const moved = index.find((entry) => entry.id === id) ?? existing;
			const unchanged = moved.rank === existing.rank;

			if (unchanged !== true) {
				store.writeCuratedMany(index);
				store.event("vote.ranked", id, { rank: moved.rank }, at);
			}

			return {
				approved: true,
				id,
				rank: moved.rank,
				votes: existing.votes,
				approvedAt: existing.approvedAt,
				unchanged,
			};
		}

		const entry: CuratedEntry = {
			id,
			rank: 0,
			votes: voted.votes,
			approvedAt: at,
			approvedBy: "manual",
		};
		const index = place(store.curatedAll(), entry, requested);
		const placed = index.find((candidate) => candidate.id === id) ?? entry;

		store.writeCuratedMany(index);
		store.writeVoted({ ...voted, status: "approved" });
		store.event("vote.approved", id, { rank: placed.rank, votes: placed.votes }, at);

		return {
			approved: true,
			id,
			rank: placed.rank,
			votes: placed.votes,
			approvedAt: placed.approvedAt,
			unchanged: false,
		};
	},
};

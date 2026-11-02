import { fail } from "../../../Cli/Parser/Output/Failure.ts";
import type { CuratedEntry, VoteEntry } from "../../../Model/Vote/Vote.ts";
import type { VoteStore } from "../../../Store/Vote/Vote.ts";

/**
 * One entry, or the failure that says which command would have made it.
 *
 * Every vote command needs this and every one of them would otherwise invent
 * its own wording for the same two misses. The `next` line is the whole point:
 * `no-entry` on its own tells a caller that something is absent without
 * telling them what to type.
 */
export function requireVoted(store: VoteStore, id: string): VoteEntry {
	const entry = store.voted(id);
	if (entry !== null) return entry;

	throw fail("no-entry", "that id is not in the Voted index", {
		id,
		// Enough to recognise a typo, bounded so a large index does not print
		// itself into a failure object.
		known: store
			.votedAll()
			.map((candidate) => candidate.id)
			.slice(0, 20),
		next: `maintain vote nominate --id ${id}`,
	});
}

/** One Curated entry, or the failure that says it was never approved. */
export function requireCurated(store: VoteStore, id: string): CuratedEntry {
	const entry = store.curated(id);
	if (entry !== null) return entry;

	throw fail("not-curated", "that id is not in the Curated index", {
		id,
		known: store
			.curatedAll()
			.map((candidate) => candidate.id)
			.slice(0, 20),
		next: `maintain vote approve --id ${id}`,
	});
}

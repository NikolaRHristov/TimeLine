import type {
	CuratedRecord as CuratedEntry,
	VotedRecord as VoteEntry,
} from "../Generated/Types.ts";

/**
 * The vote index, as data.
 *
 * Three states, and only one of them publishes anything:
 *
 * - `candidate` - nominated, waiting for the owner, visible on `/Voted/`.
 * - `approved`  - in the Curated index, and the only state the homepage reads.
 * - `rejected`  - a tombstone. The file stays on disk, so a later scrape, a
 *   later nomination or a later vote cannot bring the entry back. Deleting a
 *   tombstone would make "no" a temporary opinion.
 *
 * Nothing here sorts by votes into the Curated index. `rank` is written by the
 * owner, because the whole point of curation is that a crowd can be overruled.
 */

export const VoteStatus = ["candidate", "approved", "rejected"] as const;

export type VoteStatus = (typeof VoteStatus)[number];

/** A status from an untrusted file; anything else is not a status. */
export function isStatus(value: unknown): value is VoteStatus {
	return value === "candidate" || value === "approved" || value === "rejected";
}

/**
 * One candidate entry: the post, why it is here, and how many votes it has.
 *
 * `votes` and `votedAt` are a snapshot, never a live count - the live count
 * lives in the vote store and is pulled by `maintain vote sync`. A build that
 * read the network would not be reproducible, and a site that showed a number
 * nobody recorded would be claiming a fact it does not have.
 */
/**
 * The two vote-index records, declared in `Model/Schema/Entities.ts` and
 * rendered into `Model/Generated/Types.ts`. `VoteEntry` is the `voted` entity
 * and `CuratedEntry` the `curated` one; both are also site collections, so the
 * shape a command writes and the shape Astro validates are the same one.
 */
export type {
	CuratedRecord as CuratedEntry,
	VotedRecord as VoteEntry,
} from "../Generated/Types.ts";

/**
 * One entry of the Curated index.
 *
 * The payload is not duplicated: this file points at the `Voted`/`Bookmark`
 * record by `id`, and the homepage joins them. `votes` is frozen at approval
 * time, which is what keeps the published site static and reproducible.
 */

/** Whole days between `then` and `now`; 0 for a future or unreadable date. */
export function age(then: string, now: string): number {
	const start = Date.parse(then);
	const end = Date.parse(now);
	if (Number.isNaN(start) || Number.isNaN(end)) return 0;
	const days = Math.floor((end - start) / 86_400_000);
	return days > 0 ? days : 0;
}

/**
 * The Curated index in display order.
 *
 * Ties on `rank` (two files edited by hand, a half-finished write) break on
 * `id` so the order is deterministic instead of filesystem-dependent. This is
 * the function the pages order by; `dense()` is the one that repairs the
 * numbers.
 */
export function order(entries: readonly CuratedEntry[]): CuratedEntry[] {
	return [...entries].sort((left, right) =>
		left.rank === right.rank ? left.id.localeCompare(right.id) : left.rank - right.rank,
	);
}

/**
 * Ranks 1..N, no gaps, no duplicates.
 *
 * `rank` is a position, not a score: a gap is a hole in the page and a
 * duplicate is an ambiguous order. Every write of the Curated index goes
 * through this, so a hand-edited rank of 40 on a five-entry index becomes 5
 * rather than a page that numbers itself 1,2,3,40.
 */
export function dense(entries: readonly CuratedEntry[]): CuratedEntry[] {
	return order(entries).map((entry, index) => ({
		...entry,
		rank: index + 1,
	}));
}

/**
 * Put `entry` at `rank` (1-based), or at the end when `rank` is null.
 *
 * The result is dense and contains `entry.id` exactly once, whether it was
 * already in the index or is being added to it. An out-of-range rank is clamped
 * rather than refused: asking for rank 40 of a five-entry index is a person
 * saying "last", not a usage error worth failing a command over.
 */
export function place(
	entries: readonly CuratedEntry[],
	entry: CuratedEntry,
	rank: number | null,
): CuratedEntry[] {
	const rest = order(entries).filter((candidate) => candidate.id !== entry.id);
	// `rest.length + 1` is the position one past the end, which `splice` reads as
	// "append". Using `rest.length` would insert before the last entry.
	const target = rank === null ? rest.length + 1 : Math.min(Math.max(rank, 1), rest.length + 1);
	const next = [...rest];
	next.splice(target - 1, 0, entry);
	// Renumbered by position, not re-sorted: a new entry arrives with a
	// placeholder rank, and sorting by rank here would move it to wherever the
	// placeholder happened to land instead of the position just chosen.
	return next.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

/**
 * The queue the owner reads: candidates only, best-supported first.
 *
 * Votes descending, then oldest nomination first, then id - a deterministic
 * order that never depends on how the directory happens to be listed. Approved
 * and rejected entries are not in the queue: one is already published and the
 * other is answered.
 */
export function candidates(entries: readonly VoteEntry[]): VoteEntry[] {
	return entries
		.filter((entry) => entry.status === "candidate")
		.sort((left, right) => {
			if (left.votes !== right.votes) return right.votes - left.votes;
			const nominated = left.nominatedAt.localeCompare(right.nominatedAt);
			return nominated !== 0 ? nominated : left.id.localeCompare(right.id);
		});
}

/** How many entries are in each state - the one line a queue summary needs. */
export function totals(entries: readonly VoteEntry[]): Record<VoteStatus, number> {
	const counted: Record<VoteStatus, number> = {
		candidate: 0,
		approved: 0,
		rejected: 0,
	};
	for (const entry of entries) counted[entry.status] += 1;
	return counted;
}

/**
 * The on-disk shape of one Voted file, in a fixed key order.
 *
 * Both the writer and the reader go through this, which is what makes
 * "unchanged" a byte comparison rather than a guess: a command can serialise
 * the entry it would write, serialise the entry it read, and compare. Optional
 * fields are omitted rather than written as null, so a file the person edited
 * by hand and a file the CLI wrote read the same.
 */
export function document(entry: VoteEntry): Record<string, unknown> {
	const body: Record<string, unknown> = {
		id: entry.id,
		url: entry.url,
	};
	if (entry.title !== undefined) body["title"] = entry.title;
	if (entry.note !== undefined) body["note"] = entry.note;
	body["author"] = entry.author;
	body["lists"] = entry.lists;
	body["votes"] = entry.votes;
	body["votedAt"] = entry.votedAt;
	body["nominatedAt"] = entry.nominatedAt;
	body["status"] = entry.status;
	return body;
}

/** The on-disk shape of one Curated file. */
export function curatedDocument(entry: CuratedEntry): Record<string, unknown> {
	return {
		id: entry.id,
		rank: entry.rank,
		votes: entry.votes,
		approvedAt: entry.approvedAt,
		approvedBy: entry.approvedBy,
	};
}

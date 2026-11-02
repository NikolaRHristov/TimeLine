import { fail } from "../../../CLI/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { contentDirectory } from "../../../Store/Path/Path.ts";
import { open as openVote, writeSnapshot } from "../../../Store/Vote/Vote.ts";
import { ENVIRONMENT } from "../../../Vote/Transport/Firebase.ts";
import { select } from "../../../Vote/Transport/Transport.ts";
import type { CommandContext } from "../../Context/Context.ts";

/**
 * Pull the live counts in, and change nothing else.
 *
 * The site is static and nothing is fetched at build time, so a vote cast on
 * the page reaches this repository only when the owner runs this command. That
 * is deliberate: a build that read a database would produce a different site
 * on every run, and a published page would be claiming a number it did not
 * record.
 *
 * What it writes:
 *
 * - `Maintain/Storage/Vote/<id>.json` - the snapshot, gitignored, every run.
 * - the `votes` and `votedAt` of a `Voted` file - only when the count actually
 *   moved, so a no-change sync leaves the tree clean instead of dirtying 200
 *   files with a fresh timestamp.
 * - a `vote.cast` event - only when the count moved, carrying the new total and
 *   nothing about who cast it.
 *
 * Rejected entries are skipped entirely: a tombstone is not in the running, and
 * refreshing its count would suggest it could come back.
 */
export const Definition: CommandDefinition = {
	path: ["vote", "sync"],
	summary: "Pull current vote counts from the transport into the local store.",
	options: [],
	async run(_context: CommandContext): Promise<unknown> {
		const transport = select();
		if (transport.name === "none") {
			// One named failure, before anything on disk is touched. A sync that
			// silently reported zero changes would look like a working sync.
			throw fail("no-transport", "no vote transport is configured", {
				expected: Object.values(ENVIRONMENT),
				next: "see Documentation/Reference/Voting.md, or leave voting off",
			});
		}

		const store = openVote(contentDirectory());
		const entries = store.votedAll().filter((entry) => entry.status !== "rejected");

		const counts = await transport.counts(entries.map((entry) => entry.id));
		const at = new Date().toISOString();

		let changed = 0;
		let unchanged = 0;
		for (const entry of entries) {
			const votes = counts[entry.id];
			// A snapshot is written even when nothing moved: it is the record of
			// "asked, and this is what the database said at this moment".
			writeSnapshot({
				id: entry.id,
				votes: votes ?? entry.votes,
				fetchedAt: at,
			});

			if (votes === undefined || votes === entry.votes) {
				unchanged += 1;
				continue;
			}

			store.writeVoted({ ...entry, votes, votedAt: at });
			store.event("vote.cast", entry.id, { votes }, at);
			changed += 1;
		}

		return {
			transport: transport.name,
			synced: entries.length,
			changed,
			unchanged,
			at,
		};
	},
};

import { option } from "../../../Cli/Parser/Argument/Option.ts";
import { fail } from "../../../Cli/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../Cli/Parser/Parser.ts";
import { contentDirectory } from "../../../Store/Path/Path.ts";
import { open as openVote } from "../../../Store/Vote/Vote.ts";
import { requireVoted } from "../Entry/Entry.ts";

/**
 * Say no, permanently.
 *
 * A rejection is a tombstone, not a deletion: the file stays on disk with
 * `status: "rejected"` and every later path refuses to move it. Deleting the
 * file would make "no" a temporary opinion that the next scrape or the next
 * nomination could overturn; the archive keeps the decision instead.
 *
 * Rejecting what is already curated is refused rather than silently
 * unpublishing it: the Curated index is the published site, and taking an entry
 * out of it is a different decision from rejecting a candidate.
 */
export const Definition: CommandDefinition = {
	path: ["vote", "reject"],
	summary: "Tombstone a candidate so it can never be nominated again.",
	options: [
		option("id", "string", "Status id of the candidate to reject.", {
			required: true,
		}),
		option("reason", "string", "Why it was rejected; kept on the event."),
	],
	async run(values): Promise<unknown> {
		const id = String(values["id"]);
		const store = openVote(contentDirectory());
		const entry = requireVoted(store, id);

		if (store.curated(id) !== null) {
			throw fail("already-curated", "that entry is in the Curated index; it is published", {
				id,
				next: `delete Source/Content/Curated/${id}.json to withdraw it from the site`,
			});
		}

		if (entry.status === "rejected") {
			return { rejected: true, id, status: entry.status, unchanged: true };
		}

		const at = new Date().toISOString();
		store.writeVoted({ ...entry, status: "rejected" });
		store.event(
			"vote.rejected",
			id,
			typeof values["reason"] === "string" ? { reason: values["reason"] } : {},
			at,
		);

		return { rejected: true, id, status: "rejected", unchanged: false };
	},
};

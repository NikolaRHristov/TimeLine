import { option } from "../../../CLI/Parser/Argument/Option.ts";
import { fail, isFailure } from "../../../CLI/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import * as Text from "../../../Content/Text.ts";
import { connect } from "../../../Store/Database/Connect.ts";
import { contentDirectory } from "../../../Store/Path/Path.ts";
import { open as openPublic } from "../../../Store/Public/Public.ts";
import type { CommandContext } from "../../Context/Context.ts";
import { argumentsOf } from "../Push/Push.ts";

/**
 * Withhold a post, for good.
 *
 * `hidden` is a tombstone rather than a deletion: the record stays in the
 * database (so the archive still knows what it saw), the public file goes, and
 * every later scrape folds the tombstone back instead of resurrecting the post.
 *
 * The write goes through the same `observe` call `store push` uses - one write
 * path, so withholding and restoring cannot disagree about what a post row is.
 */
export const Definition: CommandDefinition = {
	path: ["store", "hide"],
	summary: Text.CommandStoreHideSummary,
	options: [
		option("id", "string", Text.OptionStoreHideId, {
			required: true,
		}),
	],
	async run(context: CommandContext): Promise<unknown> {
		const id = String(context.values["id"]);
		const { client, store } = connect();
		const publicStore = openPublic(contentDirectory());

		const post = await store.post(id);
		if (post === null) {
			throw fail("no-post", "that id is not in the database", { id });
		}

		const removed = publicStore.removeBookmark(id);
		if (post.visibility === "hidden" && removed === false) {
			return { hidden: true, id, removed: false, unchanged: true };
		}

		const at = new Date().toISOString();
		const source = post.observations[0]?.source ?? "bookmark";

		try {
			await client.call(
				"observe",
				argumentsOf({
					post: { ...post, visibility: "hidden" },
					entry: { at, source, statusId: id, action: "hidden" },
				}),
			);
		} catch (error) {
			// The public file is still on disk at this point, so a failure leaves the
			// site exactly as it was rather than half-hidden.
			if (isFailure(error)) throw error;
			throw fail("spacetime-reducer", "the database did not record the tombstone", {
				id,
				reason: error instanceof Error ? error.message : String(error),
			});
		}

		// The public trail records that something left, never what it was.
		publicStore.event("bookmark.hidden", id, { removed }, at);

		return { hidden: true, id, removed, unchanged: false };
	},
};

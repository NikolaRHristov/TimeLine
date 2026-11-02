import { option } from "../../../Cli/Parser/Argument/Option.ts";
import { fail } from "../../../Cli/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../Cli/Parser/Parser.ts";
import { contentDirectory, shadowDirectory } from "../../../Store/Path/Path.ts";
import { open as openPublic } from "../../../Store/Public/Public.ts";
import { open as openShadow } from "../../../Store/Shadow/Shadow.ts";

/**
 * Withhold a post, for good.
 *
 * `hidden` is a tombstone rather than a deletion: the shadow record stays (so
 * the archive still knows what it saw), the public file goes, and every later
 * scrape re-reads the tombstone instead of resurrecting the post.
 */
export const Definition: CommandDefinition = {
	path: ["store", "hide"],
	summary: "Withhold one post and delete its published file.",
	options: [
		option("id", "string", "Status id of the post to withhold.", {
			required: true,
		}),
	],
	async run(values): Promise<unknown> {
		const id = String(values["id"]);
		const shadow = openShadow(shadowDirectory());
		const publicStore = openPublic(contentDirectory());

		const post = shadow.post(id);
		if (post === null) {
			throw fail("no-post", "that id is not in the shadow store", { id });
		}

		const removed = publicStore.removeBookmark(id);
		if (post.visibility === "hidden" && removed === false) {
			return { hidden: true, id, removed: false, unchanged: true };
		}

		const at = new Date().toISOString();
		shadow.write({ ...post, visibility: "hidden" });
		shadow.observe({
			at,
			source: post.observations[0]?.source ?? "bookmark",
			statusId: id,
			action: "hidden",
		});
		shadow.event("bookmark.hidden", id, { removed }, at);
		// The public trail records that something left, never what it was.
		publicStore.event("bookmark.hidden", id, { removed }, at);
		shadow.reindex();

		return { hidden: true, id, removed, unchanged: false };
	},
};

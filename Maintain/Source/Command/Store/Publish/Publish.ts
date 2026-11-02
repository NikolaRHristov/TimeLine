import { option } from "../../../CLI/Parser/Argument/Option.ts";
import { fail } from "../../../CLI/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { Source as Sources, type Source } from "../../../Model/Source/Source.ts";
import { project, type ShadowPost } from "../../../Store/Model/Model.ts";
import { contentDirectory, shadowDirectory } from "../../../Store/Path/Path.ts";
import { open as openPublic } from "../../../Store/Public/Public.ts";
import { open as openShadow } from "../../../Store/Shadow/Shadow.ts";
import type { CommandContext } from "../../Context/Context.ts";

/** `--since` accepts a date or a timestamp; anything unreadable is a usage error. */
function moment(value: string): string {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		throw fail("usage", "--since is not a date", { value });
	}
	return parsed.toISOString();
}

/**
 * The only command that puts a post in front of the world.
 *
 * Publishing is per-post and reversible: the shadow record keeps everything,
 * the public file is a projection of it, and `hidden` always wins. Re-publishing
 * a published post reuses the timestamp already on file, so the second run
 * rewrites the same bytes instead of looking like a new publication.
 */
export const Definition: CommandDefinition = {
	path: ["store", "publish"],
	summary: "Copy shadow records into the site's Bookmark collection.",
	options: [
		option("id", "string", "Publish one post by status id."),
		option("source", "enum", "Publish every post first seen through this source.", {
			values: Sources,
		}),
		option("since", "string", "Publish every post first seen at or after this date."),
		option("all", "boolean", "Publish every post that is not hidden."),
	],
	async run(context: CommandContext): Promise<unknown> {
		const hasSelector =
			typeof context.values["id"] === "string" ||
			typeof context.values["source"] === "string" ||
			typeof context.values["since"] === "string" ||
			context.values["all"] === true;
		if (hasSelector !== true) {
			throw fail("usage", "say what to publish: --id, --source, --since or --all");
		}

		const since =
			typeof context.values["since"] === "string" ? moment(context.values["since"]) : null;
		const source =
			typeof context.values["source"] === "string"
				? (context.values["source"] as Source)
				: null;
		const shadow = openShadow(shadowDirectory());
		const publicStore = openPublic(contentDirectory());
		const at = new Date().toISOString();

		const matches = (post: ShadowPost): boolean => {
			if (typeof context.values["id"] === "string") return post.id === context.values["id"];
			if (source !== null) return post.observations.some((entry) => entry.source === source);
			if (since !== null) return post.firstSeenAt >= since;
			return true;
		};

		let published = 0;
		let unchanged = 0;
		let hidden = 0;

		for (const post of shadow.all()) {
			if (matches(post) !== true) continue;
			if (post.visibility === "hidden") {
				hidden += 1;
				continue;
			}

			const existing = publicStore.bookmark(post.id);
			const publishedAt = existing?.publishedAt ?? at;
			publicStore.writeBookmark(project(post, publishedAt));

			if (post.visibility === "public") {
				unchanged += 1;
				continue;
			}

			// The post's own trail goes with it: `bookmark.added` says when the
			// archive first saw it, `bookmark.published` says when the site did.
			for (const event of shadow.events(post.id)) publicStore.copyEvent(event.file);
			shadow.write({ ...post, visibility: "public" });
			shadow.observe({
				at,
				source: post.observations[0]?.source ?? "bookmark",
				statusId: post.id,
				action: "published",
			});
			publicStore.event("bookmark.published", post.id, { url: post.url, publishedAt }, at);
			published += 1;
		}

		shadow.reindex();

		if (published === 0 && unchanged === 0 && hidden === 0) {
			throw fail("no-post", "nothing in the shadow store matched", {
				id: context.values["id"],
				source: context.values["source"],
				since: context.values["since"],
			});
		}

		return { published, unchanged, hidden };
	},
};

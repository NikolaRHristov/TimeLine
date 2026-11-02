import { option } from "../../../CLI/Parser/Argument/Option.ts";
import { fail } from "../../../CLI/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import * as Text from "../../../Content/Text.ts";
import { Source as Sources, type Source } from "../../../Model/Source/Source.ts";
import { connect } from "../../../Store/Database/Connect.ts";
import { project, type ShadowPost } from "../../../Store/Model/Model.ts";
import { contentDirectory } from "../../../Store/Path/Path.ts";
import { open as openPublic } from "../../../Store/Public/Public.ts";
import type { CommandContext } from "../../Context/Context.ts";
import { argumentsOf } from "../Push/Push.ts";

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
 * Publishing is per-post and reversible: the database keeps everything, the
 * public file is a projection of one record, and `hidden` always wins.
 * Re-publishing a published post reuses the timestamp already on file, so the
 * second run rewrites the same bytes instead of looking like a new publication.
 *
 * The visibility change is one `observe` call - the same write path the scrape
 * and the import use - so a published row and a scraped row cannot end up with
 * different shapes.
 */
export const Definition: CommandDefinition = {
	path: ["store", "publish"],
	summary: Text.CommandStorePublishSummary,
	options: [
		option("id", "string", Text.OptionStorePublishId),
		option("source", "enum", Text.OptionStorePublishSource, {
			values: Sources,
		}),
		option("since", "string", Text.OptionStorePublishSince),
		option("all", "boolean", Text.OptionStorePublishAll),
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
		const { client, store } = connect();
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

		for (const post of await store.all()) {
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
			for (const event of await store.events(post.id))
				publicStore.event(event.kind, event.subject, event.payload, event.at);

			await client.call(
				"observe",
				argumentsOf({
					post: { ...post, visibility: "public" },
					entry: {
						at,
						source: post.observations[0]?.source ?? "bookmark",
						statusId: post.id,
						action: "published",
					},
				}),
			);
			publicStore.event("bookmark.published", post.id, { url: post.url, publishedAt }, at);
			published += 1;
		}

		if (published === 0 && unchanged === 0 && hidden === 0) {
			throw fail("no-post", "nothing in the database matched", {
				id: context.values["id"],
				source: context.values["source"],
				since: context.values["since"],
			});
		}

		return { published, unchanged, hidden };
	},
};

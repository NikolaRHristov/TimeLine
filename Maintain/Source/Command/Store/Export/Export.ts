import { relative } from "node:path";
import { option } from "../../../CLI/Parser/Argument/Option.ts";
import { fail } from "../../../CLI/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { root } from "../../../Configuration/Load/Load.ts";
import * as Text from "../../../Content/Text.ts";
import { connect } from "../../../Store/Database/Connect.ts";
import { shadowDirectory } from "../../../Store/Path/Path.ts";
import { open as openShadow } from "../../../Store/Shadow/Shadow.ts";
import type { CommandContext } from "../../Context/Context.ts";

/**
 * Write the database back out as the archive's JSON layout.
 *
 * This is the insurance policy that makes it safe to call the database the
 * source of truth. A local server is a running service; without an export, a
 * lost `spacetime start` would be a lost archive. With one, the files are
 * always reconstructible, and `store push` is the way back.
 *
 * The export owns its files: a post is rewritten, the observation log is
 * replaced, an event is written at its canonical name. Nothing is deleted, so
 * running an export over a directory that holds more than the database does
 * leaves the surplus in place rather than silently removing history.
 */
export const Definition: CommandDefinition = {
	path: ["store", "export"],
	summary: Text.CommandStoreExportSummary,
	options: [
		option("to", "string", Text.OptionStoreExportTo),
		option("url", "string", Text.OptionStoreExportUrl, {
			format: "uri",
		}),
		option("dry-run", "boolean", Text.OptionStoreExportDryrun),
	],
	async run(context: CommandContext): Promise<unknown> {
		const url = typeof context.values["url"] === "string" ? context.values["url"] : undefined;
		const { store } = connect(url);

		const posts = await store.all();
		const observations = await store.observations();
		const events = await store.events();
		const counts = await store.counts();

		const target =
			typeof context.values["to"] === "string" && context.values["to"] !== ""
				? context.values["to"]
				: shadowDirectory();

		if (context.values["dry-run"] === true) {
			return {
				exported: counts.posts,
				observations: counts.observations,
				events: counts.events,
				media: counts.media,
				to: relative(root(), target),
				dryRun: true,
			};
		}

		// An archive with no rows is not an export, it is an empty directory that
		// would look like one. Refusing keeps a stopped server from reading as a
		// wiped archive.
		if (counts.posts === 0) {
			throw fail("no-post", "the database holds no posts; nothing was exported", {
				database: store.name,
			});
		}

		const shadow = openShadow(target);
		for (const post of posts) shadow.write(post);
		shadow.replaceObservations(observations);
		for (const event of events) shadow.writeEvent(event);
		shadow.reindex();

		return {
			exported: posts.length,
			observations: observations.length,
			events: events.length,
			media: posts.reduce((total, post) => total + post.media.length, 0),
			to: relative(root(), target),
		};
	},
};

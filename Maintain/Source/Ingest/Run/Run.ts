import {
	scrape,
	type ScrapeOptions,
} from "../../Command/Page/Bookmarks/Scrape/Scrape.ts";
import { load } from "../../Configuration/Load/Load.ts";
import { route, type Source } from "../../Model/Source/Source.ts";
import { merge } from "../../Store/Merge/Merge.ts";
import { shadowDirectory } from "../../Store/Path/Path.ts";
import { open } from "../../Store/Shadow/Shadow.ts";

export type IngestOptions = Pick<
	ScrapeOptions,
	"tab" | "limit" | "maxIdle" | "wait"
>;

export type IngestResult = {
	source: Source;
	scraped: number;
	new: number;
	updated: number;
	/** Event files written by this run. */
	events: number;
};

/**
 * Read one source and fold what it shows into the shadow store.
 *
 * Scraping writes here and nowhere else: no file under `Source/Content/` is
 * touched until `store publish` says so. Idempotence comes from the status id -
 * a second run over the same page finds every post already on file, reports
 * `new: 0`, and writes no `bookmark.added` event.
 */
export async function ingest(
	source: Source,
	options: IngestOptions = {},
): Promise<IngestResult> {
	const configuration = load();
	const target = route(configuration, source);
	const store = open(shadowDirectory());

	const startedAt = new Date().toISOString();
	store.event(
		"scrape.started",
		source,
		{ source, url: target.url, followTabs: target.followTabs },
		startedAt,
	);
	let events = 1;

	const result = await scrape(target.url, {
		...options,
		followTabs: target.followTabs,
	});

	const at = new Date().toISOString();
	let created = 0;
	let updated = 0;
	for (const post of result.posts) {
		const merged = merge(store.post(post.id), post, { source, at });
		store.write(merged.post);
		store.observe({ at, source, statusId: post.id, action: "observed" });
		if (merged.isNew === true) {
			created += 1;
			// `bookmark.added` is the archive saying "this post is new to me";
			// `payload.source` says which channel showed it first.
			store.event(
				"bookmark.added",
				post.id,
				{
					source,
					url: merged.post.url,
					author: merged.post.author.handle,
					firstSeenAt: merged.post.firstSeenAt,
				},
				at,
			);
			events += 1;
			continue;
		}
		updated += 1;
	}
	store.reindex();

	store.event(
		"scrape.finished",
		source,
		{
			source,
			scraped: result.posts.length,
			new: created,
			updated,
			pages: result.pages,
			rounds: result.rounds,
			stopped: result.stopped,
		},
		at,
	);
	events += 1;

	return {
		source,
		scraped: result.posts.length,
		new: created,
		updated,
		events,
	};
}

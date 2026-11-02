import { fail } from "../../CLI/Parser/Output/Failure.ts";
import { argumentsOf } from "../../Command/Store/Push/Push.ts";
import { load } from "../../Configuration/Load/Load.ts";
import type { ScrapeOptions } from "../../Model/Scrape/Scrape.ts";
import { route, type Source } from "../../Model/Source/Source.ts";
import { open as openClient } from "../../Spacetime/Client.ts";
import { merge } from "../../Store/Merge/Merge.ts";
import { shadowDirectory } from "../../Store/Path/Path.ts";
import { open as openShadow } from "../../Store/Shadow/Shadow.ts";
import type { Transport } from "../../Transport/Transport.ts";

export type IngestOptions = Pick<ScrapeOptions, "tab" | "limit" | "maxIdle" | "wait">;

export type IngestResult = {
	source: Source;
	scraped: number;
	new: number;
	updated: number;
	/** Event files written by this run. */
	events: number;
	/** What reached the database; `failed` is what did not. */
	database: { posts: number; events: number; failed: number };
};

/**
 * Read one source and fold what it shows into the archive.
 *
 * The database is the source of truth, so every record goes there as it is
 * walked; the JSON files are written as well, because they are the export and
 * an export that only exists after a separate command is one nobody runs.
 *
 * Writing the files first is deliberate. If the server is down the archive
 * still gains the scrape, and the run reports how many rows did not land - a
 * projection that is behind is recoverable with `store push`, a scrape that was
 * thrown away is not.
 *
 * Idempotence comes from the status id: a second run over the same page finds
 * every post already on file, reports `new: 0`, and writes no `bookmark.added`
 * event. The database agrees for the same reason - the row ids are derived from
 * the record, not from a counter.
 */
export async function ingest(
	source: Source,
	transport: Transport,
	options: IngestOptions = {},
): Promise<IngestResult> {
	const configuration = load();
	const target = route(configuration, source);
	const store = openShadow(shadowDirectory());
	const client = openClient(configuration.spacetime.url, configuration.spacetime.database);

	const database = { posts: 0, events: 0, failed: 0 };

	/** One reducer call, counted rather than thrown: the files are already safe. */
	const write = async (reducer: string, args: readonly unknown[]): Promise<void> => {
		try {
			await client.call(reducer, args);
			if (reducer === "observe") database.posts += 1;
			else database.events += 1;
		} catch {
			database.failed += 1;
		}
	};

	const startedAt = new Date().toISOString();
	const startPayload = { source, url: target.url, followTabs: target.followTabs };
	store.event("scrape.started", source, startPayload, startedAt);
	await write("record", ["scrape.started", source, JSON.stringify(startPayload), startedAt]);
	let events = 1;

	const result = await transport.scrape(target.url, {
		...options,
		followTabs: target.followTabs,
	});

	const at = new Date().toISOString();
	let created = 0;
	let updated = 0;
	for (const post of result.posts) {
		const merged = merge(store.post(post.id), post, { source, at });
		store.write(merged.post);
		const entry = { at, source, statusId: post.id, action: "observed" as const };
		store.observe(entry);
		await write("observe", argumentsOf({ post: merged.post, entry }));
		if (merged.isNew === true) {
			created += 1;
			// `bookmark.added` is the archive saying "this post is new to me";
			// `payload.source` says which channel showed it first.
			const added = {
				source,
				url: merged.post.url,
				author: merged.post.author.handle,
				firstSeenAt: merged.post.firstSeenAt,
			};
			store.event("bookmark.added", post.id, added, at);
			await write("record", ["bookmark.added", post.id, JSON.stringify(added), at]);
			events += 1;
			continue;
		}
		updated += 1;
	}
	store.reindex();

	const finished = {
		source,
		scraped: result.posts.length,
		new: created,
		updated,
		pages: result.pages,
		rounds: result.rounds,
		stopped: result.stopped,
	};
	store.event("scrape.finished", source, finished, at);
	await write("record", ["scrape.finished", source, JSON.stringify(finished), at]);
	events += 1;

	// The archive is written either way; a projection that is behind is a
	// different failure from a scrape that failed, and the caller is told which.
	if (database.failed > 0) {
		throw fail("spacetime-unreachable", "the scrape was archived but the database is behind", {
			source,
			scraped: result.posts.length,
			new: created,
			updated,
			...database,
			next: "run `maintain store push` once the server is up",
		});
	}

	return {
		source,
		scraped: result.posts.length,
		new: created,
		updated,
		events,
		database,
	};
}

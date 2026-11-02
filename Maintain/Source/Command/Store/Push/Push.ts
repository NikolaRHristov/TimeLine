import { option } from "../../../CLI/Parser/Argument/Option.ts";
import { fail, isFailure } from "../../../CLI/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { load } from "../../../Configuration/Load/Load.ts";
import * as Text from "../../../Content/Text.ts";
import { Source as Sources, type Source } from "../../../Model/Source/Source.ts";
import { open as openClient, type Client } from "../../../Spacetime/Client.ts";
import type { AuthorRecord } from "../../../Store/Author/Author.ts";
import { open as openAuthors } from "../../../Store/Author/Author.ts";
import type { ObservationEntry, ShadowPost } from "../../../Store/Model/Model.ts";
import { contentDirectory, shadowDirectory } from "../../../Store/Path/Path.ts";
import { open as openShadow, type ShadowEvent } from "../../../Store/Shadow/Shadow.ts";
import type { CommandContext } from "../../Context/Context.ts";

/**
 * Push the archive into the database.
 *
 * This is the import half of the round trip whose export half is `store
 * export`: everything the file layout holds becomes rows. It is also the
 * backfill, because "restore an archive" and "first load an archive" are the
 * same operation.
 *
 * Every call goes through a reducer whose row ids are derived from their
 * content, so a second run rewrites the same rows instead of duplicating them -
 * which is what makes this a repair rather than an append. The `at` a row is
 * keyed by is always read from the record, never the wall clock: a clock here
 * would append an observation on every run and make "pushed" a synonym for
 * "duplicated".
 *
 * The arguments are the *record*, never a page reading. A caller that has just
 * folded a scrape into the archive and a caller that is restoring a file send
 * the same thing, so the two paths cannot grow different rules.
 */

/** How many reducer calls may be in flight; a local server handles a handful well. */
const CONCURRENCY = 4;

/** A u32 column: a negative or fractional metric would fail the whole call. */
function whole(value: number): number {
	return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

/**
 * An `option<string>` argument on the wire.
 *
 * The reducer's JSON surface takes an option as a *tagged* value: a bare string
 * is rejected ("invalid type: string …, expected sum type") and a bare `null`
 * decodes as `none`. Sending the string therefore loses the timestamp only
 * after failing the whole call, and sending `null` for a present timestamp
 * loses it silently - so `some` is the only shape that carries a value.
 */
function optional(value: string | null): { some: string } | null {
	return value === null || value === "" ? null : { some: value };
}

/** One post record paired with one line of its observation log. */
export type Observed = { post: ShadowPost; entry: ObservationEntry };

/** One reducer call, as the drain needs it. */
type Call = {
	reducer: string;
	args: readonly unknown[];
	what: "post" | "media" | "event" | "membership";
};

/**
 * The observation lines a run would write, and how many posts it cannot.
 *
 * `skipped` counts a post no channel ever showed - the database would have to
 * invent the row that says where it came from - rather than a post the flags
 * excluded: an exclusion is the caller's own filter and loses nothing.
 *
 * One call per *observation line*, not per post. A post seen through three
 * channels is three rows in the log, and folding them into one would lose two.
 * With `--source` the post is written once, under the selected channel, so the
 * flag stays a projection rather than a partial restore.
 */
export function plan(
	posts: readonly ShadowPost[],
	entries: readonly ObservationEntry[],
	filter: Source | null,
	limit: number | null,
): { observed: Observed[]; posts: number; skipped: number } {
	const byPost = new Map<string, ObservationEntry[]>();
	for (const entry of entries) {
		if (filter !== null && entry.source !== filter) continue;
		const bucket = byPost.get(entry.statusId);
		if (bucket === undefined) byPost.set(entry.statusId, [entry]);
		else bucket.push(entry);
	}

	const observed: Observed[] = [];
	let skipped = 0;

	for (const post of posts) {
		const lines = byPost.get(post.id) ?? [];
		if (lines.length === 0) {
			skipped += 1;
			continue;
		}
		if (filter === null) {
			for (const entry of lines) observed.push({ post, entry });
			continue;
		}
		const first = [...lines].sort((left, right) => left.at.localeCompare(right.at))[0];
		if (first !== undefined) observed.push({ post, entry: first });
	}

	const capped = limit === null ? observed : observed.slice(0, limit);
	const written = new Set(capped.map((entry) => entry.post.id));
	return { observed: capped, posts: written.size, skipped };
}

/** Positional arguments of one `observe` call, in the reducer's declared order. */
export function argumentsOf({ post, entry }: Observed): readonly unknown[] {
	return [
		post.id,
		post.url,
		post.author.handle,
		post.author.name,
		post.author.verified,
		post.text,
		optional(post.postedAt),
		post.firstSeenAt,
		post.lastScrapedAt,
		post.visibility,
		JSON.stringify(post.lists),
		whole(post.metrics.replies),
		whole(post.metrics.reposts),
		whole(post.metrics.likes),
		whole(post.metrics.views),
		entry.source,
		entry.at,
		entry.action,
	];
}

/** One `attach` call per media item the archive holds, in page order. */
export function mediaOf(posts: readonly ShadowPost[]): Call[] {
	const calls: Call[] = [];
	for (const post of posts)
		post.media.forEach((item, position) =>
			calls.push({
				reducer: "attach",
				args: [post.id, item.kind, item.url, position],
				what: "media",
			}),
		);
	return calls;
}

/** One `record` call per event file. */
export function eventsOf(events: readonly ShadowEvent[]): Call[] {
	return events.map((event) => ({
		reducer: "record",
		args: [
			event.record.kind,
			event.record.subject,
			JSON.stringify(event.record.payload),
			event.record.at,
		],
		what: "event" as const,
	}));
}

/**
 * One `classify` call per `(handle, list)` the author collection files.
 *
 * A decision names one author and the lists it was filed under; the database
 * keys a row per pair, so a two-list author is two rows. A record with no
 * decision files nothing - an unfiled author is not a decision of `rule`.
 */
export function membershipOf(records: readonly AuthorRecord[]): Call[] {
	const calls: Call[] = [];
	for (const record of records) {
		const decision = record.decision;
		if (decision === null) continue;
		for (const list of record.lists) {
			calls.push({
				reducer: "classify",
				args: [
					record.handle,
					list,
					decision.by,
					decision.confidence ?? 0,
					decision.reason ?? "",
					record.firstSeenAt,
				],
				what: "membership",
			});
		}
	}
	return calls;
}

/**
 * Run every call, at most `CONCURRENCY` at a time.
 *
 * A reducer error is counted, not thrown away - one bad record must not hide the
 * other 199 - except when nothing has succeeded yet, which means the reducer,
 * the module or the database is wrong and repeating the call 200 times would
 * only repeat the same failure. A transport error stops the run: every remaining
 * call would fail the same way.
 */
async function drain(
	client: Client,
	calls: readonly Call[],
	counts: Record<Call["what"], number> & { failed: number },
): Promise<{ failure: unknown | null }> {
	const queue = [...calls];
	let stopped = false;
	let failure: unknown | null = null;
	let succeeded = 0;

	const worker = async (): Promise<void> => {
		for (;;) {
			if (stopped) return;
			const next = queue.shift();
			if (next === undefined) return;

			try {
				await client.call(next.reducer, next.args);
				counts[next.what] += 1;
				succeeded += 1;
			} catch (error) {
				if (!isFailure(error) || error.code !== "spacetime-reducer") {
					stopped = true;
					failure ??= error;
					return;
				}
				counts.failed += 1;
				failure ??= error;
				if (succeeded === 0) {
					stopped = true;
					return;
				}
			}
		}
	};

	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, calls.length) }, () => worker()));
	return { failure };
}

export const Definition: CommandDefinition = {
	path: ["store", "push"],
	summary: Text.CommandStorePushSummary,
	options: [
		option("source", "enum", Text.OptionStorePushSource, {
			values: Sources,
		}),
		option("limit", "integer", Text.OptionStorePushLimit),
		option("dry-run", "boolean", Text.OptionStorePushDryrun),
		option("url", "string", Text.OptionStorePushUrl, {
			format: "uri",
		}),
	],
	async run(context: CommandContext): Promise<unknown> {
		// The server's address is the identifier map's business, so a missing map
		// is `no-config` with the copy command attached, as everywhere else.
		const configuration = load();

		const url =
			typeof context.values["url"] === "string"
				? context.values["url"]
				: configuration.spacetime.url;
		const database = configuration.spacetime.database;
		const filter =
			typeof context.values["source"] === "string"
				? (context.values["source"] as Source)
				: null;
		const limit = typeof context.values["limit"] === "number" ? context.values["limit"] : null;

		if (limit !== null && limit < 0) {
			throw fail("usage", "--limit must not be negative", {
				value: limit,
			});
		}

		const shadow = openShadow(shadowDirectory());
		const posts = shadow.all();
		const {
			observed,
			posts: selected,
			skipped,
		} = plan(posts, shadow.observations(), filter, limit);

		// A filtered run touches only the selected posts' media: pushing the whole
		// archive's attachments while `--source` says otherwise would be a write
		// the caller did not ask for.
		const chosen = new Set(observed.map((entry) => entry.post.id));
		const touched = posts.filter((post) => chosen.has(post.id));

		const calls: Call[] = [
			...observed.map((entry) => ({
				reducer: "observe",
				args: argumentsOf(entry),
				what: "post" as const,
			})),
			...mediaOf(touched),
			...eventsOf(shadow.events()),
			...membershipOf(openAuthors(contentDirectory()).all()),
		];

		const source = filter ?? "all";

		if (context.values["dry-run"] === true) {
			return {
				pushed: selected,
				skipped,
				failed: 0,
				calls: calls.length,
				source,
				url,
				dryRun: true,
			};
		}

		const client = openClient(url, database);

		// One metadata request before the first insert: it proves the server is up,
		// the token is accepted and the database exists, so a bad configuration
		// fails once instead of once per post.
		await client.identity();

		const counts = { post: 0, media: 0, event: 0, membership: 0, failed: 0 };
		const { failure } = await drain(client, calls, counts);

		if (counts.failed > 0) {
			// Partial success is still a failure: the caller gets exit 2 and the
			// numbers, so a retry can be aimed at what is left. The server's own
			// words about the first rejection ride along - "No such procedure" and
			// "invalid arguments" need different fixes.
			const rejection = isFailure(failure) ? failure : null;
			throw fail("spacetime-reducer", "some records were rejected by the reducer", {
				...counts,
				skipped,
				source,
				url,
				reason: failure instanceof Error ? failure.message : String(failure),
				body: rejection?.extra["body"],
			});
		}
		if (failure !== null) throw failure;

		return {
			pushed: selected,
			skipped,
			failed: 0,
			posts: counts.post,
			media: counts.media,
			events: counts.event,
			membership: counts.membership,
			source,
			url,
		};
	},
};

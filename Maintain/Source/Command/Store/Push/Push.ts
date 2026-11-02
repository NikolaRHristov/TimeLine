import { option } from "../../../CLI/Parser/Argument/Option.ts";
import { fail, isFailure } from "../../../CLI/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { load } from "../../../Configuration/Load/Load.ts";
import { Source as Sources, type Source } from "../../../Model/Source/Source.ts";
import { open as openClient, type Client } from "../../../Spacetime/Client.ts";
import type { ShadowPost } from "../../../Store/Model/Model.ts";
import { shadowDirectory } from "../../../Store/Path/Path.ts";
import { open as openShadow } from "../../../Store/Shadow/Shadow.ts";

/**
 * Push the archive into the live projection.
 *
 * The JSON files stay the source of truth; this command is a projection, never a
 * move. Every post becomes one `observe` call carrying the post's current
 * metrics, and the reducer's own derived ids make the call idempotent - so
 * running this twice is a repair, not a duplication.
 *
 * What makes a re-run idempotent is the *arguments*, not the reducer: the
 * observation row is keyed `<postId>:<source>:<at>`, so `at` must be a value
 * read from the record (`lastScrapedAt`) and never the wall clock. A clock here
 * would append a second observation on every run and make "pushed" a synonym for
 * "duplicated".
 */

/** How many reducer calls may be in flight; a local server handles a handful well. */
const CONCURRENCY = 4;

/** A u32 column: a negative or fractional metric would fail the whole call. */
function whole(value: number): number {
	return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

/** One planned reducer call: the post, the channel it arrived through, and when. */
type Planned = { post: ShadowPost; source: Source; at: string };

/**
 * The observation a post is pushed as.
 *
 * The channel is the post's earliest observation, never the flag the caller
 * passed: a post seen through two sources must land on the same row whichever
 * `--source` selected it, or the idempotency above stops holding.
 */
function channel(post: ShadowPost, filter: Source | null): { source: Source; at: string } | null {
	const candidates =
		filter === null
			? post.observations
			: post.observations.filter((entry) => entry.source === filter);
	const first = [...candidates].sort((left, right) => left.at.localeCompare(right.at))[0];
	if (first === undefined) return null;

	// The metrics on the record are the ones from `lastScrapedAt`, so that is the
	// moment the observation describes; the observation's own `at` only covers a
	// record written by a version that never set the scrape timestamp.
	const at =
		post.lastScrapedAt !== ""
			? post.lastScrapedAt
			: first.at !== ""
				? first.at
				: post.firstSeenAt;
	return at === "" ? null : { source: first.source, at };
}

/**
 * The posts a run would push, and how many records it cannot represent.
 *
 * `skipped` counts a record the projection would have to invent a field for -
 * no permalink, no author handle - rather than a post the flags excluded: an
 * exclusion is the caller's own filter and loses nothing.
 */
export function plan(
	posts: readonly ShadowPost[],
	filter: Source | null,
	limit: number | null,
): { planned: Planned[]; skipped: number } {
	const planned: Planned[] = [];
	let skipped = 0;

	for (const post of posts) {
		const selected = channel(post, filter);
		if (selected === null) continue;
		if (post.url === "" || post.author.handle === "") {
			skipped += 1;
			continue;
		}
		planned.push({ post, source: selected.source, at: selected.at });
	}

	return {
		planned: limit === null ? planned : planned.slice(0, limit),
		skipped,
	};
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

/** Positional arguments in the reducer's declared order. */
export function argumentsOf({ post, source, at }: Planned): readonly unknown[] {
	return [
		post.id,
		post.url,
		post.author.handle,
		post.author.name,
		post.author.verified,
		post.text,
		optional(post.postedAt),
		source,
		at,
		whole(post.metrics.replies),
		whole(post.metrics.reposts),
		whole(post.metrics.likes),
		whole(post.metrics.views),
	];
}

/**
 * Call `observe` for every planned post, at most `CONCURRENCY` at a time.
 *
 * A reducer error is counted, not thrown away - one bad record must not hide the
 * other 199 - except when nothing has succeeded yet, which means the reducer,
 * the module or the database is wrong and repeating the call 200 times would
 * only repeat the same failure. A transport error stops the run: every remaining
 * call would fail the same way.
 */
async function drain(
	client: Client,
	planned: readonly Planned[],
	counts: { pushed: number; failed: number },
): Promise<{ failure: unknown | null }> {
	const queue = [...planned];
	let stopped = false;
	let failure: unknown | null = null;

	const worker = async (): Promise<void> => {
		for (;;) {
			if (stopped) return;
			const next = queue.shift();
			if (next === undefined) return;

			try {
				await client.call("observe", argumentsOf(next));
				counts.pushed += 1;
			} catch (error) {
				if (!isFailure(error) || error.code !== "spacetime-reducer") {
					stopped = true;
					failure ??= error;
					return;
				}
				counts.failed += 1;
				failure ??= error;
				if (counts.pushed === 0) {
					stopped = true;
					return;
				}
			}
		}
	};

	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, planned.length) }, () => worker()),
	);
	return { failure };
}

export const Definition: CommandDefinition = {
	path: ["store", "push"],
	summary: "Project shadow records into the live SpacetimeDB database.",
	options: [
		option("source", "enum", "Push only posts observed through this source.", {
			values: Sources,
		}),
		option("limit", "integer", "Push at most this many posts."),
		option("dry-run", "boolean", "Count what would be pushed; contact nothing, write nothing."),
		option("url", "string", "SpacetimeDB server URL (default: the identifier map's).", {
			format: "uri",
		}),
	],
	async run(values): Promise<unknown> {
		// The server's address is the identifier map's business, so a missing map
		// is `no-config` with the copy command attached, as everywhere else.
		const configuration = load();

		const url = typeof values["url"] === "string" ? values["url"] : configuration.spacetime.url;
		const database = configuration.spacetime.database;
		const filter = typeof values["source"] === "string" ? (values["source"] as Source) : null;
		const limit = typeof values["limit"] === "number" ? values["limit"] : null;

		if (limit !== null && limit < 0) {
			throw fail("usage", "--limit must not be negative", {
				value: limit,
			});
		}

		const shadow = openShadow(shadowDirectory());

		const { planned: selected, skipped } = plan(shadow.all(), filter, limit);
		const source = filter ?? "all";

		if (values["dry-run"] === true) {
			return {
				pushed: selected.length,
				skipped,
				failed: 0,
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

		const counts = { pushed: 0, failed: 0 };
		const { failure } = await drain(client, selected, counts);

		if (counts.failed > 0) {
			// Partial success is still a failure: the caller gets exit 2 and the
			// numbers, so a retry can be aimed at what is left. The server's own
			// words about the first rejection ride along - "No such procedure" and
			// "invalid arguments" need different fixes.
			const rejection = isFailure(failure) ? failure : null;
			throw fail("spacetime-reducer", "some records were rejected by the reducer", {
				pushed: counts.pushed,
				skipped,
				failed: counts.failed,
				source,
				url,
				reason: failure instanceof Error ? failure.message : String(failure),
				body: rejection?.extra["body"],
			});
		}
		if (failure !== null) throw failure;

		return {
			pushed: counts.pushed,
			skipped,
			failed: counts.failed,
			source,
			url,
		};
	},
};

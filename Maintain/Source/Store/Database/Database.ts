import type { EventKind, EventRecord } from "../../Model/Event/Event.ts";
import type {
	MediaItem,
	MembershipRecord,
	Observation,
	PostRecord,
} from "../../Model/Generated/Types.ts";
import type { Source } from "../../Model/Source/Source.ts";
import type { Client, Row } from "../../Spacetime/Client.ts";
import type { ObservationEntry, Visibility } from "../Model/Model.ts";

/**
 * The archive, read from SpacetimeDB.
 *
 * The database holds the history; this module is the only thing that reads it.
 * Every row is loaded once per run and assembled in memory, because the shapes
 * the rest of the pipeline wants are nested - a post carries its media, its
 * channels and its counts - and a query per post would turn one round trip into
 * two hundred.
 *
 * Nothing here falls back to the files. A caller that cannot reach the server
 * gets `spacetime-unreachable` and stops: an empty archive and an unreachable
 * one are different answers, and only one of them is true.
 */

export type DatabaseCounts = {
	posts: number;
	observations: number;
	events: number;
	authors: number;
	media: number;
	membership: number;
};

export type DatabaseStore = {
	/** The database this store reads. */
	name: string;
	counts(): Promise<DatabaseCounts>;
	/** Every status id, ascending. */
	ids(): Promise<string[]>;
	post(id: string): Promise<PostRecord | null>;
	/** Every record, newest status id last. */
	all(): Promise<PostRecord[]>;
	/** The append-only observation log, oldest first. */
	observations(): Promise<ObservationEntry[]>;
	/** Every event, oldest first, optionally one subject's trail. */
	events(subject?: string): Promise<EventRecord[]>;
	/** Every filing decision, keyed `<list>:<handle>`. */
	membership(): Promise<MembershipRecord[]>;
};

/** What one run reads out of the database, and everything derived from it. */
type Snapshot = {
	posts: PostRecord[];
	observations: ObservationEntry[];
	events: EventRecord[];
	membership: MembershipRecord[];
	counts: DatabaseCounts;
};

const ORDER = [
	"scrape.started",
	"scrape.finished",
	"bookmark.added",
	"bookmark.removed",
	"list.assigned",
	"list.removed",
	"bookmark.published",
	"bookmark.hidden",
	"vote.nominated",
	"vote.cast",
	"vote.approved",
	"vote.rejected",
	"vote.ranked",
] as const;

function text(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function count(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

/** A fractional number, as `confidence` is stored. */
function real(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** A slug list stored as JSON text. An unreadable list is an empty one. */
function slugs(value: unknown): string[] {
	const raw = text(value);
	if (raw === "") return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((entry): entry is string => typeof entry === "string");
	} catch {
		return [];
	}
}

/** An event payload stored as JSON text. An unreadable payload is an empty one. */
function payload(value: unknown): Record<string, unknown> {
	const raw = text(value);
	if (raw === "") return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

/** A visibility as the module stores it; anything unknown reads as `shadow`. */
function visibility(value: unknown): Visibility {
	return value === "public" || value === "hidden" ? value : "shadow";
}

/** An event kind the module stored; one this version does not know is dropped. */
function kind(value: unknown): EventKind | null {
	const raw = text(value);
	return (ORDER as readonly string[]).includes(raw) ? (raw as EventKind) : null;
}

/** A channel name the module stored. */
function source(value: unknown): Source {
	return value === "like" || value === "history" ? value : "bookmark";
}

/** Group rows by a key, keeping insertion order. */
function group<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
	const map = new Map<string, T[]>();
	for (const row of rows) {
		const name = key(row);
		const bucket = map.get(name);
		if (bucket === undefined) map.set(name, [row]);
		else bucket.push(row);
	}
	return map;
}

/**
 * Read every table and assemble the archive.
 *
 * The six reads go out together: the server is local, the tables are small, and
 * a run that had to wait for them one at a time would make `store status` feel
 * like a network call.
 */
async function snapshot(client: Client): Promise<Snapshot> {
	const [postRows, authorRows, observationRows, mediaRows, eventRows, membershipRows] =
		await Promise.all([
			client.sql("SELECT * FROM post"),
			client.sql("SELECT * FROM author"),
			client.sql("SELECT * FROM observation"),
			client.sql("SELECT * FROM media"),
			client.sql("SELECT * FROM event"),
			client.sql("SELECT * FROM membership"),
		]);

	const authors = new Map<string, Row>();
	for (const row of authorRows) authors.set(text(row["handle"]), row);

	const media = group(mediaRows, (row) => text(row["postId"]));
	const channels = group(observationRows, (row) => text(row["postId"]));

	const posts: PostRecord[] = postRows
		.map((row): PostRecord => {
			const handle = text(row["author"]);
			const known = authors.get(handle);
			const items: MediaItem[] = [...(media.get(text(row["id"])) ?? [])]
				// The table is keyed by content, so the key's order is not the page's.
				// `position` is what carries the gallery order across the round trip.
				.sort((left, right) => count(left["position"]) - count(right["position"]))
				.map((item) => ({
					kind:
						text(item["kind"]) === "video"
							? "video"
							: text(item["kind"]) === "gif"
								? "gif"
								: text(item["kind"]) === "link"
									? "link"
									: "image",
					url: text(item["url"]),
				}));

			// One channel per source, at the moment it first showed the post - the
			// same fold the file store applies when it merges a second reading.
			const first = new Map<Source, string>();
			for (const entry of channels.get(text(row["id"])) ?? []) {
				const name = source(entry["source"]);
				const at = text(entry["at"]);
				const held = first.get(name);
				if (held === undefined || at < held) first.set(name, at);
			}
			const observations: Observation[] = [...first.entries()]
				.map(([name, at]) => ({ source: name, at }))
				.sort((left, right) => left.at.localeCompare(right.at));

			const postedAt = row["postedAt"];

			return {
				id: text(row["id"]),
				url: text(row["url"]),
				// An author row is written with every post, so a missing one means the
				// table was edited by hand; the handle is still the honest identity.
				author: {
					handle,
					name: text(known?.["name"], handle),
					verified: known?.["verified"] === true,
				},
				text: text(row["text"]),
				postedAt: typeof postedAt === "string" ? postedAt : null,
				media: items,
				metrics: {
					replies: count(row["replies"]),
					reposts: count(row["reposts"]),
					likes: count(row["likes"]),
					views: count(row["views"]),
				},
				observations,
				firstSeenAt: text(row["firstSeenAt"]),
				lastScrapedAt: text(row["lastScrapedAt"]),
				visibility: visibility(row["visibility"]),
				lists: slugs(row["lists"]),
			};
		})
		.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

	const observations: ObservationEntry[] = observationRows
		.map((row) => ({
			at: text(row["at"]),
			source: source(row["source"]),
			statusId: text(row["postId"]),
			action:
				text(row["action"]) === "published"
					? ("published" as const)
					: text(row["action"]) === "hidden"
						? ("hidden" as const)
						: ("observed" as const),
		}))
		// A log's order is its history, and one scrape run stamps every row it
		// writes with the same `at`. Sorting by the whole tuple makes two exports
		// of the same rows byte-identical instead of leaving the ties to whatever
		// order the table happened to return.
		.sort(
			(left, right) =>
				left.at.localeCompare(right.at) ||
				left.statusId.localeCompare(right.statusId) ||
				left.source.localeCompare(right.source) ||
				left.action.localeCompare(right.action),
		);

	const events: EventRecord[] = [];
	for (const row of eventRows) {
		const name = kind(row["kind"]);
		if (name === null) continue;
		events.push({
			at: text(row["at"]),
			kind: name,
			subject: text(row["subject"]),
			payload: payload(row["payload"]),
		});
	}
	events.sort((left, right) => left.at.localeCompare(right.at));

	const membership: MembershipRecord[] = membershipRows.map((row) => ({
		list: text(row["list"]),
		handle: text(row["handle"]),
		by:
			text(row["by"]) === "manual"
				? "manual"
				: text(row["by"]) === "model"
					? "model"
					: "rule",
		confidence: real(row["confidence"]),
		reason: text(row["reason"]),
		at: text(row["at"]),
	}));

	return {
		posts,
		observations,
		events,
		membership,
		counts: {
			posts: posts.length,
			observations: observations.length,
			events: events.length,
			authors: authorRows.length,
			media: mediaRows.length,
			membership: membership.length,
		},
	};
}

/** A read-only store bound to one database. */
export function open(client: Client): DatabaseStore {
	let loaded: Promise<Snapshot> | null = null;

	// One snapshot per run: a command that asks three questions must not read
	// the same table three times, and must not see the table move underneath it.
	const read = (): Promise<Snapshot> => {
		loaded ??= snapshot(client);
		return loaded;
	};

	return {
		name: client.database,

		async counts(): Promise<DatabaseCounts> {
			return (await read()).counts;
		},

		async ids(): Promise<string[]> {
			return (await read()).posts.map((post) => post.id);
		},

		async post(id: string): Promise<PostRecord | null> {
			return (await read()).posts.find((post) => post.id === id) ?? null;
		},

		async all(): Promise<PostRecord[]> {
			return (await read()).posts;
		},

		async observations(): Promise<ObservationEntry[]> {
			return (await read()).observations;
		},

		async events(subject?: string): Promise<EventRecord[]> {
			const all = (await read()).events;
			return subject === undefined ? all : all.filter((event) => event.subject === subject);
		},

		async membership(): Promise<MembershipRecord[]> {
			return (await read()).membership;
		},
	};
}

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fail } from "../../CLI/Parser/Output/Failure.ts";
import { optional, root } from "../../Configuration/Load/Load.ts";
import { DEFAULT_VOTE } from "../../Configuration/Schema/Schema.ts";
import type { EventKind } from "../../Model/Event/Event.ts";
import {
	curatedDocument,
	document,
	isStatus,
	type CuratedEntry,
	type VoteEntry,
} from "../../Model/Vote/Vote.ts";
import { stringify } from "../../Output/Json/Json.ts";
import { open as openPublic } from "../Public/Public.ts";

/**
 * The default place a pulled vote count is kept: gitignored, because it is a
 * snapshot of somebody else's database rather than a fact about this repository.
 */
export const DEFAULT_VOTE_STORAGE = DEFAULT_VOTE;

/**
 * An entry id becomes a filename, so it is held to what a filename can carry.
 *
 * Not `\d+` like a status id: an external URL that carries no `/status/<id>`
 * is nominated under a slug, and refusing those would make `--url` a lie. The
 * pattern still forbids separators, dots and leading dashes, so `../escape`
 * and `..` cannot become paths.
 */
const ENTRY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** One pulled count, as it sits in the vote store. */
export type VoteSnapshot = { id: string; votes: number; fetchedAt: string };

export type VoteStore = {
	/** Absolute path of the content root (`Source/Content`). */
	content: string;
	voted(id: string): VoteEntry | null;
	/** Every entry on file, in filename order; malformed files are skipped. */
	votedAll(): VoteEntry[];
	writeVoted(entry: VoteEntry): string;
	curated(id: string): CuratedEntry | null;
	curatedAll(): CuratedEntry[];
	writeCurated(entry: CuratedEntry): string;
	/** Write a whole dense index in one go; the caller owns the ranks. */
	writeCuratedMany(entries: readonly CuratedEntry[]): string[];
	removeCurated(id: string): boolean;
	/** Write one event into the site's Event collection. */
	event(kind: EventKind, subject: string, payload?: Record<string, unknown>, at?: string): string;
};

function readJson(path: string): unknown {
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch {
		return null;
	}
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function record(value: unknown): Record<string, unknown> | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function names(directory: string): string[] {
	try {
		return readdirSync(directory)
			.filter((name) => name.endsWith(".json"))
			.sort();
	} catch {
		return [];
	}
}

function text(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

/** A whole number that is not negative; a count is never fractional. */
function count(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	const whole = Math.trunc(value);
	return whole >= 0 ? whole : null;
}

/**
 * One Voted file, or null when it does not describe an entry.
 *
 * Every field is checked because these files are content: a person may edit
 * one by hand, and a half-written file must not take down `queue` for the whole
 * index. A file that fails is skipped by `votedAll` rather than thrown over.
 */
function votedEntry(value: unknown, id: string): VoteEntry | null {
	const body = record(value);
	if (body === null) return null;
	if (typeof body["url"] !== "string" || !isStatus(body["status"])) return null;
	const votes = count(body["votes"]);
	if (votes === null) return null;

	const author = record(body["author"]) ?? {};
	const lists = Array.isArray(body["lists"])
		? body["lists"].filter((entry): entry is string => typeof entry === "string")
		: [];

	const entry: VoteEntry = {
		id: text(body["id"], id),
		url: body["url"],
		author: {
			handle: text(author["handle"]),
			name: text(author["name"]),
			verified: author["verified"] === true,
		},
		lists,
		votes,
		votedAt: text(body["votedAt"]),
		nominatedAt: text(body["nominatedAt"]),
		status: body["status"],
	};
	if (typeof body["title"] === "string") entry.title = body["title"];
	if (typeof body["note"] === "string") entry.note = body["note"];
	// Rebuilt through the writer's own key order, so a file the person edited
	// by hand and one this CLI wrote compare equal when they say the same thing.
	return document(entry) as unknown as VoteEntry;
}

function curatedEntry(value: unknown, id: string): CuratedEntry | null {
	const body = record(value);
	if (body === null) return null;
	const rank = count(body["rank"]);
	const votes = count(body["votes"]);
	if (rank === null || rank < 1 || votes === null) return null;

	return curatedDocument({
		id: text(body["id"], id),
		rank,
		votes,
		approvedAt: text(body["approvedAt"]),
		approvedBy: text(body["approvedBy"], "manual"),
	}) as unknown as CuratedEntry;
}

/**
 * The vote store: the candidate index, the Curated index, and the events that
 * describe both.
 *
 * `Voted/` and `Curated/` live inside the content root because the site reads
 * them; `Maintain/Storage/Vote/` lives outside it because the site must never
 * read a live count. Nothing here fetches anything - `vote sync` is the only
 * command that talks to a network, and it hands the numbers to this store.
 */
export function open(content: string): VoteStore {
	const votedDirectory = (): string => join(content, "Voted");
	const curatedDirectory = (): string => join(content, "Curated");
	const events = openPublic(content);

	const write = (directory: string, name: string, value: unknown): string => {
		const path = join(directory, `${name}.json`);
		try {
			mkdirSync(directory, { recursive: true });
			writeFileSync(path, `${stringify(value)}\n`, "utf8");
		} catch (error) {
			throw fail("io-error", "could not write the vote record", {
				path,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
		return path;
	};

	const store: VoteStore = {
		content,

		voted(id: string): VoteEntry | null {
			if (!ENTRY_ID.test(id)) return null;
			return votedEntry(readJson(join(votedDirectory(), `${id}.json`)), id);
		},

		votedAll(): VoteEntry[] {
			const found: VoteEntry[] = [];
			for (const name of names(votedDirectory())) {
				const id = name.slice(0, -".json".length);
				const entry = votedEntry(readJson(join(votedDirectory(), name)), id);
				if (entry === null) {
					// A named warning, not a throw: one unreadable file must not
					// hide the rest of the queue from the person reading it.
					process.stderr.write(
						`maintain: skipping unreadable vote record Voted/${name}\n`,
					);
					continue;
				}
				found.push(entry);
			}
			return found;
		},

		writeVoted(entry: VoteEntry): string {
			if (!ENTRY_ID.test(entry.id)) {
				throw fail(
					"io-error",
					"an entry id must be a plain slug before it becomes a filename",
					{ id: entry.id },
				);
			}
			// Key order is the documented shape, so a hand-read file and a
			// written one look the same.
			return write(votedDirectory(), entry.id, document(entry));
		},

		curated(id: string): CuratedEntry | null {
			if (!ENTRY_ID.test(id)) return null;
			return curatedEntry(readJson(join(curatedDirectory(), `${id}.json`)), id);
		},

		curatedAll(): CuratedEntry[] {
			const found: CuratedEntry[] = [];
			for (const name of names(curatedDirectory())) {
				const id = name.slice(0, -".json".length);
				const entry = curatedEntry(readJson(join(curatedDirectory(), name)), id);
				if (entry === null) {
					process.stderr.write(
						`maintain: skipping unreadable curated record Curated/${name}\n`,
					);
					continue;
				}
				found.push(entry);
			}
			return found;
		},

		writeCurated(entry: CuratedEntry): string {
			if (!ENTRY_ID.test(entry.id)) {
				throw fail(
					"io-error",
					"an entry id must be a plain slug before it becomes a filename",
					{ id: entry.id },
				);
			}
			return write(curatedDirectory(), entry.id, curatedDocument(entry));
		},

		writeCuratedMany(entries: readonly CuratedEntry[]): string[] {
			return entries.map((entry) => store.writeCurated(entry));
		},

		removeCurated(id: string): boolean {
			if (!ENTRY_ID.test(id)) return false;
			const path = join(curatedDirectory(), `${id}.json`);
			if (!existsSync(path)) return false;
			try {
				rmSync(path);
			} catch (error) {
				throw fail("io-error", "could not remove the curated record", {
					path,
					reason: error instanceof Error ? error.message : String(error),
				});
			}
			return true;
		},

		event(
			kind: EventKind,
			subject: string,
			payload: Record<string, unknown> = {},
			at?: string,
		): string {
			return events.event(kind, subject, payload, at);
		},
	};

	return store;
}

/**
 * Where `vote sync` parks the counts it pulled.
 *
 * `MAINTAIN_VOTE_STORAGE` exists for the same reason `MAINTAIN_STORAGE` does:
 * a test points the whole store at a temporary directory and proves that a
 * failed sync wrote nothing, without touching the real archive.
 */
export function voteDirectory(): string {
	const configured = process.env["MAINTAIN_VOTE_STORAGE"];
	if (configured !== undefined && configured.length > 0) return resolve(root(), configured);
	return resolve(root(), optional()?.storage.vote ?? DEFAULT_VOTE_STORAGE);
}

/** One pulled count, written where the site cannot read it. */
export function writeSnapshot(snapshot: VoteSnapshot): string {
	const directory = voteDirectory();
	const path = join(directory, `${snapshot.id}.json`);
	try {
		mkdirSync(directory, { recursive: true });
		writeFileSync(path, `${stringify(snapshot)}\n`, "utf8");
	} catch (error) {
		throw fail("io-error", "could not write the pulled vote count", {
			path,
			reason: error instanceof Error ? error.message : String(error),
		});
	}
	return path;
}

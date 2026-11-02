import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fail } from "../../CLI/Parser/Output/Failure.ts";
import { fileName, type EventKind, type EventRecord } from "../../Model/Event/Event.ts";
import { stringify } from "../../Output/Json/Json.ts";
import type { PublicBookmark } from "../Model/Model.ts";

const STATUS_ID = /^\d{1,32}$/;

export type PublicStore = {
	/** Absolute path of the content root (`Source/Content`). */
	content: string;
	bookmark(id: string): PublicBookmark | null;
	/** Write one published record; returns its path. */
	writeBookmark(record: PublicBookmark): string;
	/** Delete one published record; true when a file was removed. */
	removeBookmark(id: string): boolean;
	ids(): string[];
	/** Write one event into the site's Event collection. */
	event(kind: EventKind, subject: string, payload?: Record<string, unknown>, at?: string): string;
	/** Copy an already-written event file into the site's Event collection. */
	copyEvent(file: string): string | null;
	/** Every published event, oldest first. */
	events(): EventRecord[];
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

/**
 * The public store: the content collections the site builds from.
 *
 * Only `store publish` and `store hide` write here. Every write is idempotent -
 * publishing a published post rewrites the same bytes, hiding a hidden post
 * removes nothing - so a re-run is never a second change.
 */
export function open(content: string): PublicStore {
	const bookmarkDirectory = (): string => join(content, "Bookmark");
	const eventDirectory = (): string => join(content, "Event");

	const store: PublicStore = {
		content,

		bookmark(id: string): PublicBookmark | null {
			if (!STATUS_ID.test(id)) return null;
			const value = record(readJson(join(bookmarkDirectory(), `${id}.json`)));
			if (value === null || typeof value["id"] !== "string") return null;
			return value as unknown as PublicBookmark;
		},

		writeBookmark(bookmark: PublicBookmark): string {
			if (!STATUS_ID.test(bookmark.id)) {
				throw fail("io-error", "a post id must be numeric before it becomes a filename", {
					id: bookmark.id,
				});
			}
			const path = join(bookmarkDirectory(), `${bookmark.id}.json`);
			try {
				mkdirSync(bookmarkDirectory(), { recursive: true });
				writeFileSync(path, `${stringify(bookmark)}\n`, "utf8");
			} catch (error) {
				throw fail("io-error", "could not write the published record", {
					path,
					reason: error instanceof Error ? error.message : String(error),
				});
			}
			return path;
		},

		removeBookmark(id: string): boolean {
			if (!STATUS_ID.test(id)) return false;
			const path = join(bookmarkDirectory(), `${id}.json`);
			if (!existsSync(path)) return false;
			try {
				rmSync(path);
			} catch (error) {
				throw fail("io-error", "could not remove the published record", {
					path,
					reason: error instanceof Error ? error.message : String(error),
				});
			}
			return true;
		},

		ids(): string[] {
			return names(bookmarkDirectory())
				.map((name) => name.slice(0, -".json".length))
				.filter((id) => STATUS_ID.test(id));
		},

		event(
			kind: EventKind,
			subject: string,
			payload: Record<string, unknown> = {},
			at?: string,
		): string {
			const moment = at ?? new Date().toISOString();
			const event: EventRecord = { at: moment, kind, subject, payload };
			const name = fileName(moment, kind, subject);
			try {
				mkdirSync(eventDirectory(), { recursive: true });
				let path = join(eventDirectory(), name);
				for (let attempt = 2; existsSync(path) && attempt < 100; attempt += 1) {
					path = join(eventDirectory(), name.replace(/\.json$/, `-${attempt}.json`));
				}
				writeFileSync(path, `${stringify(event)}\n`, "utf8");
				return path;
			} catch (error) {
				throw fail("io-error", "could not write the published event", {
					directory: eventDirectory(),
					reason: error instanceof Error ? error.message : String(error),
				});
			}
		},

		copyEvent(file: string): string | null {
			const leaf = file.slice(file.lastIndexOf("/") + 1);
			const path = join(eventDirectory(), leaf);
			if (existsSync(path)) return path;
			try {
				mkdirSync(eventDirectory(), { recursive: true });
				copyFileSync(file, path);
			} catch {
				// An event the site never sees is not worth failing a publish over.
				return null;
			}
			return path;
		},

		events(): EventRecord[] {
			const found: EventRecord[] = [];
			for (const name of names(eventDirectory())) {
				const value = record(readJson(join(eventDirectory(), name)));
				if (value === null || typeof value["at"] !== "string") continue;
				found.push(value as unknown as EventRecord);
			}
			return found.sort((left, right) => left.at.localeCompare(right.at));
		},
	};

	return store;
}

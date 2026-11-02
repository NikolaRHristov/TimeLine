import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fail } from "../../Cli/Parser/Output/Failure.ts";
import {
	fileName,
	subjectSuffix,
	type EventKind,
	type EventRecord,
} from "../../Model/Event/Event.ts";
import { stringify } from "../../Output/Json/Json.ts";
import type { ObservationEntry, ShadowPost } from "../Model/Model.ts";

/** A status id is digits; anything else is not a post and must not become a path. */
const STATUS_ID = /^\d{1,32}$/;

export type ShadowEvent = { file: string; record: EventRecord };

export type ShadowStore = {
	/** Absolute path of the store root. */
	directory: string;
	/** One record, or null when the id was never observed. */
	post(id: string): ShadowPost | null;
	/** Write a record; the caller decides what the record says. */
	write(post: ShadowPost): string;
	/** Every status id on file, newest directory entry last. */
	ids(): string[];
	/** Every record on file. */
	all(): ShadowPost[];
	/** Append one line to `Observation.jsonl`. */
	observe(entry: ObservationEntry): void;
	/** How many lines `Observation.jsonl` holds; 0 when it was never written. */
	observationCount(): number;
	/** Write one event file and return its path. */
	event(kind: EventKind, subject: string, payload?: Record<string, unknown>, at?: string): string;
	/** Every event about `subject`, oldest first. */
	events(subject?: string): ShadowEvent[];
	/** Rebuild `Index.json` from the directory; cheap to call after a batch. */
	reindex(): string;
	/** The id -> file map as it stands on disk. */
	index(): Record<string, string>;
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

function entries(directory: string, suffix: string): string[] {
	let names: string[];
	try {
		names = readdirSync(directory);
	} catch {
		return [];
	}
	return names.filter((name) => name.endsWith(suffix)).sort();
}

/**
 * The shadow store: everything the pipeline has ever seen, and nothing the site
 * may show. Nothing here is tracked by git, and no command other than
 * `store publish` reads this directory on behalf of the site.
 */
export function open(directory: string): ShadowStore {
	const postDirectory = (): string => join(directory, "Post");
	const eventDirectory = (): string => join(directory, "Event");
	const indexPath = (): string => join(directory, "Index.json");

	const store: ShadowStore = {
		directory,

		post(id: string): ShadowPost | null {
			if (!STATUS_ID.test(id)) return null;
			const value = record(readJson(join(postDirectory(), `${id}.json`)));
			if (value === null || typeof value["id"] !== "string") return null;
			return value as unknown as ShadowPost;
		},

		write(post: ShadowPost): string {
			if (!STATUS_ID.test(post.id)) {
				throw fail("io-error", "a post id must be numeric before it becomes a filename", {
					id: post.id,
				});
			}
			const path = join(postDirectory(), `${post.id}.json`);
			try {
				mkdirSync(postDirectory(), { recursive: true });
				writeFileSync(path, `${stringify(post)}\n`, "utf8");
			} catch (error) {
				throw fail("io-error", "could not write the shadow record", {
					path,
					reason: error instanceof Error ? error.message : String(error),
				});
			}
			return path;
		},

		ids(): string[] {
			return entries(postDirectory(), ".json")
				.map((name) => name.slice(0, -".json".length))
				.filter((id) => STATUS_ID.test(id));
		},

		all(): ShadowPost[] {
			const posts: ShadowPost[] = [];
			for (const id of store.ids()) {
				const post = store.post(id);
				if (post !== null) posts.push(post);
			}
			return posts;
		},

		observe(entry: ObservationEntry): void {
			const path = join(directory, "Observation.jsonl");
			try {
				mkdirSync(directory, { recursive: true });
				appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
			} catch (error) {
				throw fail("io-error", "could not append the observation log", {
					path,
					reason: error instanceof Error ? error.message : String(error),
				});
			}
		},

		observationCount(): number {
			let raw: string;
			try {
				raw = readFileSync(join(directory, "Observation.jsonl"), "utf8");
			} catch {
				return 0;
			}
			return raw.split("\n").filter((line) => line.trim() !== "").length;
		},

		event(
			kind: EventKind,
			subject: string,
			payload: Record<string, unknown> = {},
			at?: string,
		): string {
			const moment = at ?? new Date().toISOString();
			const record: EventRecord = { at: moment, kind, subject, payload };
			const name = fileName(moment, kind, subject);
			try {
				mkdirSync(eventDirectory(), { recursive: true });
				let path = join(eventDirectory(), name);
				// Same millisecond, same kind, same subject: keep both rather than
				// overwrite the earlier one.
				for (let attempt = 2; existsSync(path) && attempt < 100; attempt += 1) {
					path = join(eventDirectory(), name.replace(/\.json$/, `-${attempt}.json`));
				}
				writeFileSync(path, `${stringify(record)}\n`, "utf8");
				return path;
			} catch (error) {
				throw fail("io-error", "could not write the event file", {
					directory: eventDirectory(),
					reason: error instanceof Error ? error.message : String(error),
				});
			}
		},

		events(subject?: string): ShadowEvent[] {
			const suffix = subject === undefined ? ".json" : subjectSuffix(subject);
			const found: ShadowEvent[] = [];
			for (const name of entries(eventDirectory(), suffix)) {
				const value = record(readJson(join(eventDirectory(), name)));
				if (value === null || typeof value["at"] !== "string") continue;
				found.push({
					file: join(eventDirectory(), name),
					record: value as unknown as EventRecord,
				});
			}
			return found.sort((left, right) => left.record.at.localeCompare(right.record.at));
		},

		reindex(): string {
			const posts: Record<string, string> = {};
			for (const id of store.ids()) posts[id] = `Post/${id}.json`;
			const path = indexPath();
			try {
				mkdirSync(directory, { recursive: true });
				writeFileSync(
					path,
					`${stringify({ version: 1, updatedAt: new Date().toISOString(), posts })}\n`,
					"utf8",
				);
			} catch (error) {
				throw fail("io-error", "could not write the shadow index", {
					path,
					reason: error instanceof Error ? error.message : String(error),
				});
			}
			return path;
		},

		index(): Record<string, string> {
			const value = record(readJson(indexPath()));
			const posts = value === null ? null : record(value["posts"]);
			if (posts === null) return {};
			const map: Record<string, string> = {};
			for (const [id, file] of Object.entries(posts)) {
				if (typeof file === "string") map[id] = file;
			}
			return map;
		},
	};

	return store;
}

import { fail } from "../../Cli/Parser/Output/Failure.ts";
import type { List } from "../../Model/List/List.ts";

/**
 * The identifier map: the only file that knows a list id or a handle.
 *
 * `lists` is an array on purpose - the set of lists is the person's, not the
 * code's, so nothing here can enumerate it. An empty array is valid: the
 * commands that need a list fail with `unknown-list` naming what is configured,
 * while every command that does not need one keeps working.
 */
export type Configuration = {
	cdp: { host: string; port: number };
	profile: string;
	lists: List[];
	/** One route per ingest source. `likes` needs `profile` to be known. */
	routes: { bookmarks: string; likes: string; history: string };
	content: { root: string };
	storage: { shadow: string; vote: string };
	/** The live projection: where the server listens and which database to write. */
	spacetime: { url: string; database: string };
};

export const DEFAULT_BOOKMARKS = "https://x.com/i/bookmarks";
export const DEFAULT_HISTORY = "https://x.com/i/history";
export const DEFAULT_CONTENT = "Source/Content";
export const DEFAULT_SHADOW = "Maintain/Storage/Shadow";
export const DEFAULT_VOTE = "Maintain/Storage/Vote";
export const DEFAULT_SPACETIME_URL = "http://127.0.0.1:3010";
export const DEFAULT_SPACETIME_DATABASE = "timeline";

function record(value: unknown): Record<string, unknown> | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function count(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
	if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
	return null;
}

/** One list from a `{slug,name,id}` object, or from a bare id string. */
function one(entry: unknown, source: string, field: string, slug: string | null): List {
	const bare = text(entry);
	if (bare !== null && slug !== null) return { slug, name: slug, id: bare };

	const detail = record(entry);
	if (detail === null) {
		throw fail("schema-invalid", `\`${field}\` must be a list id or a {slug,name,id} object`, {
			path: source,
			field,
		});
	}

	const id = text(detail["id"]);
	if (id === null) {
		throw fail("schema-invalid", `\`${field}.id\` must be a list id`, {
			path: source,
			field: `${field}.id`,
		});
	}

	const declared = slug ?? text(detail["slug"]);
	if (declared === null) {
		throw fail("schema-invalid", `\`${field}.slug\` must be a slug`, {
			path: source,
			field: `${field}.slug`,
		});
	}

	return { slug: declared, name: text(detail["name"]) ?? declared, id };
}

/**
 * Accept both shapes the map has ever had: the array this version writes
 * (`[{slug,name,id}]`) and the older object keyed by slug (`{AI:{id}}`).
 * A slug declared twice keeps its first id - the later duplicate is dropped
 * rather than silently overwriting a list the person already wired up.
 */
function lists(value: unknown, source: string): List[] {
	if (value === undefined || value === null) return [];

	const seen = new Set<string>();
	const collected: List[] = [];
	const push = (list: List): void => {
		if (seen.has(list.slug)) return;
		seen.add(list.slug);
		collected.push(list);
	};

	if (Array.isArray(value)) {
		value.forEach((entry, index) => push(one(entry, source, `lists[${index}]`, null)));
		return collected;
	}

	const map = record(value);
	if (map === null) {
		throw fail("schema-invalid", "`lists` must be an array of {slug,name,id}", {
			path: source,
			field: "lists",
		});
	}
	for (const [slug, entry] of Object.entries(map))
		push(one(entry, source, `lists.${slug}`, slug));
	return collected;
}

/** Hand validation: zod would be a dependency, and this file is the whole contract. */
export function validate(value: unknown, source: string): Configuration {
	const root = record(value);
	if (root === null) {
		throw fail("schema-invalid", "the identifier map must be a JSON object", { path: source });
	}

	const cdpValue = record(root["cdp"]) ?? {};
	const cdp = {
		host: text(cdpValue["host"]) ?? "127.0.0.1",
		port: count(cdpValue["port"]) ?? 9222,
	};

	const routesValue = record(root["routes"]) ?? {};
	const contentValue = record(root["content"]) ?? {};
	const storageValue = record(root["storage"]) ?? {};
	const spacetimeValue = record(root["spacetime"]) ?? {};
	const profile = text(root["profile"]) ?? "";

	return {
		cdp,
		profile,
		lists: lists(root["lists"], source),
		routes: {
			bookmarks: text(routesValue["bookmarks"]) ?? DEFAULT_BOOKMARKS,
			// The likes route is the account's own profile, so it follows `profile`
			// rather than a second key that could drift from it.
			likes:
				text(routesValue["likes"]) ??
				(profile === "" ? "" : `https://x.com/${profile}/likes`),
			history: text(routesValue["history"]) ?? DEFAULT_HISTORY,
		},
		content: { root: text(contentValue["root"]) ?? DEFAULT_CONTENT },
		storage: {
			shadow: text(storageValue["shadow"]) ?? DEFAULT_SHADOW,
			vote: text(storageValue["vote"]) ?? DEFAULT_VOTE,
		},
		spacetime: {
			url: text(spacetimeValue["url"]) ?? DEFAULT_SPACETIME_URL,
			database: text(spacetimeValue["database"]) ?? DEFAULT_SPACETIME_DATABASE,
		},
	};
}

/**
 * The map as it is written to disk.
 *
 * Only keys the map actually declares are emitted, so a written file reads as
 * the person's configuration rather than as a schema dump.
 */
export function document(configuration: Configuration): Record<string, unknown> {
	const routes: Record<string, string> = {
		bookmarks: configuration.routes.bookmarks,
		history: configuration.routes.history,
	};
	if (configuration.routes.likes.length > 0) routes["likes"] = configuration.routes.likes;

	return {
		cdp: { host: configuration.cdp.host, port: configuration.cdp.port },
		profile: configuration.profile,
		lists: configuration.lists.map((list) => ({
			slug: list.slug,
			name: list.name,
			id: list.id,
		})),
		routes,
		content: { root: configuration.content.root },
		storage: {
			shadow: configuration.storage.shadow,
			vote: configuration.storage.vote,
		},
		spacetime: {
			url: configuration.spacetime.url,
			database: configuration.spacetime.database,
		},
	};
}

/** A map with nothing in it: the defaults, no handle, no lists. */
export function empty(): Configuration {
	return validate({}, "the example");
}

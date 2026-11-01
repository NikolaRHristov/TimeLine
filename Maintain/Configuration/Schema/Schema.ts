import { fail } from "../../Cli/Parser/Output/Failure.ts";
import type { ListSlug } from "../../Model/List/List.ts";
import { ListSlug as Slug } from "../../Model/List/List.ts";

export type ListConfiguration = { id: string; name: string };

/**
 * The identifier map: the only file that knows a list id or a handle.
 *
 * `lists` is partial on purpose - a missing slug fails the one command that
 * needs it instead of every command in the CLI.
 */
export type Configuration = {
	cdp: { host: string; port: number };
	profile: string;
	lists: Partial<Record<ListSlug, ListConfiguration>>;
	routes: { bookmarks: string };
	content: { root: string };
};

export const DEFAULT_BOOKMARKS = "https://x.com/i/bookmarks";
export const DEFAULT_CONTENT = "Source/Content";

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

/** Hand validation: zod would be a dependency, and this file is the whole contract. */
export function validate(value: unknown, source: string): Configuration {
	const root = record(value);
	if (root === null) {
		throw fail("schema-invalid", "the identifier map must be a JSON object", { path: source });
	}

	const cdpValue = record(root.cdp) ?? {};
	const cdp = {
		host: text(cdpValue.host) ?? "127.0.0.1",
		port: count(cdpValue.port) ?? 9222,
	};

	const listsValue = record(root.lists);
	if (listsValue === null) {
		throw fail("schema-invalid", "`lists` must map AI, UI and CODE to a list id", {
			path: source,
			field: "lists",
		});
	}

	const lists: Partial<Record<ListSlug, ListConfiguration>> = {};
	for (const slug of Slug.values) {
		const entry = listsValue[slug];
		if (entry === undefined || entry === null) continue;
		const id = text(entry);
		if (id !== null) {
			lists[slug] = { id, name: slug };
			continue;
		}
		const detail = record(entry);
		const nested = detail === null ? null : text(detail.id);
		if (nested === null) {
			throw fail("schema-invalid", `\`lists.${slug}\` must be a list id`, {
				path: source,
				field: `lists.${slug}`,
			});
		}
		lists[slug] = { id: nested, name: text(detail?.name) ?? slug };
	}

	const routesValue = record(root.routes) ?? {};
	const contentValue = record(root.content) ?? {};

	return {
		cdp,
		profile: text(root.profile) ?? "",
		lists,
		routes: { bookmarks: text(routesValue.bookmarks) ?? DEFAULT_BOOKMARKS },
		content: { root: text(contentValue.root) ?? DEFAULT_CONTENT },
	};
}

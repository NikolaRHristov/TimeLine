import { option } from "../../../CLI/Parser/Argument/Option.ts";
import { fail } from "../../../CLI/Parser/Output/Failure.ts";
import type { CommandDefinition } from "../../../CLI/Parser/Parser.ts";
import { load, requireList } from "../../../Configuration/Load/Load.ts";
import { Post } from "../../../Model/Post/Post.ts";
import { document, type VoteEntry } from "../../../Model/Vote/Vote.ts";
import { stringify } from "../../../Output/Json/Json.ts";
import { contentDirectory, shadowDirectory } from "../../../Store/Path/Path.ts";
import { open as openShadow } from "../../../Store/Shadow/Shadow.ts";
import { open as openVote } from "../../../Store/Vote/Vote.ts";

/**
 * A URL becomes a filename, so it needs a name a filename can carry.
 *
 * An X permalink already has one: its status id. Anything else is slugged from
 * the address, which keeps `--url` honest for a post this pipeline has never
 * scraped - and keeps the result inside `[A-Za-z0-9_-]`, so no URL can turn
 * into a path.
 */
function name(href: string): string {
	const status = Post.idFromHref(href);
	if (status !== null) return status;

	const slug = href
		.replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\//, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64);

	if (slug === "") {
		throw fail("usage", "--url is not an address that can name an entry", {
			url: href,
		});
	}
	return slug;
}

/** Union, preserving the order the first list established. */
function merge(left: readonly string[], right: readonly string[]): string[] {
	const seen = new Set<string>();
	const both: string[] = [];
	for (const value of [...left, ...right]) {
		if (seen.has(value)) continue;
		seen.add(value);
		both.push(value);
	}
	return both;
}

/**
 * Put a post in the Voted index as a candidate.
 *
 * This is the only way an entry enters the queue, and it publishes nothing: a
 * candidate is visible on `/Voted/` and nowhere else until the owner approves
 * it. A shadow post brings its author, URL and lists along; an external URL is
 * taken at face value.
 *
 * Idempotent twice over. Nominating what is already a candidate merges any new
 * list or note and reports `unchanged` when the file would not change. A
 * tombstone is refused outright: "no" is a state, and a second nomination is
 * not a new argument.
 */
export const Definition: CommandDefinition = {
	path: ["vote", "nominate"],
	summary: "Add a post or URL to the Voted index as a candidate.",
	options: [
		option("id", "string", "Status id of a post in the shadow store."),
		option("url", "string", "Permalink to nominate, scraped or not.", {
			format: "uri",
		}),
		option("list", "string", "File the entry under this configured list.", {
			repeat: true,
		}),
		option("title", "string", "Short label for the entry."),
		option("note", "string", "Why it was nominated."),
	],
	alternatives: [["id"], ["url"]],
	async run(values): Promise<unknown> {
		const id = typeof values["id"] === "string" ? values["id"] : null;
		const href = typeof values["url"] === "string" ? values["url"] : null;
		if ((id === null) === (href === null)) {
			throw fail("usage", "say what to nominate: --id or --url, not both", {
				options: ["--id", "--url"],
			});
		}

		const requested = Array.isArray(values["list"]) ? (values["list"] as string[]) : [];
		// The identifier map is only needed to resolve a list slug; a nomination
		// with no `--list` must work before `config init` has ever run.
		const lists: string[] = [];
		if (requested.length > 0) {
			const configuration = load();
			for (const slug of requested) lists.push(requireList(configuration, slug).slug);
		}

		const shadow = id === null ? null : openShadow(shadowDirectory()).post(id);
		if (id !== null && shadow === null) {
			throw fail("no-post", "that id is not in the shadow store", {
				id,
				next: `maintain vote nominate --url https://x.com/i/status/${id}`,
			});
		}

		const entryId = id ?? name(href!);
		const url = shadow?.url ?? href!;
		const store = openVote(contentDirectory());
		const at = new Date().toISOString();

		const existing = store.voted(entryId);
		if (existing !== null && existing.status === "rejected") {
			throw fail("tombstone", "that entry was rejected; a tombstone is never resurrected", {
				id: entryId,
				status: existing.status,
				next: "nominate a different entry - the decision is on file in Source/Content/Voted",
			});
		}

		const title = typeof values["title"] === "string" ? values["title"] : existing?.title;
		const note = typeof values["note"] === "string" ? values["note"] : existing?.note;

		const next: VoteEntry = {
			id: entryId,
			url,
			...(title === undefined ? {} : { title }),
			...(note === undefined ? {} : { note }),
			author: shadow?.author ?? existing?.author ?? { handle: "", name: "", verified: false },
			lists: merge(existing?.lists ?? shadow?.lists ?? [], lists),
			votes: existing?.votes ?? 0,
			votedAt: existing?.votedAt ?? at,
			nominatedAt: existing?.nominatedAt ?? at,
			status: existing?.status ?? "candidate",
		};

		const unchanged =
			existing !== null && stringify(document(existing)) === stringify(document(next));

		if (unchanged !== true) {
			store.writeVoted(next);
			// The event records the decision, not the votes: a nomination that
			// later collects a thousand votes still happened once.
			if (existing === null) {
				store.event("vote.nominated", entryId, { url, lists: next.lists }, at);
			}
		}

		return {
			nominated: existing === null,
			id: entryId,
			status: next.status,
			lists: next.lists,
			unchanged,
		};
	},
};

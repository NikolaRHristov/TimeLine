import { fail } from "../../CLI/Parser/Output/Failure.ts";
import type { Post } from "../../Model/Post/Post.ts";
import type { ShadowPost } from "../../Store/Model/Model.ts";
import { shadowDirectory } from "../../Store/Path/Path.ts";
import { open as openShadow } from "../../Store/Shadow/Shadow.ts";
import type { Transport } from "../Transport.ts";

/**
 * The seven fields a `Post` has.
 *
 * The archive keeps four more - `observations`, `firstSeenAt`, `lastScrapedAt`,
 * `visibility`, `lists` - and none of them belong in a reading: they describe
 * this archive, not the post. Dropping them here is what makes the two
 * transports print the same object.
 */
function reading(record: ShadowPost): Post {
	return {
		id: record.id,
		url: record.url,
		author: record.author,
		text: record.text,
		postedAt: record.postedAt,
		media: record.media,
		metrics: record.metrics,
	};
}

/** No socket, no tab, no page: the command asked the archive for something it does not have. */
function unsupported(operation: string): never {
	throw fail("unsupported-transport", `the view transport cannot ${operation}`, {
		transport: "view",
		operation,
	});
}

/**
 * Defence in depth, never the first line.
 *
 * `Select.ts` refuses a mutating command before its body runs, so a call here
 * means a command reached past its own declaration. The refusal is still
 * shaped like the one the caller would have seen, so the mistake surfaces as
 * the same JSON instead of as a `TypeError`.
 */
function refuseWrite(operation: string): never {
	throw fail("read-only-transport", `the view transport cannot ${operation}`, {
		transport: "view",
		operation,
	});
}

/**
 * The archive transport.
 *
 * It answers `post` and nothing else: no socket is opened, no file is written,
 * and every other member is a named refusal rather than a silent no-op. The
 * store is opened per call, so a long-lived process sees what is on disk now
 * instead of a snapshot from when it started.
 */
export function view(): Transport {
	const store = () => openShadow(shadowDirectory());

	return {
		name: "view",
		source: "shadow",
		mutable: false,
		supports: (requirement) => requirement === "read",

		tabs: () => unsupported("list tabs"),
		focus: () => unsupported("focus a tab"),
		navigate: () => unsupported("navigate"),
		evaluate: () => unsupported("evaluate"),
		page: () => unsupported("open a page"),
		scrape: () => unsupported("scrape"),

		async post(target) {
			if (!("id" in target)) {
				throw fail(
					"unsupported-transport",
					"the view transport addresses a post by --id only",
					{ transport: "view", target: Object.keys(target) },
				);
			}
			const record = store().post(target.id);
			if (record === null) {
				throw fail("no-post", "no archived post with that id", {
					id: target.id,
				});
			}
			return reading(record);
		},

		setLike: () => refuseWrite("set a like"),
		setBookmark: () => refuseWrite("set a bookmark"),
		listMember: () => refuseWrite("change a list"),
	};
}

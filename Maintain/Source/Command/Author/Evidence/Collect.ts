import { relative } from "node:path";
import { loadVocabulary } from "../../../Configuration/Keyword/Load.ts";
import { root } from "../../../Configuration/Load/Load.ts";
import { build, type Evidence } from "../../../Model/Author/Evidence.ts";
import type { ShadowPost } from "../../../Store/Model/Model.ts";
import { shadowDirectory } from "../../../Store/Path/Path.ts";
import { open as openShadow } from "../../../Store/Shadow/Shadow.ts";

/** Posts left out of the records, counted rather than dropped silently. */
export type Skipped = {
	hidden: number;
	unbookmarked: number;
	anonymous: number;
};

/** One author per record, plus what the archive held that no record could use. */
export type EvidenceCollection = {
	/** Repository-relative: the repository is public. */
	archive: string;
	posts: number;
	authors: Evidence[];
	skipped: Skipped;
};

/** Order by UTF-16 code unit: `localeCompare` depends on the machine's locale. */
function compare(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Fold the shadow archive into one evidence record per bookmarked author.
 *
 * This is the whole input the rules classifier and the model pass ever see, so
 * the record is built from the words and the links of the archive alone:
 * counts, not text walls, and at most three excerpts capped at 200 characters.
 * Nothing here opens a socket, so an unchanged archive always yields the same
 * records - which is what makes a re-run free.
 *
 * Three kinds of post are left out, and each is counted rather than dropped
 * silently:
 *
 * - `hidden` - a tombstone the person set. Its text is withheld from the site,
 *   so it must not travel to a model either.
 * - posts no bookmark observed - a like or a history hit is not a bookmark.
 * - posts with no handle - a record is keyed by handle, so there is nothing to
 *   key them by.
 *
 * The record's `name` and `verified` come from the lowest status id in the
 * group, so an account that renamed itself mid-archive still yields one record
 * and the same one on every run.
 */
export function collect(): EvidenceCollection {
	const store = openShadow(shadowDirectory());
	const posts = store.all();
	const vocabulary = loadVocabulary();

	const groups = new Map<string, ShadowPost[]>();
	const skipped: Skipped = { hidden: 0, unbookmarked: 0, anonymous: 0 };

	for (const post of posts) {
		if (post.visibility === "hidden") {
			skipped.hidden += 1;
			continue;
		}
		if (!post.observations.some((entry) => entry.source === "bookmark")) {
			skipped.unbookmarked += 1;
			continue;
		}
		const handle = post.author.handle;
		if (handle === "") {
			skipped.anonymous += 1;
			continue;
		}
		const group = groups.get(handle);
		if (group === undefined) groups.set(handle, [post]);
		else group.push(post);
	}

	const authors: Evidence[] = [];
	for (const handle of [...groups.keys()].sort(compare)) {
		const group = groups.get(handle) ?? [];
		group.sort((left, right) => compare(left.id, right.id));
		const first = group[0];
		if (first === undefined) continue;
		authors.push(build(handle, first.author, group, vocabulary));
	}

	return {
		// Repository-relative: this repo is public, and an absolute path
		// would publish the machine's layout and the account name.
		archive: relative(root(), store.directory),
		posts: posts.length,
		authors,
		skipped,
	};
}

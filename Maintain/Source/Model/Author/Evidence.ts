import type { Media } from "../Post/Post.ts";
import type { Author } from "./Author.ts";

/**
 * One vocabulary per bucket.
 *
 * A bucket is a list slug: the keys are whatever the loaded vocabulary
 * declares, never a union in this file. Key order is the order a record prints
 * its counts in, so the JSON shape follows the vocabulary and not a ranking.
 * With no vocabulary loaded there are no buckets, and every count is empty -
 * which is the honest answer, not a failure.
 */
export type Vocabulary = Record<string, readonly string[]>;

/** How many times each bucket's vocabulary fired, per bucket. */
export type KeywordHits = Record<string, number>;

/**
 * How many times each vocabulary term occurs, per bucket - sparse, because a
 * term that never fired is absent rather than zero.
 *
 * Keys are the vocabulary entries as written (lowercased and trimmed), which
 * is what `Configuration/Rules/Rules.json` weights name. This is the layer
 * that turns "counted" into "weighted": the counts decide nothing here.
 */
export type TermHits = Record<string, Record<string, number>>;

/** A domain the author's posts linked to, and how many posts linked it. */
export type DomainHit = { domain: string; count: number };

/**
 * What one archived post contributes to its author's record.
 *
 * Deliberately narrower than `ShadowPost`: evidence is built from the words and
 * the links only, so a record cannot start depending on metrics or on
 * timestamps that a re-scrape moves - two runs on one archive must print the
 * same bytes.
 */
export type EvidencePost = {
	id: string;
	text: string;
	media: readonly Media[];
};

/**
 * One compact record per author: everything a classifier needs, and nothing a
 * prompt would choke on. Every field is JSON-serialisable as it stands.
 */
export type Evidence = {
	handle: string;
	name: string;
	verified: boolean;
	/** How many bookmarked posts the record was built from. */
	posts: number;
	domains: DomainHit[];
	keywords: KeywordHits;
	/** The per-term counts behind `keywords`; a classifier weights these. */
	terms: TermHits;
	/** Up to `EXCERPT_COUNT` excerpts, each at most `EXCERPT_LIMIT` characters. */
	excerpts: string[];
};

/** Hard cap on one excerpt, in UTF-16 code units - what `String.length` reports. */
export const EXCERPT_LIMIT = 200;

/** How many excerpts a record carries when the author has that many posts. */
export const EXCERPT_COUNT = 3;

/** How many domains a record ranks; a longer list is noise, not evidence. */
export const DOMAIN_LIMIT = 5;

/**
 * A URL as a post's text can carry one. The page truncates long links with
 * `…`, so a match may end mid-path - which is why only the host is ever read.
 */
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

/** Punctuation a sentence puts after a link; no hostname contains it. */
const URL_TRAILING = /[.,;:!?)\]}'"]+$/;

/**
 * Redirectors. A shortener hides where a link goes, so counting `t.co` would
 * rank every post that carries one equally and say nothing about the author.
 */
const SHORTENER = new Set([
	"t.co",
	"bit.ly",
	"buff.ly",
	"ow.ly",
	"tinyurl.com",
	"is.gd",
	"v.gd",
	"cutt.ly",
	"rebrand.ly",
	"goo.gl",
	"lnkd.in",
	"dlvr.it",
	"ift.tt",
	"amzn.to",
]);

/** Order by UTF-16 code unit: `localeCompare` depends on the machine's locale. */
function compare(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

/** One line, no runs of whitespace: an excerpt is a fragment, not a layout. */
function flatten(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/**
 * Cut a flattened post to the cap without splitting a surrogate pair, and mark
 * the cut.
 *
 * The marker spends one of the 200 characters rather than being appended to
 * them: a caller that checks `excerpt.length <= EXCERPT_LIMIT` has to be right.
 */
function truncate(flat: string): string {
	if (flat.length <= EXCERPT_LIMIT) return flat;
	let cut = flat.slice(0, EXCERPT_LIMIT - 1);
	const last = cut.charCodeAt(cut.length - 1);
	if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
	return `${cut}…`;
}

/** Every URL a post shows: the ones in its text, plus its own link cards. */
function links(post: EvidencePost): string[] {
	const found: string[] = [...(post.text.match(URL_PATTERN) ?? [])];
	for (const media of post.media) {
		if (media.kind === "link" && media.url !== "") found.push(media.url);
	}
	return found;
}

/**
 * The host a link points at, lowercased and without `www.`.
 *
 * Null when the string is not a web link at all, or when it is a redirector
 * that carries no evidence about the destination.
 */
function domain(url: string): string | null {
	let parsed: URL;
	try {
		parsed = new URL(url.replace(URL_TRAILING, ""));
	} catch {
		return null;
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
	const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
	if (host === "" || SHORTENER.has(host)) return null;
	return host;
}

/**
 * The domains the author's posts linked to, most-linked first.
 *
 * One post counts once per domain: a single post linking one site five times
 * is one post about that site, not five.
 */
export function domains(posts: readonly EvidencePost[]): DomainHit[] {
	const counts = new Map<string, number>();

	for (const post of posts) {
		const seen = new Set<string>();
		for (const url of links(post)) {
			const host = domain(url);
			if (host === null || seen.has(host)) continue;
			seen.add(host);
			counts.set(host, (counts.get(host) ?? 0) + 1);
		}
	}

	return [...counts.entries()]
		.map(([name, count]) => ({ domain: name, count }))
		.sort((left, right) => right.count - left.count || compare(left.domain, right.domain))
		.slice(0, DOMAIN_LIMIT);
}

/**
 * How many times one keyword occurs in the text, on word boundaries.
 *
 * Boundaries are what keeps `ai` out of `said` and `ml` out of `html`. The
 * haystack is lowercased first, so the boundary classes only need `a-z0-9`.
 */
function occurrences(haystack: string, keyword: string): number {
	const needle = keyword.toLowerCase().trim();
	if (needle === "") return 0;
	const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "g");
	let count = 0;
	while (pattern.exec(haystack) !== null) count += 1;
	return count;
}

/**
 * How many times each vocabulary term occurs, per bucket.
 *
 * The keys are the terms the classifier weights, so this is the one place a
 * count becomes addressable. Still no weights and no decision: `keywords` is
 * the same counting summed per bucket, derived from here so the two can never
 * disagree.
 */
export function terms(posts: readonly EvidencePost[], vocabulary: Vocabulary): TermHits {
	const haystack = posts.map((post) => post.text.toLowerCase()).join("\n");
	const hits: TermHits = {};

	for (const bucket of Object.keys(vocabulary)) {
		const counted: Record<string, number> = {};
		for (const keyword of vocabulary[bucket] ?? []) {
			const count = occurrences(haystack, keyword);
			if (count > 0) counted[keyword.toLowerCase().trim()] = count;
		}
		hits[bucket] = counted;
	}

	return hits;
}

/** The per-bucket totals of a term map. */
export function totals(counted: TermHits): KeywordHits {
	const hits: KeywordHits = {};
	for (const bucket of Object.keys(counted)) {
		let sum = 0;
		for (const count of Object.values(counted[bucket] ?? {})) sum += count;
		hits[bucket] = sum;
	}
	return hits;
}

/**
 * Keyword hits per bucket, counted over the author's posts.
 *
 * Counting is all this does: no weights, no thresholds, no decision. Turning
 * hits into a list is `author classify`'s job.
 */
export function keywords(posts: readonly EvidencePost[], vocabulary: Vocabulary): KeywordHits {
	return totals(terms(posts, vocabulary));
}

/** Prose rather than only a link: a post that says nothing classifies nothing. */
function isProse(flat: string): boolean {
	return /[a-z]{2,}/i.test(flat.replace(URL_PATTERN, " "));
}

/**
 * Up to three excerpts, shortest prose first.
 *
 * Shortest, because the cap makes length the scarce resource and a one-line
 * post spends none of it on framing. Ties break on the status id, so the
 * choice is the same on every run. Duplicate text is dropped: a repost says
 * what the original said and would spend a slot repeating it.
 */
export function excerpts(posts: readonly EvidencePost[]): string[] {
	const seen = new Set<string>();
	const candidates: { id: string; flat: string; prose: boolean }[] = [];

	for (const post of posts) {
		const flat = flatten(post.text);
		if (flat === "" || seen.has(flat)) continue;
		seen.add(flat);
		candidates.push({ id: post.id, flat, prose: isProse(flat) });
	}

	candidates.sort(
		(left, right) =>
			Number(right.prose) - Number(left.prose) ||
			left.flat.length - right.flat.length ||
			compare(left.id, right.id),
	);

	return candidates.slice(0, EXCERPT_COUNT).map((candidate) => truncate(candidate.flat));
}

/**
 * Fold one author's bookmarked posts into one record.
 *
 * `author` is the identity as the archive last showed it; the caller decides
 * which post's reading wins when a rename left two behind.
 */
export function build(
	handle: string,
	author: Author,
	posts: readonly EvidencePost[],
	vocabulary: Vocabulary,
): Evidence {
	const counted = terms(posts, vocabulary);

	return {
		handle,
		name: author.name,
		verified: author.verified,
		posts: posts.length,
		domains: domains(posts),
		keywords: totals(counted),
		terms: counted,
		excerpts: excerpts(posts),
	};
}

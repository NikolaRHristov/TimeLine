/**
 * The route map: the one source of truth for every public URL this site serves.
 *
 * Two facts live here and nowhere else.
 *
 * - `CanonicalPath` is the set of public URLs. Every member is PascalCase,
 *   because a public URL is a proper noun: `/Bookmark`, `/List`, `/Activity`.
 * - `SemanticAlias` is the set of lowercase or human-guessable spellings that
 *   must still work. An alias is a redirect, never a second page - the same
 *   content reachable at two URLs is two documents to a search engine and two
 *   cache entries to a service worker.
 *
 * Everything else is derived. `Alias` merges the hand-curated synonyms with the
 * lowercase form of every canonical path, and `Verify` refuses a map whose
 * aliases chain (`/a` -> `/b` -> `/Bookmark`), because a chain is a 301 the
 * browser makes the visitor pay for twice and a loop waiting to happen.
 *
 * This module is imported by pages, by the dev-server middleware in
 * `astro.config.ts`, and by `Maintain/Script/GenerateRedirects.ts` under bare
 * Node. It therefore has no imports and no top-level side effects: bare Node
 * strips the types and evaluates it exactly as written, and Vite bundles the
 * same text into the page build.
 */

// ─── Canonical paths ────────────────────────────────────────────────────────

/**
 * The public routes. PascalCase, one segment per noun, and `/` for the front
 * page - which is the Curated index and has no other name.
 *
 * A path is here only when a page file builds it: `/Bookmark` is
 * `Source/pages/Bookmark/index.astro`, `/List` is
 * `Source/pages/List/index.astro`. Adding a member without adding the page
 * makes `Verify` pass and the build fail, which is the right order - the map
 * states intent, the build proves it.
 */
export const CanonicalPath: ReadonlySet<string> = new Set([
	"/",
	"/Activity",
	"/Bookmark",
	"/List",
	"/Voted",
	"/Workspace",
	"/Showcase",
]);

/**
 * The canonical routes whose last segment is a content id rather than a fixed
 * word: `/Bookmark/example-post`, `/List/reading`. They cannot live in
 * `CanonicalPath` because the set holds exact strings, so they are listed here
 * for the documentation and for the prefix rules the generator emits.
 */
export const CanonicalPattern: readonly string[] = ["/Bookmark/:id", "/List/:slug"];

// ─── Semantic aliases ───────────────────────────────────────────────────────

/**
 * Hand-curated synonyms: the words a visitor types or an old link carries.
 *
 * Every target is a member of `CanonicalPath`. An alias may not point at
 * another alias - `Verify` enforces that, and the reason is mechanical: the
 * host resolves a chain by issuing one 301 per hop, so a two-hop chain doubles
 * the latency of the first visit and a mistaken cycle makes the page
 * unreachable.
 */
export const SemanticAlias: Readonly<Record<string, string>> = {
	// The front page is the Curated index.
	"/curated": "/",
	"/home": "/",
	"/index": "/",
	"/start": "/",
	"/welcome": "/",

	// Bookmark
	"/bookmark": "/Bookmark",
	"/bookmarks": "/Bookmark",
	"/saved": "/Bookmark",
	"/saved-posts": "/Bookmark",

	// List
	"/list": "/List",
	"/lists": "/List",

	// Activity
	"/activity": "/Activity",
	"/activities": "/Activity",
	"/event": "/Activity",
	"/events": "/Activity",

	// Voted
	"/vote": "/Voted",
	"/votes": "/Voted",
	"/voted": "/Voted",
	"/candidates": "/Voted",
};

// ─── Derived lookups ────────────────────────────────────────────────────────

/** Compare two paths by code unit, so the output never depends on a locale. */
const Order = (Left: string, Right: string): number => (Left < Right ? -1 : Left > Right ? 1 : 0);

/**
 * The lowercase form of every canonical path that has an uppercase letter.
 *
 * Derived rather than listed: a canonical added to `CanonicalPath` gets its
 * lowercase redirect for free, so the two can never disagree. `/` is skipped -
 * it is already lowercase, and it is already canonical.
 */
const Lowercase = (): Record<string, string> => {
	const Map: Record<string, string> = {};

	for (const Path of CanonicalPath) {
		const Lower = Path.toLowerCase();

		if (Lower !== Path) {
			Map[Lower] = Path;
		}
	}

	return Map;
};

/**
 * Every alias the site honours: the derived lowercase forms first, then the
 * hand-curated synonyms. A curated entry wins a collision, because a synonym
 * someone wrote down deliberately outranks a mechanical case fold.
 */
export const Alias: Readonly<Record<string, string>> = (() => {
	const Merged: Record<string, string> = { ...Lowercase(), ...SemanticAlias };

	return Merged;
})();

/**
 * The first segment of every canonical path that is not all lowercase, keyed by
 * its lowercase form. `/bookmark/example-post` is the lowercase spelling of a
 * canonical shape rather than of a canonical string, so it is resolved by
 * segment rather than by table lookup.
 */
const Prefix: ReadonlyMap<string, string> = (() => {
	const Map = new globalThis.Map<string, string>();

	for (const Path of CanonicalPath) {
		const First = Path.split("/")[1];

		if (First !== undefined && First.toLowerCase() !== First) {
			Map.set(First.toLowerCase(), First);
		}
	}

	return Map;
})();

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Strip the query, the fragment and any trailing slashes from a request path. */
export const Clean = (Path: string): string => {
	const Bare = Path.split("?")[0]?.split("#")[0] ?? "/";
	const Trimmed = Bare.replace(/\/+$/, "");

	return Trimmed === "" ? "/" : Trimmed;
};

/**
 * Build a canonical URL from its segments: `Canonical("Bookmark")` is
 * `/Bookmark`, `Canonical("Bookmark", Id)` is `/Bookmark/<Id>`.
 *
 * A page imports this instead of writing the string, so a link and the
 * redirect that guards it cannot drift apart. Each segment is percent-encoded:
 * an id comes from a scraped post and is not trusted to be URL-safe.
 */
export const Canonical = (...Segment: readonly string[]): string => {
	if (Segment.length === 0) {
		return "/";
	}

	return `/${Segment.map((Part) => encodeURIComponent(Part)).join("/")}`;
};

/**
 * Resolve a request path to the canonical path it should redirect to, or
 * `null` when the path is already canonical.
 *
 * Two lookups, in order: the exact alias table, then the first segment against
 * `Prefix` with the remainder carried through unchanged - which is what makes
 * `/bookmark/example-post` land on `/Bookmark/example-post` without listing
 * every id.
 */
export const Resolve = (Path: string): string | null => {
	const Cleaned = Clean(Path);

	if (CanonicalPath.has(Cleaned)) {
		return null;
	}

	const Exact = Alias[Cleaned];

	if (Exact !== undefined) {
		return Exact;
	}

	const [First, ...Rest] = Cleaned.split("/").slice(1);

	if (First === undefined || Rest.length === 0) {
		return null;
	}

	const Head = Prefix.get(First);

	if (Head === undefined) {
		return null;
	}

	return `/${[Head, ...Rest].join("/")}`;
};

/**
 * Every alias source, sorted, as `[Source, Target]` pairs.
 *
 * The generator and the dev-server middleware both read this, so the file a
 * host is given and the redirect a developer sees are produced by the same
 * code path.
 */
export const Pair = (): readonly (readonly [string, string])[] =>
	Object.keys(Alias)
		.sort(Order)
		.map((Source) => [Source, Alias[Source] ?? "/"] as const);

/**
 * The prefix rules, sorted: a lowercase first segment followed by anything
 * redirects to its canonical spelling with the rest of the path preserved.
 *
 * The target carries the host's `:splat` placeholder rather than a concrete
 * path, so one rule covers every id.
 */
export const PrefixPair = (): readonly (readonly [string, string])[] =>
	[...Prefix.keys()]
		.sort(Order)
		.map((Lower) => [`/${Lower}/*`, `/${Prefix.get(Lower) ?? ""}/:splat`] as const);

// ─── Invariants ─────────────────────────────────────────────────────────────

/**
 * Refuse a map that would emit a broken redirect.
 *
 * Called at module evaluation, so a bad map fails the build and the generator
 * rather than shipping. The checks are the three ways a hand-edited alias
 * table goes wrong, each with the symptom it produces:
 *
 * 1. A target that is not canonical - the redirect lands on a 404.
 * 2. A source that is canonical - the redirect shadows the page it points at,
 *    which is a loop.
 * 3. A target that is itself an alias source - a chain, paid for by the
 *    visitor on every first visit.
 *
 * The merged table is checked as well as the hand-written one, because the
 * lowercase forms are derived: a canonical path whose lowercase spelling is
 * also a curated alias is a collision the derivation cannot see.
 */
export const Verify = (): void => {
	for (const [Source, Target] of Object.entries(SemanticAlias)) {
		if (CanonicalPath.has(Source)) {
			throw new Error(
				`Route map: alias ${Source} is also a canonical path - it would redirect to itself.`,
			);
		}

		if (!CanonicalPath.has(Target)) {
			throw new Error(
				`Route map: alias ${Source} points at ${Target}, which is not a canonical path.`,
			);
		}
	}

	for (const [Source, Target] of Object.entries(Alias)) {
		if (CanonicalPath.has(Source)) {
			throw new Error(`Route map: alias ${Source} shadows a canonical path.`);
		}

		if (Alias[Target] !== undefined) {
			throw new Error(
				`Route map: alias ${Source} points at ${Target}, which is itself an alias - aliases point at canonicals, never at other aliases.`,
			);
		}
	}
};

Verify();

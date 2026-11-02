/**
 * The link registry: every internal URL the shell and the pages print.
 *
 * Nothing here writes a path by hand. `Route` is derived from `CanonicalPath`,
 * so renaming a route is one edit in `@Function/Route/Map.ts` and every link,
 * every redirect and the dev server follow. A page that spells `/Bookmark`
 * itself is the bug this module exists to prevent: the string and the redirect
 * table would drift the first time the route moved.
 *
 * The id-bearing routes are functions rather than table entries, because the id
 * belongs to the content and the shape belongs to the map.
 */
// The route map is imported by relative path rather than through `@Function/`:
// the alias table is declared in `@playform/build/tsconfig`, whose `paths` are
// resolved against that package rather than against this repository, so a plain
// `tsc -p tsconfig.json` cannot see any `@*` specifier. The relative path is
// what the bundler, the Astro config loader and bare Node all agree on.
import { Canonical, Clean } from "../Function/Route/Map.ts";
import { Content } from "./Content.ts";

export { Canonical };

/** The static canonical routes, named for what they show. */
export const Route = {
	Home: Canonical(),
	Bookmark: Canonical("Bookmark"),
	List: Canonical("List"),
	Activity: Canonical("Activity"),
	Voted: Canonical("Voted"),
	Workspace: Canonical("Workspace"),
} as const;

/** One published post. */
export const BookmarkHref = (Id: string): string => Canonical("Bookmark", Id);

/**
 * One list, by the slug the posts carry.
 *
 * The page exists when the slug does, which means a slug that no published post
 * carries has no page - the set of lists is read out of the content, not out of
 * the local configuration, because the site build never imports the tool layer.
 */
export const ListHref = (Slug: string): string => Canonical("List", Slug);

/**
 * The header carries what a returning reader needs; the footer carries the
 * whole site. The two lists are not mirrors - repeating the full sitemap in the
 * header would push the brand and the repository link off a narrow screen.
 */
export const Primary = [
	{ Href: Route.Bookmark, Label: Content.Route.Bookmarks },
	{ Href: Route.List, Label: Content.Route.Lists },
	{ Href: Route.Voted, Label: Content.Route.Voted },
	{ Href: Route.Activity, Label: Content.Route.Activity },
] as const;

export const Sitemap = [
	{ Href: Route.Home, Label: Content.Route.Curated },
	{ Href: Route.Bookmark, Label: Content.Route.Bookmarks },
	{ Href: Route.List, Label: Content.Route.Lists },
	{ Href: Route.Voted, Label: Content.Route.Voted },
	{ Href: Route.Activity, Label: Content.Route.Activity },
] as const;

/**
 * Whether a nav entry is the page being viewed.
 *
 * Compared after `Clean`, so `/Bookmark/` (what Astro emits) and `/Bookmark`
 * (what the map says) are the same page. The home route is compared exactly:
 * every path starts with `/`, so a prefix test would mark Home current
 * everywhere.
 */
export const IsCurrent = (Path: string, Href: string): boolean => {
	const Here = Clean(Path);
	const There = Clean(Href);

	return There === "/" ? Here === "/" : Here === There || Here.startsWith(`${There}/`);
};

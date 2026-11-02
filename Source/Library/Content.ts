/**
 * The site's own words, and the one origin it answers on.
 *
 * Kept apart from the page content on purpose: a title is a decision, a post is
 * data. Nothing here states a count or a handle - those are read from the
 * content collections at build time, so a fresh clone and a full archive
 * describe themselves correctly with no edit to this file.
 *
 * `Site` and `Repository` are read from the environment rather than written
 * here, because this repository is account-agnostic: the same tree is cloned
 * and deployed by different people, and a hardcoded origin would make every
 * canonical link and every sitemap entry point at someone else's domain. The
 * fallbacks are reserved example values, so a build without a `.env` still
 * produces valid absolute URLs instead of `undefined`.
 */

/** The reserved example origin used when `SITE_URL` is unset. */
export const Fallback = "https://timeline.example";

/** The canonical origin. `SITE_URL` wins; the reserved example domain is the fallback. */
export const Site = process.env["SITE_URL"] ?? Fallback;

/**
 * The repository a reader can find the source in, when the deployment sets one.
 *
 * Empty by default. The shell renders the link only when it is non-empty, so an
 * unconfigured clone shows no dead "Source" link - a broken link is worse than
 * a missing one.
 */
export const Repository = process.env["REPOSITORY_URL"] ?? "";

export const Content = {
	Title: "TimeLine",
	Short: "TimeLine",
	Description: "A bookmark showcase you own.",
	/** The lede on the front page: what the archive is, in one sentence. */
	Lede: "Saved posts, kept by hand and published on purpose - grouped by the lists you filed them into and the accounts that wrote them.",
	Licence: "MIT",
};

export default Content;

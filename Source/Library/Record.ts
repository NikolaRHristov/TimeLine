/**
 * @module Record
 *
 * The archive's records, read once for the two routes that show a single one.
 *
 * `Source/pages` holds two kinds of page, and the difference is what each may
 * read. A showcase page reads nothing at all (RFC-0053 rule 1): it is copy and
 * composition, `ready` by construction. A data surface reads the archive - and
 * the workspace is the surface built to hold it (RFC-0054), which is why it is
 * the only page that reaches for a collection directly.
 *
 * The two record routes are the exception that keeps its read here rather than
 * in the page: `/Bookmark/<id>` and `/List/<slug>` exist to show one record, and
 * they ask this module for it. That is what makes `grep getCollection
 * Source/pages` answer the question it is asked - the page files name no
 * collection, so a page that started reading the archive would be visible as a
 * new import of this module rather than as one more line among the reads.
 *
 * Nothing here caches, filters or reshapes: each function is the collection it
 * names, so a caller gets the archive and not this module's opinion of it.
 */
import { getCollection } from "astro:content";

/** Every published bookmark, as the build sees it. */
export const Bookmarks = () => getCollection("Bookmark");

/** The owner's picks, with the rank and the vote count frozen at approval. */
export const Curated = () => getCollection("Curated");

/** The pipeline's own log, one file per motion. */
export const Events = () => getCollection("Event");

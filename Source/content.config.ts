import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * The site's content is written by the pipeline, not by hand.
 *
 * Every collection is a `glob` over JSON under `Source/Content/` - the content
 * config sits next to `srcDir` (`./Source`), but `base` resolves against the
 * project root, which is why the paths start with `./Source`. Nothing is
 * fetched at build time: the files are the source of truth, and the shadow
 * store that produced them is never read by Astro.
 */

const Timestamp = z.iso.datetime({ offset: true });

const Author = z.object({
	handle: z.string(),
	name: z.string(),
	verified: z.boolean(),
});

const Media = z.object({
	kind: z.enum(["image", "video", "gif", "link"]),
	url: z.string(),
});

const Metrics = z
	.object({
		replies: z.number(),
		reposts: z.number(),
		likes: z.number(),
		views: z.number(),
	})
	.partial();

/**
 * A list slug is configuration, not code.
 *
 * The identifier map declares the slugs (`Maintain/Configuration/Example/
 * Configuration.example.json` is the template), so `lists` accepts any string.
 * Enumerating them here would couple the site to one person's lists.
 */

const Bookmark = defineCollection({
	loader: glob({ pattern: "**/*.json", base: "./Source/Content/Bookmark" }),
	schema: z.object({
		/** The status id; also the filename, which is how the route is built. */
		id: z.string(),
		url: z.url(),
		author: Author,
		text: z.string(),
		postedAt: Timestamp.nullable(),
		media: z.array(Media),
		metrics: Metrics,
		/** Filled by the distribution stage; empty until an author is filed. */
		lists: z.array(z.string()),
		scrapedAt: Timestamp,
		/**
		 * The first scrape that observed this post. The interface never exposes
		 * when it was saved, so this is a lower bound and must be described as
		 * one - `bookmarkedAt` is not a fact this pipeline can know.
		 */
		firstSeenAt: Timestamp,
		source: z.literal("x"),
		publishedAt: Timestamp.optional(),
	}),
});

const Event = defineCollection({
	loader: glob({ pattern: "**/*.json", base: "./Source/Content/Event" }),
	schema: z.object({
		at: Timestamp,
		kind: z.enum([
			"scrape.started",
			"scrape.finished",
			"bookmark.added",
			"bookmark.removed",
			"list.assigned",
			"list.removed",
			"bookmark.published",
			"bookmark.hidden",
			// The vote index. `vote.cast` carries the total, never who cast it.
			"vote.nominated",
			"vote.cast",
			"vote.approved",
			"vote.rejected",
			"vote.ranked",
		]),
		subject: z.string(),
		payload: z.record(z.string(), z.unknown()).default({}),
	}),
});

/**
 * A candidate in the Voted index.
 *
 * `votes` and `votedAt` are the counts on file, refreshed by `maintain vote
 * sync` - never a live number, because the site is a static build. `lists`
 * accepts any string for the same reason `Bookmark.lists` does: the slugs are
 * configuration, not vocabulary.
 */
const Voted = defineCollection({
	loader: glob({ pattern: "**/*.json", base: "./Source/Content/Voted" }),
	schema: z.object({
		id: z.string(),
		url: z.url(),
		title: z.string().optional(),
		note: z.string().optional(),
		author: Author,
		lists: z.array(z.string()),
		votes: z.number().int().nonnegative(),
		votedAt: Timestamp,
		nominatedAt: Timestamp,
		status: z.enum(["candidate", "approved", "rejected"]),
	}),
});

/**
 * One entry of the Curated index - the only thing the homepage leads with.
 *
 * It points at the `Voted`/`Bookmark` record by `id` instead of copying it, and
 * `rank` is written by the owner rather than derived from votes, because
 * curation exists to be able to overrule a crowd.
 */
const Curated = defineCollection({
	loader: glob({ pattern: "**/*.json", base: "./Source/Content/Curated" }),
	schema: z.object({
		id: z.string(),
		rank: z.number().int().positive(),
		votes: z.number().int().nonnegative(),
		approvedAt: Timestamp,
		approvedBy: z.string(),
	}),
});

const Person = defineCollection({
	loader: glob({ pattern: "**/*.json", base: "./Source/Content/Author" }),
	schema: z.object({
		handle: z.string(),
		name: z.string(),
		verified: z.boolean(),
		firstSeenAt: Timestamp,
		postCount: z.number(),
		lists: z.array(z.string()),
		decision: z.object({
			by: z.enum(["rule", "model", "manual"]),
			confidence: z.number(),
			reason: z.string(),
		}),
	}),
});

export const collections = {
	Bookmark,
	Event,
	Author: Person,
	Voted,
	Curated,
};

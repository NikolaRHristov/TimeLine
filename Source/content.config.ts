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

const List = z.enum(["AI", "UI", "CODE"]);

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
		lists: z.array(List),
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
		]),
		subject: z.string(),
		payload: z.record(z.string(), z.unknown()).default({}),
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
		lists: z.array(List),
		decision: z.object({
			by: z.enum(["rule", "model", "manual"]),
			confidence: z.number(),
			reason: z.string(),
		}),
	}),
});

export const collections = { Bookmark, Event, Author: Person };

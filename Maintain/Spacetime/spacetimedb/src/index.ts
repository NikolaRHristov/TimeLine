import { t } from "spacetimedb/server";
// This sub-package resolves imports the way the SpacetimeDB module bundler
// does - without an extension - which is why it is the one place in the
// repository that does not spell `.ts`.
import { spacetimedb } from "./Schema";

/**
 * Timeline archive, live view.
 *
 * The tables are rendered from `Maintain/Source/Model/Schema/Entities.ts` into
 * `Schema.ts`; this file holds only behaviour. Three rules survive from the file
 * store, and each one is a reducer's job rather than a column's:
 *
 * 1. Observations and events are append-only. A re-scrape updates the post's
 *    metrics in place but never rewrites history.
 * 2. `visibility` is the only field that decides what may reach the public site.
 * 3. Every derived row id is built from its content, so replaying the same
 *    scrape is idempotent instead of duplicating rows.
 *
 * There is exactly one reducer that writes a post - `observe` - because a
 * second write path is a second set of rules waiting to disagree with the first.
 * `store publish`, `store hide` and the backfill all go through it.
 */

export default spacetimedb;

export const init = spacetimedb.init((_ctx) => {
	// Nothing to seed: the archive arrives through `observe`.
});

export const onConnect = spacetimedb.clientConnected((_ctx) => {});
export const onDisconnect = spacetimedb.clientDisconnected((_ctx) => {});

/**
 * Write one post record and append the observation that produced it.
 *
 * The arguments are the record, not a page reading: a caller that has already
 * folded a reading into the archive record (the scrape path) and a caller that
 * is restoring a record it holds (the export path) send the same thing. That is
 * what keeps the two paths from growing different rules.
 *
 * `at` is the observation's own moment, never the wall clock, so replaying a
 * scrape rewrites the same row instead of appending a second one.
 */
export const observe = spacetimedb.reducer(
	{
		id: t.string(),
		url: t.string(),
		authorHandle: t.string(),
		authorName: t.string(),
		authorVerified: t.bool(),
		text: t.string(),
		postedAt: t.string().optional(),
		firstSeenAt: t.string(),
		lastScrapedAt: t.string(),
		/** shadow | public | hidden */
		visibility: t.string(),
		/** The list slugs as a JSON array. */
		lists: t.string(),
		replies: t.u32(),
		reposts: t.u32(),
		likes: t.u32(),
		views: t.u32(),
		/** bookmark | like | history */
		source: t.string(),
		at: t.string(),
		/** observed | published | hidden */
		action: t.string(),
	},
	(ctx, args) => {
		const existing = ctx.db.post.id.find(args.id);

		if (existing === null) {
			ctx.db.post.insert({
				id: args.id,
				url: args.url,
				author: args.authorHandle,
				text: args.text,
				postedAt: args.postedAt,
				replies: args.replies,
				reposts: args.reposts,
				likes: args.likes,
				views: args.views,
				firstSeenAt: args.firstSeenAt,
				lastScrapedAt: args.lastScrapedAt,
				visibility: args.visibility,
				lists: args.lists,
			});
		} else {
			// `firstSeenAt` is the archive's own fact and survives every fold.
			ctx.db.post.id.update({
				...existing,
				url: args.url,
				author: args.authorHandle,
				text: args.text,
				postedAt: args.postedAt,
				replies: args.replies,
				reposts: args.reposts,
				likes: args.likes,
				views: args.views,
				lastScrapedAt: args.lastScrapedAt,
				visibility: args.visibility,
				lists: args.lists,
			});
		}

		const known = ctx.db.author.handle.find(args.authorHandle);
		if (known === null) {
			ctx.db.author.insert({
				handle: args.authorHandle,
				name: args.authorName,
				verified: args.authorVerified,
				firstSeenAt: args.firstSeenAt,
				postCount: existing === null ? 1 : 0,
			});
		} else {
			ctx.db.author.handle.update({
				...known,
				name: args.authorName,
				verified: args.authorVerified,
				// A new post is a new count; re-observing one already held is not.
				postCount: existing === null ? known.postCount + 1 : known.postCount,
			});
		}

		// Append-only, keyed by content: replaying the same scrape writes nothing.
		const observationId = `${args.id}:${args.source}:${args.at}:${args.action}`;
		if (ctx.db.observation.id.find(observationId) === null) {
			ctx.db.observation.insert({
				id: observationId,
				at: args.at,
				source: args.source,
				postId: args.id,
				action: args.action,
			});
		}
	},
);

/** Append one event. The payload is opaque JSON text. */
export const record = spacetimedb.reducer(
	{
		kind: t.string(),
		subject: t.string(),
		payload: t.string(),
		at: t.string(),
	},
	(ctx, args) => {
		const id = `${args.at}:${args.kind}:${args.subject}`;
		if (ctx.db.event.id.find(id) !== null) return;
		ctx.db.event.insert({
			id,
			at: args.at,
			kind: args.kind,
			subject: args.subject,
			payload: args.payload,
		});
	},
);

/** Record which curated list a handle belongs to. The latest decision for a pair wins. */
export const classify = spacetimedb.reducer(
	{
		handle: t.string(),
		list: t.string(),
		by: t.string(),
		confidence: t.f32(),
		reason: t.string(),
		at: t.string(),
	},
	(ctx, args) => {
		const id = `${args.list}:${args.handle}`;
		const row = {
			id,
			list: args.list,
			handle: args.handle,
			by: args.by,
			confidence: args.confidence,
			reason: args.reason,
			at: args.at,
		};
		if (ctx.db.membership.id.find(id) === null) {
			ctx.db.membership.insert(row);
		} else {
			ctx.db.membership.id.update(row);
		}
	},
);

/** Attach one media item to a post, at the position the page showed it. */
export const attach = spacetimedb.reducer(
	{ postId: t.string(), kind: t.string(), url: t.string(), position: t.u32() },
	(ctx, args) => {
		const id = `${args.postId}:${args.url}`;
		const row = {
			id,
			postId: args.postId,
			kind: args.kind,
			url: args.url,
			position: args.position,
		};
		if (ctx.db.media.id.find(id) === null) ctx.db.media.insert(row);
		else ctx.db.media.id.update(row);
	},
);

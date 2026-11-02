import { schema, table, t } from "spacetimedb/server";

/**
 * Timeline archive, live view.
 *
 * The JSON files under `Maintain/Storage/Shadow/` stay the source of truth; this
 * module is the queryable projection. It exists so an observation is visible the
 * moment it happens (subscribe to a table) instead of only after someone opens a
 * file or runs a query.
 *
 * Three rules carried over from the file store:
 *
 * 1. Observations and events are append-only. A re-scrape updates the post's
 *    metrics in place but never rewrites history.
 * 2. `visibility` is the only field that decides what may reach the public site.
 * 3. Every derived row id is built from its content, so replaying the same
 *    scrape is idempotent instead of duplicating rows.
 */

const post = table(
	{ public: true },
	{
		/** X status id - the same key the file store uses. */
		id: t.string().primaryKey(),
		url: t.string(),
		author: t.string().index(),
		text: t.string(),
		postedAt: t.string().optional(),
		firstSeenAt: t.string(),
		lastScrapedAt: t.string(),
		/** shadow | public | hidden */
		visibility: t.string(),
		replies: t.u32(),
		reposts: t.u32(),
		likes: t.u32(),
		views: t.u32(),
	},
);

const author = table(
	{ public: true },
	{
		handle: t.string().primaryKey(),
		name: t.string(),
		verified: t.bool(),
		firstSeenAt: t.string(),
		postCount: t.u32(),
	},
);

const media = table(
	{ public: true },
	{
		/** `<postId>:<url>` - one row per media item, stable across scrapes. */
		id: t.string().primaryKey(),
		postId: t.string().index(),
		/** image | video | gif | link */
		kind: t.string(),
		url: t.string(),
	},
);

/** Append-only. One row per scrape that saw the post, with the metrics of that moment. */
const observation = table(
	{ public: true },
	{
		/** `<postId>:<source>:<at>` */
		id: t.string().primaryKey(),
		postId: t.string().index(),
		/** bookmark | like | history */
		source: t.string(),
		at: t.string(),
		likes: t.u32(),
		reposts: t.u32(),
		views: t.u32(),
	},
);

/** Append-only log: scrape.started, scrape.finished, bookmark.added, list.assigned, ... */
const event = table(
	{ public: true },
	{
		/** `<at>:<kind>:<subject>` */
		id: t.string().primaryKey(),
		at: t.string(),
		kind: t.string().index(),
		subject: t.string().index(),
		/** JSON, kept opaque so a new event shape needs no migration. */
		payload: t.string(),
	},
);

/** Which curated list a handle belongs to, and why. */
const membership = table(
	{ public: true },
	{
		/** `<list>:<handle>` - the latest decision for that pair. */
		id: t.string().primaryKey(),
		list: t.string().index(),
		handle: t.string().index(),
		/** rule | model | manual */
		by: t.string(),
		confidence: t.f32(),
		reason: t.string(),
		at: t.string(),
	},
);

const spacetimedb = schema({ post, author, media, observation, event, membership });

export default spacetimedb;

export const init = spacetimedb.init((_ctx) => {
	// Nothing to seed: the file store already holds the archive.
});

export const onConnect = spacetimedb.clientConnected((_ctx) => {});
export const onDisconnect = spacetimedb.clientDisconnected((_ctx) => {});

/** Insert or update one post, then append the observation that produced it. */
export const observe = spacetimedb.reducer(
	{
		id: t.string(),
		url: t.string(),
		authorHandle: t.string(),
		authorName: t.string(),
		authorVerified: t.bool(),
		text: t.string(),
		postedAt: t.string().optional(),
		source: t.string(),
		at: t.string(),
		replies: t.u32(),
		reposts: t.u32(),
		likes: t.u32(),
		views: t.u32(),
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
				firstSeenAt: args.at,
				lastScrapedAt: args.at,
				visibility: "shadow",
				replies: args.replies,
				reposts: args.reposts,
				likes: args.likes,
				views: args.views,
			});
			const known = ctx.db.author.handle.find(args.authorHandle);
			if (known === null) {
				ctx.db.author.insert({
					handle: args.authorHandle,
					name: args.authorName,
					verified: args.authorVerified,
					firstSeenAt: args.at,
					postCount: 1,
				});
			} else {
				ctx.db.author.handle.update({ ...known, postCount: known.postCount + 1 });
			}
		} else {
			ctx.db.post.id.update({
				...existing,
				url: args.url,
				text: args.text,
				lastScrapedAt: args.at,
				replies: args.replies,
				reposts: args.reposts,
				likes: args.likes,
				views: args.views,
			});
		}

		// Append-only, keyed by content: replaying the same scrape writes nothing.
		const observationId = `${args.id}:${args.source}:${args.at}`;
		if (ctx.db.observation.id.find(observationId) === null) {
			ctx.db.observation.insert({
				id: observationId,
				postId: args.id,
				source: args.source,
				at: args.at,
				likes: args.likes,
				reposts: args.reposts,
				views: args.views,
			});
		}
	},
);

/** Append one event. The payload is opaque JSON text. */
export const record = spacetimedb.reducer(
	{ kind: t.string(), subject: t.string(), payload: t.string(), at: t.string() },
	(ctx, args) => {
		const id = `${args.at}:${args.kind}:${args.subject}`;
		if (ctx.db.event.id.find(id) !== null) return;
		ctx.db.event.insert({
			id,
			kind: args.kind,
			subject: args.subject,
			payload: args.payload,
			at: args.at,
		});
	},
);

/** shadow | public | hidden - the only switch that lets a post reach the site. */
export const setVisibility = spacetimedb.reducer(
	{ id: t.string(), visibility: t.string() },
	(ctx, args) => {
		const existing = ctx.db.post.id.find(args.id);
		if (existing === null) return;
		ctx.db.post.id.update({ ...existing, visibility: args.visibility });
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

/** Attach one media item to a post. */
export const attach = spacetimedb.reducer(
	{ postId: t.string(), kind: t.string(), url: t.string() },
	(ctx, args) => {
		const id = `${args.postId}:${args.url}`;
		if (ctx.db.media.id.find(id) !== null) return;
		ctx.db.media.insert({ id, postId: args.postId, kind: args.kind, url: args.url });
	},
);

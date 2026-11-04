import { SenderError, t, type InferSchema, type ReducerCtx } from "spacetimedb/server";
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
 *
 * The catalog tables - `capability`, `generation`, `lease`, `probe`, `belief`,
 * `trace` - are written by the reducers at the foot of this file. They keep the
 * archive's rule, an id built from the row's content, and add one of their own:
 * a row that names a generation was written under the generation that is bound
 * now, never under the one the caller still remembers.
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

/**
 * The catalog's write path.
 *
 * Everything below writes one of the six catalog tables rather than the archive,
 * and the difference is the generation. An archive row is a fact about a page; a
 * catalog row is a fact about what this system was allowed to do, so it names the
 * generation it was allowed under and is refused when that generation has been
 * superseded.
 */

/** The reducer context, narrowed to this module's own tables. */
type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

/**
 * The sequence number a generation id states, or null when it states none.
 *
 * Ids are dense decimal sequence numbers and the `generation` table has no
 * sequence column, so the number is read out of the key itself. Comparing the
 * parsed number back against the key is what makes that fail closed: `01`,
 * `1.0`, `-1` and ` 1` all parse to a number and none of them round-trips, so
 * each is treated as no generation rather than as generation `1`.
 */
function generationSequence(id: string): number | null {
	const sequence = Number(id);
	if (!Number.isSafeInteger(sequence) || sequence < 1) return null;
	return String(sequence) === id ? sequence : null;
}

/**
 * Whether a generation is the latest bound one.
 *
 * A generation is superseded by the existence of its successor, never by a
 * column someone rewrote: `bind` computes a successor's id as its parent's
 * sequence plus one, so one key lookup answers the whole question and the
 * predecessor stays byte-identical. A sequence at the top of the range has no
 * successor to be superseded by, so it is the latest rather than a lookup that
 * would wrap.
 */
function isLatestBoundGeneration(ctx: Ctx, generationId: string): boolean {
	if (ctx.db.generation.id.find(generationId) === null) return false;

	const sequence = generationSequence(generationId);
	if (sequence === null) return false;

	const successor = sequence + 1;
	if (!Number.isSafeInteger(successor)) return true;

	return ctx.db.generation.id.find(String(successor)) === null;
}

/**
 * Refuse a write that names any generation but the latest bound one.
 *
 * Coherence is the whole point of the column: a row naming a generation claims
 * the act happened under that policy, so a worker still carrying an older one
 * would otherwise write as though the policy had not moved. Every reducer that
 * writes under a generation calls this one function, so the refusal has a single
 * wording and a single meaning. It reads, compares and throws; it writes nothing,
 * so a refusal leaves no partial row behind.
 *
 * The message carries the reason code the catalog's own manifest declares rather
 * than a list of conditions: the caller learns that its write did not land, not
 * which of several things it got wrong.
 *
 * Kept unexported on purpose - the entry file's named exports are the values
 * SpacetimeDB registers, and a helper is a module-level function that the
 * reducers in this file call directly.
 */
function assertLatestBoundGeneration(ctx: Ctx, generationId: string): void {
	if (isLatestBoundGeneration(ctx, generationId)) return;
	throw new SenderError(
		`admission-refused: generation ${generationId} is not the latest bound one`,
	);
}

/**
 * Append one trace row: evidence of an act, keyed by its instant, kind and
 * subject.
 *
 * A trace is evidence, not authority. It carries no fence, because the write
 * worth keeping is often the one that was refused, and fencing the log would
 * drop exactly that. It does carry the generation, because an act read under the
 * wrong interpreter is a different act.
 *
 * `at` is the writer's `T_event` - when the act happened, as the worker states
 * it - and `ingestedAt` is the module's `T_ingest`, read from the reducer
 * context. The two never share a column, so the ingestion lag is a difference
 * this row can compute. Neither `scheduledAt` nor `ranAt` is written: they exist
 * for a row persisted as a one-shot, and a synchronously written trace was never
 * scheduled.
 *
 * Append-only in both directions. A replay at the same instant appends nothing,
 * and a different payload under the same key is refused rather than allowed to
 * replace the first row, because reusing a content key with different content is
 * how a log starts lying. No path updates and none deletes.
 */
export const recordTrace = spacetimedb.reducer(
	{
		generation: t.string(),
		kind: t.string(),
		subject: t.string(),
		payload: t.string(),
		at: t.string(),
	},
	(ctx, args) => {
		assertLatestBoundGeneration(ctx, args.generation);

		if (args.kind.length === 0 || args.subject.length === 0) {
			throw new SenderError("admission-refused: a trace needs a kind and a subject");
		}

		const id = `${args.at}:${args.kind}:${args.subject}`;
		const known = ctx.db.trace.id.find(id);
		if (known !== null) {
			if (known.payload === args.payload) return;
			throw new SenderError(
				`admission-refused: trace ${id} already records a different payload`,
			);
		}

		ctx.db.trace.insert({
			id,
			generation: args.generation,
			kind: args.kind,
			subject: args.subject,
			payload: args.payload,
			at: args.at,
			ingestedAt: ctx.timestamp.toISOString(),
			scheduledAt: undefined,
			ranAt: undefined,
		});
	},
);

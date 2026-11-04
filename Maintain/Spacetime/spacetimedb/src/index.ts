// Runtime value classes come from the root package, not `spacetimedb/server`.
import { Timestamp } from "spacetimedb";
import { SenderError, t } from "spacetimedb/server";
import {
	currentGrant,
	extendDeadline,
	HELD,
	isLive,
	liveGrant,
	microsOf,
	nextFence,
	nowOf,
	requireCoherentGeneration,
	writeGrant,
	type Lease,
} from "./Catalog";
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

/**
 * The content a trace row is keyed by, as one unambiguous string.
 *
 * Only what the caller states about the act is here: `kind`, `subject` and
 * `payload`. `id` is what this produces, so it cannot be an input; `at` is the
 * writer's claim about when the act happened, and a retry that restates the
 * instant is still the same act - keying on it would append a second row for
 * one piece of evidence. `generation`, `ingestedAt`, `scheduledAt` and `ranAt`
 * are stamps this module writes, so none of them can be part of what a caller
 * is deduplicated on either.
 *
 * Each field states its length before its text, because a field can hold the
 * separator: `["a|b", "c"]` and `["a", "b|c"]` must not name the same key.
 */
function traceContent(kind: string, subject: string, payload: string): string {
	return [kind, subject, payload].map((field) => `${field.length}:${field}`).join("|");
}

/** The FNV-1a 64-bit offset basis and prime, and the mask that keeps a sum in range. */
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const U64_MASK = (1n << 64n) - 1n;

/**
 * The FNV-1a 64-bit digest of `text`, as sixteen lowercase hex digits.
 *
 * A digest rather than the encoding itself because `payload` is opaque JSON of
 * unbounded length and `id` is the primary key: repeating the payload inside
 * the key would store every trace twice. It is written out here rather than
 * taken from a package because a reducer is replayed - the same text has to
 * produce the same key on every host, and a digest whose version a replay has
 * to match is one more thing that can disagree.
 *
 * `charCodeAt` reads UTF-16 code units, which the language fixes whether or not
 * a runtime happens to hold the string as UTF-8.
 */
function digestOf(text: string): string {
	let hash = FNV_OFFSET_BASIS;

	for (let index = 0; index < text.length; index += 1) {
		hash = ((hash ^ BigInt(text.charCodeAt(index))) * FNV_PRIME) & U64_MASK;
	}

	return hash.toString(16).padStart(16, "0");
}

/** The id a trace row is stored under: a digest of its content, and of nothing else. */
function traceId(kind: string, subject: string, payload: string): string {
	return `trace:${digestOf(traceContent(kind, subject, payload))}`;
}

/**
 * Append one trace row: evidence of an act, keyed by the act's content.
 *
 * A trace is evidence, not authority. It carries no fence, because the write
 * worth keeping is often the one that was refused, and fencing the log would
 * drop exactly that. It does carry the generation, because an act read under the
 * wrong interpreter is a different act.
 *
 * The key is the content and nothing else, so recording the same act twice
 * appends one row. `at` sits deliberately outside it: it is the writer's claim
 * about when the act happened, and a worker that retries an hour later restates
 * the same act with a later instant. The first row's `at` therefore stands,
 * because this reducer never rewrites a row it finds.
 *
 * `at` is the writer's `T_event` - when the act happened, as the worker states
 * it - and `ingestedAt` is the module's `T_ingest`, read from the reducer
 * context. The two never share a column, so the ingestion lag is a difference
 * this row can compute. Neither `scheduledAt` nor `ranAt` is written: they exist
 * for a row persisted as a one-shot, and a synchronously written trace was never
 * scheduled.
 *
 * The generation stamped on the row is the one the shared coherence helper
 * answers with, not the string the caller sent: a caller's claim is checked
 * against what is bound now, and the row states what it was written under. A
 * caller that names no generation is under the latest by construction, because
 * the whole reducer is one transaction.
 *
 * Append-only in both directions. A replay of the same content appends nothing,
 * and two contents that would share a key - a digest collision - are refused
 * rather than allowed to replace each other, because reusing a key with
 * different content is how a log starts lying. No path updates and none
 * deletes.
 *
 * Shape: every column `event` carries - `id`, `kind`, `subject`, `payload`,
 * `at` - with the same types, plus the generation and the three trace-only time
 * columns. A reader folding both logs iterates the same five fields. The
 * deliberate difference is the key: `event` is keyed by
 * `<at>:<kind>:<subject>`, so the same act restated at a later instant is a
 * second event, while a trace is keyed by its content, so it is not.
 */
export const recordTrace = spacetimedb.reducer(
	{
		generation: t.string().optional(),
		kind: t.string(),
		subject: t.string(),
		payload: t.string(),
		at: t.string(),
	},
	(ctx, args) => {
		// The one coherence check in the module, shared with `bind`, `claim` and
		// `renew`. It answers with the latest bound generation, and that answer
		// is what the row carries: the caller's claim is checked, never echoed.
		const generation = requireCoherentGeneration(ctx, args.generation);

		// A trace names the generation it was recorded under and the column is
		// not optional, so a module with nothing bound has nothing to write.
		if (generation === null) {
			throw new SenderError(
				"unbound-generation: a trace names the generation it was recorded under, and none has been bound",
			);
		}

		if (args.kind.length === 0 || args.subject.length === 0) {
			throw new SenderError("admission-refused: a trace needs a kind and a subject");
		}

		const id = traceId(args.kind, args.subject, args.payload);
		const known = ctx.db.trace.id.find(id);

		if (known !== null) {
			// Same content, so the act is already recorded: a replay appends
			// nothing and rewrites nothing, its `at` included.
			if (
				known.kind === args.kind &&
				known.subject === args.subject &&
				known.payload === args.payload
			) {
				return;
			}

			// Different content under the same id means the digest collided.
			// Refusing keeps the log honest; the alternative is dropping an act
			// the caller believes it recorded.
			throw new SenderError(
				`admission-refused: trace ${id} already records a different payload`,
			);
		}

		ctx.db.trace.insert({
			id,
			generation,
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

/**
 * The last instant `Timestamp.toISOString()` can render: the largest whole
 * millisecond a JavaScript `Date` represents, plus the microseconds below it.
 *
 * A duration is a `t.u64()`, so a caller can name a deadline far past this. The
 * `Timestamp` constructor accepts such a value without complaint and the
 * formatting throws a bare `RangeError` afterwards, which would reach the caller
 * as an unnamed module fault. The bound is therefore checked before the row is
 * built and refused as a lease error like every other refusal here.
 */
const LAST_RENDERABLE_MICROS = BigInt(Number.MAX_SAFE_INTEGER) * 1000n + 999n;

/**
 * Take the lease on a resource, or be refused because one is live.
 *
 * A lease is the standing a fenced write needs, so this is the reducer that
 * opens one. It grants only while nothing holds the resource: a live grant is
 * one whose `state` is held and whose deadline is still in the future, and while
 * one exists the claim is refused with `lease-held`. It is not queued, not
 * blocked and not written over - a queue would make the caller wait on a holder
 * it cannot see, and an overwrite would take the resource from a worker that is
 * still using it.
 *
 * An expired grant and a released grant are both not live, so a claim after
 * either is granted. Its fence is one past the newest fence the resource ever
 * issued - not one past the live one - so the number is strictly greater than
 * every fence before it and is never reused. That is what makes a takeover safe:
 * the worker whose lease expired still carries the old number, and every write it
 * makes from then on is refused instead of landing late on top of the new holder.
 *
 * The row is written through `writeGrant`, the table's single write path, which
 * re-checks the fence and the named generation before its one insert. Every
 * refusal here therefore throws before anything is written, and the transaction
 * rolls back with the `lease` table byte-for-byte as it was.
 *
 * `durationMicros` is the caller's lease length, added to the reducer's own
 * clock rather than to a wall clock, so the deadline is the module's fact and
 * not the caller's. `generation` is optional: a claim that names one is refused
 * when it is not the latest bound generation, and a claim that names none is
 * under the latest by construction, because the whole reducer is one
 * transaction.
 */
export const claim = spacetimedb.reducer(
	{
		resource: t.string(),
		durationMicros: t.u64(),
		generation: t.string().optional(),
	},
	(ctx, args) => {
		const resource = args.resource;
		const now = nowOf(ctx);

		if (resource.length === 0) {
			throw new SenderError("lease-invalid: a claim needs a resource name");
		}

		// A zero or negative length would write a grant that is dead the instant
		// it is accepted: the next claim would find the resource free and take
		// it, which is a grant that granted nothing.
		if (args.durationMicros <= 0n) {
			throw new SenderError(
				`lease-invalid: a claim on ${resource} needs a positive duration, not ${args.durationMicros}µs`,
			);
		}

		const expiresMicros = ctx.timestamp.microsSinceUnixEpoch + args.durationMicros;
		if (expiresMicros > LAST_RENDERABLE_MICROS) {
			throw new SenderError(
				`lease-invalid: a ${args.durationMicros}µs claim on ${resource} would expire past the representable range`,
			);
		}

		const live = liveGrant(ctx, resource, now);
		if (live !== null) {
			throw new SenderError(
				`lease-held: ${resource} is held by ${live.holder} under fence ${live.fence} until ${live.expiresAt}`,
			);
		}

		// The fence counts grants issued for the resource, so it is read from the
		// newest row whether that row expired, was released, or is still held.
		const previous = currentGrant(ctx, resource);
		const fence = nextFence(previous?.fence);

		const grant: Lease = {
			// Unique per claim without a sequence column: a fence is issued once
			// per resource, so the pair names one grant and a released grant's id
			// is never handed to its successor.
			id: `${resource}:${fence}`,
			resource,
			holder: ctx.sender.toHexString(),
			fence,
			acquiredAt: now,
			expiresAt: new Timestamp(expiresMicros).toISOString(),
			state: HELD,
		};

		writeGrant(ctx, grant, { generation: args.generation });
	},
);

/**
 * Extend a grant the caller still holds, provided it presents the current
 * fence.
 *
 * The fence is the whole of the refusal. A worker whose grant lapsed and was
 * taken over still carries the number it was given, and the resource has moved
 * past it, so its renewal is refused by `writeGrant` before anything is written
 * instead of landing on top of the new holder's grant. The presented fence is
 * handed to that one write path rather than compared here, so "the current
 * fence" has a single definition in the module and a renewal cannot grow a
 * second one that disagrees.
 *
 * A held grant is extended from the deadline it already carries, so a renewal
 * never shortens one; a held grant that has lapsed is extended from now,
 * because measuring from a past instant would hand back a deadline that is
 * already spent. `fence`, `holder`, `acquiredAt` and `state` are carried
 * through untouched - a renewal is the same grant, not a new one - and a
 * released grant is refused rather than extended, because the resource is free
 * and claiming it is the verb that says so.
 *
 * A resource that was never granted is refused for the same reason: there is no
 * lease to extend, and a renewal that opened one would hand out a fence outside
 * `claim`, which is the reducer that issues them. A grant whose deadline is not
 * text this module can read is refused too, rather than extended from the clock:
 * that would report success while replacing a deadline the caller never saw.
 *
 * `generation` is optional and checked by the shared write path exactly as
 * `claim` checks it: a renewal that names a superseded generation is refused,
 * and one that names none is under the latest by construction, because the
 * whole reducer is one transaction.
 */
export const renew = spacetimedb.reducer(
	{
		resource: t.string(),
		fence: t.u64(),
		extensionMicros: t.u64(),
		generation: t.string().optional(),
	},
	(ctx, args) => {
		const lease = currentGrant(ctx, args.resource);

		if (lease === null) {
			throw new SenderError(
				`admission-refused: ${args.resource} has never been granted, so there is no lease to renew`,
			);
		}

		if (lease.state !== HELD) {
			throw new SenderError(
				`admission-refused: grant ${lease.id} on ${args.resource} is ${lease.state}, and a renewal extends a held grant rather than reopening one`,
			);
		}

		const now = nowOf(ctx);

		// A deadline the module cannot read is refused rather than replaced. The
		// rule below is "extend from the deadline while it is still in the
		// future, otherwise from now", and neither branch is answerable about
		// text that names no instant - measuring from now would report success
		// while discarding a deadline nobody could inspect.
		if (microsOf(lease.expiresAt) === null) {
			throw new SenderError(
				`admission-refused: grant ${lease.id} on ${args.resource} carries ${JSON.stringify(lease.expiresAt)}, which is not a deadline this module can read`,
			);
		}

		// A live grant keeps the deadline it has; a lapsed one is measured from
		// the reducer's own clock, never from the caller's idea of the time.
		const base = isLive(lease, now) ? lease.expiresAt : now;

		writeGrant(
			ctx,
			{ ...lease, expiresAt: extendDeadline(base, args.extensionMicros) },
			{ fence: args.fence, generation: args.generation },
		);
	},
);

// Builders, module exports and the refusal type all live in `spacetimedb/server`.
import { SenderError, t } from "spacetimedb/server";
import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import {
	appendGeneration,
	currentGrant,
	extendDeadline,
	HELD,
	isLive,
	liveGrant,
	microsOf,
	nextFence,
	nowOf,
	requireCoherentGeneration,
	STAMP_CEILING,
	stampOf,
	writeGrant,
	type Lease,
} from "./Catalog";
// The declared set and its one write path. `init` calls the seed and no reducer
// does, which is why the import is here rather than inside a reducer body.
import { seedCapabilities } from "./Declarations";
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
 * `trace` - are written by the reducers at the foot of this file, except
 * `capability`, which `init` seeds from `Declarations.ts`: a declaration is a
 * deployment, so it has no reducer a caller could reach. They keep the archive's
 * rule, an id built from the row's content, and add one of their own: a row that
 * names a generation was written under the generation that is bound now, never
 * under the one the caller still remembers.
 */

export default spacetimedb;

/**
 * The deployment hook: the one path a `capability` row is written through.
 *
 * A declaration is a deployment fact, and `init` is the hook the host runs when
 * a module is published. It is not a reducer a client can call, so the widening
 * path - a caller adding the capability its own manifest is then checked
 * against - does not exist here rather than being guarded somewhere. `bind`
 * stays a reader of `capability`, and no reducer declares one.
 *
 * A republish that keeps its data does not re-run this, so an id added to
 * `Declarations.ts` after the first publish arrives with `publish
 * --delete-data` and not with a plain republish: the declarations in the
 * database are the ones the rows already written were checked against.
 */
export const init = spacetimedb.init((ctx) => {
	seedCapabilities(ctx);
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
 *
 * `probe` is a receipt for a disclosure, and a disclosure is an act under an
 * admission policy, so it follows the same rule as the rest: `reveal` stamps the
 * generation the coherence helper answered with, and a module with nothing bound
 * writes no receipt at all. `belief` is the exception, and deliberately not a
 * guard either: a derivation admits nothing, so it has no policy to name, and
 * the receipts it folds already carry the generations they were permitted under.
 * It stamps nothing and refuses nothing for want of a generation - in a module
 * with nothing bound it writes nothing at all, because no receipt can exist to
 * fold.
 */

/**
 * Bind a generation: append the row that states what this system was allowed to
 * do, and make it the generation every later catalog write is checked against.
 *
 * `generation` is append-only, so this reducer appends and never rewrites. The
 * latest bound generation is not a pointer that a write moves: it is derived by
 * the one reader in `Catalog.ts` as the highest canonical decimal id in the
 * table, and this reducer moves it by writing `String(parent + 1)` - `"1"` when
 * the history is empty. That is why the id is not an argument and there is no
 * auto-increment: a generation's number is its position in a dense sequence the
 * module computes, which is what makes two binds naming one predecessor a
 * compare-and-swap rather than a fork.
 *
 * `boundAt` is `nowOf(ctx)`, the reducer's own clock. The caller does not get
 * to state when its generation was bound - a generation's birth is the module's
 * own fact, and a client-supplied instant would let a caller backdate the
 * policy it bound.
 *
 * `policyChanged` is carried, not derived. There is nothing here to compare
 * against: `generation` has no policy column, and the admission policy belongs
 * to the manifest rather than to this table, so the successor is the only place
 * that knows whether it moved. The value is stored verbatim; defaulting it to
 * false would assert "the policy did not move" for every bind.
 *
 * `capabilities` is the manifest's capability list, and every id in it must
 * already be declared. The digest is opaque and names a manifest rather than
 * its parts, so it cannot be parsed into that list; only emptiness is refused.
 * A capability is never created here, because a reducer that could declare one
 * would let a caller widen the set its own manifest is checked against.
 *
 * Steps, in this order and no other:
 *
 * 1. Refuse an empty digest, a duplicated capability id, and an undeclared one.
 * 2. Resolve the predecessor and require that it is still the latest bound
 *    generation. A bind naming none opens the history, so it is refused when
 *    anything is already bound.
 * 3. Compute the id and append exactly one row, through `appendGeneration`.
 * 4. Re-assert coherence against the row just written.
 *
 * Nothing is written before step 3, and a `SenderError` anywhere rolls the call
 * back - so a refusal leaves `generation` byte-for-byte as it was, and a bind
 * that failed its own final assertion cannot leave a row behind.
 */
export const bind = spacetimedb.reducer(
	{
		/** The generation this one succeeds, when it succeeds one. */
		previous: t.string().optional(),
		/** The composition root's digest of the manifest it bound. Opaque here. */
		manifestDigest: t.string(),
		/** The manifest's capability ids, `<name>@<version>`, not bare names. */
		capabilities: t.array(t.string()),
		/** Whether this generation's admission policy differs from its parent's. */
		policyChanged: t.bool(),
	},
	(ctx, args) => {
		if (args.manifestDigest.length === 0) {
			throw new SenderError("admission-refused: a bind needs a manifest digest");
		}

		// Sorting before deduplicating makes the refusal independent of the
		// order the caller happened to list the ids in.
		const named = [...args.capabilities].sort();
		const declared = [...new Set(named)];

		if (declared.length !== named.length) {
			throw new SenderError(
				"admission-refused: the manifest names a capability more than once",
			);
		}

		for (const id of declared) {
			if (ctx.db.capability.id.find(id) === null) {
				throw new SenderError(
					`admission-refused: the manifest names ${id}, which is not a declared capability`,
				);
			}
		}

		const opens = args.previous === undefined || args.previous === null;

		// Naming no predecessor means opening the history, and the shared helper
		// reads an absent generation as "under the latest by construction" -
		// right for a write that stamps a row, wrong for the one reducer that
		// moves the pointer. Asking it for the latest with no claim, then
		// refusing when there is one, is what stops a bind opening a second
		// history beside the first.
		const parent = requireCoherentGeneration(ctx, opens ? null : args.previous);

		if (opens && parent !== null) {
			throw new SenderError(
				`admission-refused: generation ${parent} is already bound, so a bind naming no predecessor cannot open a second history`,
			);
		}

		// The successor's number is computed from its parent's, which is what
		// keeps the ids dense and the latest single-valued.
		const id = parent === null ? "1" : String(BigInt(parent) + 1n);

		appendGeneration(ctx, {
			id,
			boundAt: nowOf(ctx),
			manifestDigest: args.manifestDigest,
			policyChanged: args.policyChanged,
		});

		// The row just appended is the generation every later write is checked
		// against. This cannot fail in a correct reducer; it is kept because a
		// throw here rolls the insert back instead of leaving a row nothing else
		// would stamp.
		requireCoherentGeneration(ctx, id);
	},
);

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
				`admission-refused: trace ${id} already records different content`,
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
 * The `lease-held` refusal names the resource, the fence and the deadline, and
 * never the holder. `lease` is a private table, so the holder's identity is a
 * value the refused caller cannot read for itself, and an error message is still
 * a read: naming it there would disclose another sender's identity to whoever
 * lost the claim. "Another identity" keeps the diagnostic - the caller learns
 * that the resource is taken and what it would have to beat - without handing
 * over who took it.
 *
 * `durationMicros` is the caller's lease length, added to the reducer's own
 * clock rather than to a wall clock, so the deadline is the module's fact and
 * not the caller's. It is bounded by `STAMP_CEILING` and formatted by `stampOf`,
 * because a `t.u64()` duration can name a deadline past the last stampable
 * instant: there `Timestamp.toISOString()` writes an extended-year form
 * (`+033714-09-28T…`) that no deadline reader parses and that sorts *before* a
 * four-digit year, so the grant would read as already expired the moment it was
 * written - the resource would stay free and the next claim would succeed
 * alongside it. `generation` is optional: a claim that names one is refused when
 * it is not the latest bound generation, and a claim that names none is under
 * the latest by construction, because the whole reducer is one transaction.
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
		if (expiresMicros > STAMP_CEILING) {
			throw new SenderError(
				`lease-invalid: a ${args.durationMicros}µs claim on ${resource} would expire past the last stampable instant, ${stampOf(STAMP_CEILING)}`,
			);
		}

		const live = liveGrant(ctx, resource, now);
		if (live !== null) {
			throw new SenderError(
				`lease-held: ${resource} is held by another identity under fence ${live.fence} until ${live.expiresAt}`,
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
			expiresAt: stampOf(expiresMicros),
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

/**
 * The disclosure path.
 *
 * A reveal is the one place a private property leaves its table, so the order of
 * its steps is the security property rather than an implementation detail: a
 * refusal decided before the private value is read cannot vary with that value,
 * and the audience is authenticated rather than stated.
 *
 * `probe` is both the receipt and the charge. There is no meter table and no
 * second write - one reveal inserts one row, a replay finds that row and is
 * refused, and a throw anywhere in the reducer rolls the whole call back, so
 * there is no state in which a receipt exists and its price was not paid.
 *
 * Nothing here is exported except the reducer and the view: the entry file's
 * named exports are reserved for values registered with SpacetimeDB, so the
 * helpers below are ordinary functions in the module rather than exports. The
 * two shared primitives they need - the deadline comparison and the reducer
 * clock - come from `Catalog`, because a second definition of "live" is a second
 * answer to the same question.
 */

/** The module's reducer context, typed by the generated schema. */
type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

/**
 * The audience a call is made as: the authenticated identity, in hex.
 *
 * Never a role and never an argument. A role is a permission, and a permission
 * is not a recipient: two senders holding the same role would share a receipt
 * key, so the second would either be refused having paid nothing or be handed a
 * disclosure written for someone else. An argument would be worse than a role -
 * it is a claim, and `ctx.sender` is the only authenticated fact here.
 */
function audienceOf(ctx: Ctx): string {
	return ctx.sender.toHexString();
}

/**
 * The standing `audience` holds on `resource` at the reducer's instant: the
 * highest fence among its live leases, or null when it holds none.
 *
 * Liveness is `isLive` from `Catalog` - the same comparison the fenced-write
 * path uses - rather than a second one that could disagree with it about the
 * same deadline. The resource is the one the property row declares, so a caller
 * cannot present a lease on something it happens to hold and read a property it
 * was never granted.
 *
 * A null answer is the role `none`; anything else is `prober`. The role is
 * computed here and never stored, because it is a permission rather than a
 * recipient.
 */
function standingOf(ctx: Ctx, audience: string, resource: string): bigint | null {
	const now = nowOf(ctx);
	let standing: bigint | null = null;

	for (const grant of ctx.db.lease.resource.filter(resource)) {
		if (grant.holder !== audience || !isLive(grant, now)) continue;
		if (standing === null || grant.fence > standing) standing = grant.fence;
	}

	return standing;
}

/**
 * The permitted projection of a property row: its name, its version and its
 * value, as one JSON text.
 *
 * `evidence` is deliberately absent, and that absence is the whole function's
 * purpose: the evidence column exists so that a disclosure computed from the row
 * has something it must not copy. This is the only place the private value is
 * read, so what is left out here is left out everywhere.
 */
function discloseOf(row: { name: string; version: number; value: string }): string {
	return JSON.stringify({ name: row.name, version: row.version, value: row.value });
}

/**
 * Reveal one property to the caller, at the version it names.
 *
 * The reducer is called `reveal`, not `probe`: the `probe` table already owns
 * that name, and a reducer named `probe` declares an argument object whose type
 * is also called `Probe`, which the module registry refuses as a duplicate.
 *
 * `generation` is optional and is the caller's claim about the world it is
 * reading in, checked by the shared coherence helper before this reducer does
 * anything else. A reveal that names a superseded generation is refused with
 * `stale-generation`, and one that names none is under the latest by
 * construction, because the whole reducer is one transaction - the same rule
 * `claim`, `renew` and `recordTrace` are held to, and the reason this reducer
 * contains no comparison of generation ids.
 *
 * The receipt carries the helper's answer and not the caller's string: the
 * caller's value is the claim, the helper's is the generation the row was
 * actually written under. That also means a module with nothing bound writes no
 * receipt - it is refused with `unbound-generation`, exactly as `recordTrace`
 * refuses - because a receipt is evidence that a policy permitted this
 * disclosure, and it cannot state that under none.
 *
 * Steps, in this order and no other:
 *
 * 0. Refuse a caller whose generation claim is not the latest bound one, and
 *    refuse a module with nothing bound at all. This is the one step whose
 *    answer the receipt keeps.
 * 1. Reject a malformed request - an empty capability, an empty property, or a
 *    version below one.
 * 2. Resolve the audience from `ctx.sender`. There is no audience argument, and
 *    none may be added: a receipt written in another identity's name is a
 *    disclosure injected into that identity's belief.
 * 3. Require the capability declaration, by primary key.
 * 4. Load the property row and require the version the caller named. A newer
 *    truth is a different fact and a separate entitlement.
 * 5. Require a live lease held by the audience on the resource the property row
 *    declares. This is the entitlement check, and it runs before the private
 *    value is read.
 * 6. Refuse a replay, before the private value is read as well: the allowance
 *    is one reveal per capability, property, version and audience.
 * 7. Compute the disclosure.
 * 8. Insert the receipt - and that insert is the charge.
 *
 * A refusal at any of steps 0-6 writes nothing and charges nothing, and a throw
 * anywhere rolls back the call, so pay-and-reveal is all-or-nothing by
 * construction rather than by discipline.
 *
 * The reducer returns nothing. The caller reads what it was told through
 * `myProbe`, so there is no return value a private value could travel in.
 */
export const reveal = spacetimedb.reducer(
	{
		/** The capability's id, `<name>@<version>`, not its bare name. */
		capability: t.string(),
		/** The property's name, without a version. */
		property: t.string(),
		/** The property's own version, which the receipt pins. */
		propertyVersion: t.u32(),
		/** `T_event` - when the reading was taken, as the caller states it. */
		at: t.string(),
		/**
		 * The generation the caller was bound with, when it names one.
		 *
		 * A reveal is a catalog write, so it is held to the same coherence rule
		 * as the rest: naming a superseded generation is refused before
		 * anything is read, and naming none is under the latest by
		 * construction.
		 */
		generation: t.string().optional(),
	},
	(ctx, args) => {
		// The one coherence check in the module, shared with `recordTrace`,
		// `claim` and `renew`. It runs before the request is examined and long
		// before the private value is read: a caller operating on a superseded
		// generation is refused for that reason rather than for whatever its
		// request happens to be, and nothing is written on the stale path.
		//
		// Its answer is what the receipt carries. The caller's string was the
		// claim; this is the generation the row is written under.
		const generation = requireCoherentGeneration(ctx, args.generation);

		// A receipt names the generation it was allowed under and the column is
		// not optional, so a module with nothing bound has nothing to write.
		// `recordTrace` refuses for the same reason and with the same reason
		// string's vocabulary.
		if (generation === null) {
			throw new SenderError(
				"unbound-generation: a receipt names the generation it was allowed under, and none has been bound",
			);
		}

		if (args.capability.length === 0) {
			throw new SenderError("admission-refused: a reveal needs a capability id");
		}

		if (args.property.length === 0) {
			throw new SenderError("admission-refused: a reveal needs a property name");
		}

		if (args.propertyVersion < 1) {
			throw new SenderError(
				`admission-refused: a property version starts at 1, not ${args.propertyVersion}`,
			);
		}

		// The audience is the caller's identity and nothing the caller said.
		const audience = audienceOf(ctx);

		if (ctx.db.capability.id.find(args.capability) === null) {
			throw new SenderError(
				`admission-refused: ${args.capability} is not a declared capability`,
			);
		}

		const row = ctx.db.property.id.find(`${args.capability}:${args.property}`);

		if (row === null) {
			throw new SenderError(
				`admission-refused: ${args.capability} declares no property ${args.property}`,
			);
		}

		if (row.version !== args.propertyVersion) {
			throw new SenderError(
				`admission-refused: ${args.property} is at version ${row.version}, not ${args.propertyVersion}`,
			);
		}

		// The entitlement check, and the last step before anything private is
		// read. A caller with no live lease on the resource the property
		// declares is refused here, so two worlds differing only in a protected
		// value produce the same transcript for that caller.
		//
		// The refusal names the property and never the resource the row
		// declares. `property.resource` is a column of a private table, and the
		// caller reaching this line is by definition not entitled to it - worse,
		// it is the one value `claim` needs to make itself entitled, because
		// `claim` grants a resource to any sender that names it. Printing it
		// would turn the gate into an instruction for passing it.
		if (standingOf(ctx, audience, row.resource) === null) {
			throw new SenderError(
				`admission-refused: ${audience} holds no live lease on the resource ${args.property} requires`,
			);
		}

		// The allowance. The primary key is the guarantee - it serialises two
		// racing reveals, so the loser's transaction aborts - and this find only
		// turns that abort into a clean refusal.
		const id = `${args.capability}:${args.property}:${args.propertyVersion}:${audience}`;

		if (ctx.db.probe.id.find(id) !== null) {
			throw new SenderError(
				`budget-exhausted: ${args.property} at version ${args.propertyVersion} was already revealed to ${audience}`,
			);
		}

		// The private value is read here, after every refusal has been decided.
		const value = discloseOf(row);

		// One write, and it is the charge. There is nothing after it that can
		// fail independently of it.
		ctx.db.probe.insert({
			id,
			capability: args.capability,
			property: args.property,
			propertyVersion: args.propertyVersion,
			audience,
			value,
			at: args.at,
			ingestedAt: nowOf(ctx),
			generation,
		});
	},
);

/**
 * The row a caller reads its own receipts as.
 *
 * Named for the disclosure rather than for the view: a named output type must
 * not reuse the generated PascalCase name of its accessor, which is `MyProbe`.
 */
const ProbeDisclosure = t.object("ProbeDisclosure", {
	id: t.string(),
	capability: t.string(),
	property: t.string(),
	propertyVersion: t.u32(),
	audience: t.string(),
	value: t.string(),
	at: t.string(),
	ingestedAt: t.string(),
	generation: t.string(),
});

/**
 * What the caller itself was told.
 *
 * `probe` is private, and a reducer returns nothing, so this view is the read
 * path - and being keyed on `ctx.sender` it is also the only one: a caller sees
 * the receipts written for its own identity and no others. Nothing here joins a
 * receipt to the property table, because that join would silently authorize
 * every future change of the truth; a receipt states what was learned at the
 * version it names.
 */
export const myProbe = spacetimedb.view(
	{ name: "my_probe", public: true },
	t.array(ProbeDisclosure),
	(ctx) => [...ctx.db.probe.audience.filter(ctx.sender.toHexString())],
);

/**
 * The order two receipts are compared in when a belief has to choose one.
 *
 * Highest `propertyVersion` first, then `property` by code unit, then `id`. Every
 * key here is written by the module: `at` is excluded because it is the caller's
 * claim about when the reading was taken, and `localeCompare` is excluded because
 * its answer depends on the host's collation - a replay on another host has to
 * choose the same receipt as the first run.
 *
 * `id` is the last key so the comparison is total by construction rather than by
 * an argument about uniqueness, even though two receipts inside one scope cannot
 * share a property and a version.
 */
function compareReceipts(
	a: { id: string; property: string; propertyVersion: number },
	b: { id: string; property: string; propertyVersion: number },
): number {
	if (a.propertyVersion !== b.propertyVersion) return b.propertyVersion - a.propertyVersion;
	if (a.property !== b.property) return a.property < b.property ? -1 : 1;
	if (a.id === b.id) return 0;
	return a.id < b.id ? -1 : 1;
}

/**
 * Recompute the caller's own belief about one capability.
 *
 * A belief is derived state: one row `<audience>:<capability>`, computed from that
 * audience's own receipts and from no other table. It is disposable - deleting the
 * row loses nothing a recompute cannot restore - which is what makes it a cache
 * rather than a fact. Nothing else in the module writes `belief`: `reveal` records
 * a receipt and leaves the derivation here, because two writers for one derived row
 * is the drift the single-writer rule exists to prevent.
 *
 * The audience is `ctx.sender`, exactly as in `reveal`, and there is no audience
 * argument for the same reason: a caller-supplied audience would let one actor
 * recompute a belief in another identity's name. The scope is one row, so the only
 * rows this reducer touches are that row and the receipts that feed it.
 *
 * Determinism. Every derived column is a function of the receipts, so two runs on
 * unchanged receipts leave one identical row:
 *
 * - `id` is `<audience>:<capability>` - the scope itself, not a counter, a clock
 *   reading or an auto-increment, so the same scope is always the same key.
 * - `value` is the `value` of the receipt `compareReceipts` puts first: highest
 *   `propertyVersion`, then `property`, then `id`. It is copied, never recomputed
 *   from `property`, so a belief can only ever restate a disclosure that already
 *   left the private table through `reveal`.
 * - `confidence` is `n / (n + 1)` for the `n` receipts in scope, rounded once
 *   through `Math.fround` to the width the `f32` column stores. Without that
 *   rounding the value read back would differ from the value computed here for
 *   almost every `n`, and the equality test below would rewrite the row on every
 *   call - an idempotent reducer that looks like a failing one.
 * - `at` is the derivation stamp, `ctx.timestamp.toISOString()`. The row is
 *   written only when the derivation differs from the row already stored, so a
 *   replay on unchanged receipts rewrites nothing and leaves `at` where the
 *   content last changed - the rule `recordTrace` follows for a restated act. A
 *   delete followed by a recompute restores every derived column and restamps
 *   `at` to the instant of that recompute, because `at` is `T_ingest`: the moment
 *   the row was computed, not the moment the evidence was.
 *
 * Generation. None is stamped and none is required, which is the one place this
 * row differs from `trace` and `probe`. A belief is a fold, not an act: this
 * reducer admits nothing - it opens `capability` to refuse an undeclared id and
 * `probe` to read the receipts - so there is no policy for a row to name. The
 * receipts name theirs, and they are the durable evidence; a single column could
 * only name one of them, while `confidence` is derived from all. The generation
 * this reducer ran under is not the row's fact either: it is the latest bound
 * one by construction, already stated by `at` against the append-only
 * `generation` table, and the rebuild below would overwrite it on the next pass.
 * So a module with nothing bound is not refused here: with nothing bound
 * `reveal` writes no receipt, so the scope is empty, any stale row is deleted
 * and the reducer returns - the no-receipts path below, reached without a
 * refusal.
 *
 * Atomicity. SpacetimeDB runs a reducer as one transaction, and this reducer's
 * writes all sit inside that boundary: the delete and the insert are never
 * observable apart, because committed state is the only state any reader sees.
 * A throw anywhere - including after the delete - rolls the whole call back, so
 * there is no state in which the old belief is gone and the new one was never
 * written. `belief` is private as well, so no subscriber can be watching the row
 * while it is rebuilt.
 *
 * Disclosure. The reducer returns nothing, so no return value can carry a private
 * value, and the helper it calls answers with a comparison and nothing else. The
 * only private table it opens is `capability`, by primary key, to refuse a belief
 * about a capability that was never declared; it never opens `property`, because
 * a belief computed from the truth table would be a second disclosure path and
 * the receipt is the one that was paid for.
 *
 * With no receipts in scope there is no belief: the row is deleted and nothing is
 * written, because a belief with no observation behind it is a guess this module
 * did not make.
 */
export const recomputeBelief = spacetimedb.reducer(
	{
		/** The capability's id, `<name>@<version>`, not its bare name. */
		capability: t.string(),
	},
	(ctx, args) => {
		if (args.capability.length === 0) {
			throw new SenderError("admission-refused: a belief recompute needs a capability id");
		}

		const audience = audienceOf(ctx);

		if (ctx.db.capability.id.find(args.capability) === null) {
			throw new SenderError(
				`admission-refused: ${args.capability} is not a declared capability`,
			);
		}

		// The scope: this audience's receipts for this capability, and nothing
		// else. The audience index is the narrower of the two single-column
		// scans - a caller's own receipts are a handful - and the capability
		// predicate narrows inside it.
		const receipts = [...ctx.db.probe.audience.filter(audience)].filter(
			(receipt) => receipt.capability === args.capability,
		);

		const id = `${audience}:${args.capability}`;
		const known = ctx.db.belief.id.find(id);

		// No receipts, no belief. A stale row is removed rather than left to
		// describe evidence that is no longer there.
		if (receipts.length === 0) {
			if (known !== null) ctx.db.belief.id.delete(id);
			return;
		}

		receipts.sort(compareReceipts);

		const value = receipts[0].value;
		const confidence = Math.fround(receipts.length / (receipts.length + 1));

		// Unchanged derivation: the stored row already states it, and rewriting
		// it would only move `at`. That is what makes a second run a no-op
		// rather than a re-stamp.
		if (known !== null && known.value === value && known.confidence === confidence) return;

		// The rebuild. One scope, so the delete cannot expose a set of rows
		// half-replaced; one transaction, so the delete and the insert below
		// commit together or not at all.
		if (known !== null) ctx.db.belief.id.delete(id);

		ctx.db.belief.insert({
			id,
			audience,
			capability: args.capability,
			value,
			confidence,
			at: ctx.timestamp.toISOString(),
		});
	},
);

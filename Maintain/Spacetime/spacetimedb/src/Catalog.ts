// The catalog's write discipline: generation coherence, lease liveness, and the
// one path a `lease` row is written through.
//
// This lives in a module of its own rather than in `index.ts` because the entry
// file's named exports are reserved for values registered with SpacetimeDB -
// reducers, lifecycle hooks, views - so an ordinary helper cannot be exported
// from there. A helper that no test can import is a refusal that can only be
// argued, never shown.
//
// Two invariants are implemented here:
//
// 1. Coherence - the generation a write names is the latest one bound. The
//    check has exactly one implementation, so `bind`, `claim`, `renew`, `probe`
//    and `recordTrace` cannot grow five versions of it that disagree.
// 2. The fence - a lease write carrying a stale fence is refused, and a fence
//    never moves backwards, is never reused and is never renumbered.

// Runtime value classes live in the root package; builders and module exports
// live in `spacetimedb/server`.
import { Timestamp } from "spacetimedb";
import { SenderError } from "spacetimedb/server";
import type { InferSchema, ReducerCtx } from "spacetimedb/server";
// This sub-package resolves imports the way the SpacetimeDB module bundler
// does - without an extension - which is why it is the one place in the
// repository that does not spell `.ts`.
import type { spacetimedb } from "./Schema";

/**
 * The module's reducer context, typed by the generated schema. Annotating a
 * context as `any` erases the table row types, and a `bigint` column then
 * infers as `number` - which type-checks and fails on insert.
 */
type Context = ReducerCtx<InferSchema<typeof spacetimedb>>;

/** One row of the `lease` table, as `Schema.ts` declares it. */
export type Lease = {
	id: string;
	resource: string;
	holder: string;
	fence: bigint;
	acquiredAt: string;
	expiresAt: string;
	state: string;
};

/** The only state a grant carries while it is held. */
export const HELD = "held";

/** A grant given up on purpose. Not live, whatever its deadline still says. */
export const RELEASED = "released";

/** The largest value a `t.u64()` column can hold: 2^64 - 1. */
export const FENCE_CEILING = (1n << 64n) - 1n;

/**
 * The reducer's own clock, in the only format a lease deadline may be compared
 * against.
 *
 * Both sides of every liveness comparison are `Timestamp.toISOString()` output.
 * A stamp built from a `Date` drops the microsecond field, and `"…:00Z"` sorts
 * *after* `"…:00.500000Z"` - so a `Date`-derived deadline would read as later
 * than a microsecond-precision one inside the same second.
 */
export function nowOf(ctx: Context): string {
	return ctx.timestamp.toISOString();
}

/**
 * Whether `lease` still grants its resource at `now`.
 *
 * True only for a held grant whose deadline is **strictly** in the future. A
 * released grant and an expired grant are both not live.
 *
 * Expiry is deliberately not a state. The row stores the deadline and this
 * comparison produces the answer, so nothing has to run for the answer to stay
 * true; a stored `expired` flag would be a fact that is only correct if a timer
 * fired, and a module with no timer would report a dead grant as held forever.
 */
export function isLive(lease: Pick<Lease, "state" | "expiresAt">, now: string): boolean {
	return lease.state === HELD && lease.expiresAt > now;
}

/**
 * The shape of a stamp this module writes: `Timestamp.toISOString()`, which
 * carries microseconds and a `Z`.
 *
 * A stamp is parsed rather than handed to `new Date(text)`, because a `Date`
 * carries milliseconds and would silently drop the three digits that decide
 * whether two deadlines inside the same millisecond are the same.
 */
const STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/;

/**
 * The last instant a stamp can name: `9999-12-31T23:59:59.999999Z`, in
 * microseconds since the Unix epoch. Past it there is no stamp to write, so an
 * extension that would cross it is refused rather than clamped.
 */
export const STAMP_CEILING = 253_402_300_799_999_999n;

/**
 * The instant `stamp` names, in microseconds since the Unix epoch, or null when
 * the text is not a UTC instant in the stamp format.
 *
 * A missing fractional part and a fractional part shorter than six digits are
 * both read, because a stamp written from a `Date` carries milliseconds and one
 * this module writes carries microseconds; both name an instant.
 *
 * Null rather than a guess is the point: a deadline that cannot be read cannot
 * be extended correctly, and a caller that extended it from "now" instead would
 * silently shorten a grant it meant to lengthen.
 */
export function microsOf(stamp: string): bigint | null {
	const parts = STAMP.exec(stamp);
	if (parts === null) return null;

	const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
	const fraction = parts[7] ?? "";

	// `Date.UTC` rolls an out-of-range field over into its neighbour and maps a
	// year below 100 onto the 20th century, so each field is range-checked here
	// instead of being trusted to fail.
	if (
		year < 100 ||
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > 31 ||
		hour > 23 ||
		minute > 59 ||
		second > 60
	) {
		return null;
	}

	const millis = Date.UTC(year, month - 1, day, hour, minute, second);
	if (!Number.isSafeInteger(millis)) return null;

	// `Date.UTC` rolls 2026-02-30 over into March rather than rejecting it, so
	// the fields are read back and compared: a stamp that names a day the month
	// does not have is not a deadline, it is a typo that would silently become
	// a different one.
	const date = new Date(millis);
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}

	return BigInt(millis) * 1000n + BigInt(fraction.padEnd(6, "0").slice(0, 6));
}

/**
 * The stamp a moment is written as, in the one format every deadline column
 * carries.
 *
 * Built through `Timestamp` rather than a `Date` so the microseconds survive:
 * this is the inverse of `microsOf`, and a round trip through the two has to
 * return the text it started from.
 */
export function stampOf(micros: bigint): string {
	if (micros < 0n || micros > STAMP_CEILING) {
		throw new SenderError(
			`admission-refused: ${micros} microseconds is outside the range a deadline stamp can name`,
		);
	}

	return new Timestamp(micros).toISOString();
}

/**
 * The deadline `extensionMicros` later than `stamp`.
 *
 * A primitive rather than a rule: the caller decides what the extension is
 * measured from, because "the deadline it already carries" and "now" are two
 * different answers to a question this function cannot see.
 *
 * A non-positive extension and one that would carry the deadline past the last
 * stampable instant are both refused. A renewal that does not move the deadline
 * is not a renewal, and clamping would report success while granting less than
 * the caller asked for.
 */
export function extendDeadline(stamp: string, extensionMicros: bigint): string {
	if (extensionMicros <= 0n) {
		throw new SenderError(
			`admission-refused: an extension must be a positive number of microseconds, not ${extensionMicros}`,
		);
	}

	const instant = microsOf(stamp);
	if (instant === null) {
		throw new SenderError(
			`admission-refused: ${JSON.stringify(stamp)} is not a deadline this module can extend`,
		);
	}

	return stampOf(instant + extensionMicros);
}

/**
 * The fence that follows `previousFence`.
 *
 * The first grant for a resource starts at 1, never 0, so 0 keeps its meaning
 * as "no fence was ever issued" and a caller cannot present it by accident.
 * Every later grant is exactly one higher - including a grant that follows an
 * expiry and a grant that follows a release, because the fence counts grants
 * issued for the resource, not grants currently live. That is what makes a
 * takeover safe: the new holder's number is higher than the one a worker whose
 * lease expired still carries.
 *
 * At the top of the range this refuses instead of wrapping. A wrapped fence
 * would be a number an earlier grant already used, and the entire point of a
 * fence is that an older number can never become current again.
 */
export function nextFence(previousFence: bigint | null | undefined): bigint {
	if (previousFence === null || previousFence === undefined) return 1n;

	if (previousFence >= FENCE_CEILING) {
		throw new SenderError(
			`fence-exhausted: ${previousFence} is the last fence a u64 can hold, so no greater fence exists`,
		);
	}

	return previousFence + 1n;
}

/** Every grant ever issued for `resource`, lowest fence first. */
export function grantsFor(ctx: Context, resource: string): Lease[] {
	const grants = [...ctx.db.lease.resource.filter(resource)];

	grants.sort((left, right) =>
		left.fence < right.fence ? -1 : left.fence > right.fence ? 1 : 0,
	);

	return grants;
}

/**
 * The newest grant for `resource` - the fence a takeover has to beat - or null
 * when the resource has never been granted.
 */
export function currentGrant(ctx: Context, resource: string): Lease | null {
	const grants = grantsFor(ctx, resource);

	return grants.length === 0 ? null : grants[grants.length - 1];
}

/**
 * The grant that holds `resource` at `now`, or null when the resource is free.
 *
 * At most one grant per resource is live: `claim` refuses while one is, so the
 * first match is the only match. A resource with two live grants is a bug in a
 * reducer, not a state this predicate has to resolve.
 */
export function liveGrant(ctx: Context, resource: string, now: string): Lease | null {
	for (const grant of ctx.db.lease.resource.filter(resource)) {
		if (isLive(grant, now)) return grant;
	}

	return null;
}

/**
 * The id of the latest bound generation, or null when nothing has been bound.
 *
 * `generation` is append-only and its ids are the decimal strings `bind` writes
 * - `1`, `2`, … - dense by construction, so "latest" is the highest number and
 * never a timestamp comparison. A row whose id is not a decimal string was not
 * written by `bind` and cannot be the latest bound generation: it is skipped
 * rather than thrown on, because one unreadable row must not wedge every write
 * in the module.
 */
export function latestGeneration(ctx: Context): string | null {
	let latest: bigint | null = null;
	let latestId: string | null = null;

	for (const row of ctx.db.generation.iter()) {
		if (!/^\d+$/.test(row.id)) continue;

		const value = BigInt(row.id);

		if (latest === null || value > latest) {
			latest = value;
			latestId = row.id;
		}
	}

	return latestId;
}

/**
 * Refuse a write that names a generation other than the latest bound one, and
 * answer with the latest so the caller can record which generation it wrote
 * under.
 *
 * This is the single implementation of invariant 1. `bind` calls it after its
 * own append, and `claim`, `renew`, `probe` and `recordTrace` call it before
 * theirs; none of them compares generation ids itself.
 *
 * `index.ts` still carries a second copy of this check,
 * `assertLatestBoundGeneration`, written before this module existed. It must be
 * deleted in favour of a call to this function, not kept beside it: two
 * definitions of "latest" are two answers that will eventually differ.
 *
 * A write that names **no** generation is not stale. It is evaluated inside one
 * transaction, so the latest at that instant is the generation it is made under
 * by construction - there is no window in which it could be applied late.
 * Staleness is a property of a claim: a caller that names a generation asserts
 * the one it was bound with, and only an assertion can be checked.
 */
export function requireCoherentGeneration(ctx: Context, generation?: string | null): string | null {
	const latest = latestGeneration(ctx);

	if (generation === undefined || generation === null) return latest;

	if (latest === null) {
		throw new SenderError(
			`unbound-generation: nothing has been bound, so ${generation} cannot be the latest generation`,
		);
	}

	if (generation !== latest) {
		throw new SenderError(
			`stale-generation: the write names generation ${generation}, the latest bound generation is ${latest}`,
		);
	}

	return latest;
}

/** What a caller presents alongside a lease write. */
export type GrantGuard = {
	/**
	 * The fence the caller believes is current, or null when it is opening the
	 * first grant for a resource.
	 */
	fence?: bigint | null;
	/** The generation the caller was bound with, when it names one. */
	generation?: string | null;
};

/**
 * Write one lease row - the only path a `lease` row is written through.
 *
 * Three refusals, each thrown before anything is written:
 *
 * 1. The caller's fence is not the resource's current fence. A worker whose
 *    lease expired and was taken over still carries the old number, so its
 *    write is refused here instead of landing late on top of the new holder.
 * 2. A new grant would carry a fence that is not greater than every fence the
 *    resource has already issued, or an existing grant would be renumbered. A
 *    fence is issued once and never changes.
 * 3. The generation the caller names is not the latest bound one.
 *
 * A refusal is a thrown `SenderError`, which rolls the reducer's transaction
 * back, so a refused call cannot leave a partial write behind. The single write
 * below is reached only when all three checks have passed.
 *
 * Holder authorization is deliberately not here: `claim` legitimately writes a
 * holder that differs from the stored one, so "may this sender write this
 * grant" is the reducer's question, not the write path's.
 */
export function writeGrant(ctx: Context, grant: Lease, guard: GrantGuard = {}): Lease {
	const stored = ctx.db.lease.id.find(grant.id);
	const current = currentGrant(ctx, grant.resource);

	if (guard.fence !== undefined && guard.fence !== null) {
		if (current === null) {
			throw new SenderError(
				`stale-fence: ${grant.resource} has never been granted, so fence ${guard.fence} cannot be current`,
			);
		}

		if (guard.fence !== current.fence) {
			throw new SenderError(
				`stale-fence: ${grant.resource} is at fence ${current.fence}, not ${guard.fence}`,
			);
		}
	}

	if (stored === null) {
		if (current !== null && grant.fence <= current.fence) {
			throw new SenderError(
				`fence-regressed: ${grant.resource} is at fence ${current.fence}, so a new grant cannot carry ${grant.fence}`,
			);
		}
	} else if (stored.fence !== grant.fence) {
		throw new SenderError(
			`fence-immutable: grant ${grant.id} was issued fence ${stored.fence} and cannot be rewritten as ${grant.fence}`,
		);
	}

	requireCoherentGeneration(ctx, guard.generation);

	return stored === null ? ctx.db.lease.insert(grant) : ctx.db.lease.id.update(grant);
}

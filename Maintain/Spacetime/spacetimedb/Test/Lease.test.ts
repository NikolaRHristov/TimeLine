// What the fenced lease reducers have to prove, restated from
// `Agentic/Crate/SpacetimeCatalog/Test/Rules.rs` onto this module's `lease`
// table: one live grant per resource, a fence that only ever moves forward, and
// a write carrying an old fence or an old generation refused rather than applied
// late.
//
// The harness is the one SpacetimeDB ships for module tests: an in-memory
// datastore, a controllable clock, and the module's real reducers called the way
// the host calls them. Nothing here touches a server and nothing sleeps - time
// moves only when a test moves it with `harness.clock.set`.

// The module's tsconfig carries no node types: this file is run by node with its
// own loader (`Test/Support/Register.mjs`), not bundled into the module. The
// directives are deliberate, and tsc reports them as unused once the types are
// installed, which is when they should go.
// @ts-expect-error - `node:assert/strict` has no declarations in this program
import assert from "node:assert/strict";
// @ts-expect-error - `node:test` has no declarations in this program
import { test } from "node:test";
import { ConnectionId, Timestamp } from "spacetimedb";
import type { InferSchema } from "spacetimedb/server";
import { createModuleTestHarness, TestAuth } from "spacetimedb/server/test-utils";
import * as Catalog from "../src/index";

/** The harness, typed to this module's own schema. */
type Harness = ReturnType<typeof createModuleTestHarness<InferSchema<typeof Catalog.default>>>;

/** What `claim` accepts, as the host passes it. */
type ClaimArguments = Parameters<typeof Catalog.claim>[1];

/** What `renew` accepts, as the host passes it. */
type RenewArguments = Parameters<typeof Catalog.renew>[1];

const SECOND = 1_000_000n;
const MINUTE = 60n * SECOND;

/**
 * The instant every fixture starts from.
 *
 * The harness clock starts at the Unix epoch, which would put every deadline in
 * 1970 and make every liveness assertion a statement about the wrong century.
 */
const BASE = Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z")).microsSinceUnixEpoch;

/** The stamp `offsetMicros` after the fixture instant, in the format the module writes. */
function Stamp(offsetMicros: bigint): string {
	return new Timestamp(BASE + offsetMicros).toISOString();
}

/**
 * The one sender every call in this file is made as.
 *
 * The harness's internal auth answers with the module's own identity, so two
 * claims here are the same sender twice: what separates them is the fence, which
 * is the point of the tests rather than an artefact of the fixture.
 */
const Caller = TestAuth.internal();

/**
 * A second authenticated identity, distinct from `Caller`.
 *
 * `TestAuth.internal()` answers with the module's own identity, so a refusal
 * measured against *another* sender needs a sender the module can tell apart
 * from it. A JWT payload's `sub` decides the hex, and the connection id only has
 * to differ from the first sender's.
 */
const Other = TestAuth.fromJwtPayload(
	JSON.stringify({ iss: "test", sub: "other", aud: "timeline", exp: 4_000_000_000, iat: 0 }),
	new ConnectionId(1n),
);

/** The hex identity a call is made as, read from a reducer context. */
function HexOf(harness: Harness, auth = Caller): string {
	return harness.withReducerTx(auth, (ctx) => ctx.sender.toHexString());
}

/** A harness whose clock sits at the fixture instant. */
function Setup(): Harness {
	const harness = createModuleTestHarness(Catalog.default, Catalog);
	harness.clock.set(new Timestamp(BASE));
	return harness;
}

/** Move the module's clock. The only way time passes in this file. */
function At(harness: Harness, offsetMicros: bigint): void {
	harness.clock.set(new Timestamp(BASE + offsetMicros));
}

/** One claim, as the host would call it. */
function Claim(harness: Harness, args: ClaimArguments, auth = Caller): void {
	harness.withReducerTx(auth, (ctx) => Catalog.claim(ctx, args));
}

/** One renewal, as the host would call it. */
function Renew(harness: Harness, args: RenewArguments): void {
	harness.withReducerTx(Caller, (ctx) => Catalog.renew(ctx, args));
}

/**
 * Every committed lease row.
 *
 * Never read inside an open transaction - the harness's backend traps that - so
 * every caller here runs after the transaction it inspects has settled.
 */
function Rows(harness: Harness) {
	return [...harness.db.lease.iter()];
}

/** The grants issued for `resource`, lowest fence first. */
function Grants(harness: Harness, resource: string) {
	return Rows(harness)
		.filter((row) => row.resource === resource)
		.sort((left, right) => (left.fence < right.fence ? -1 : left.fence > right.fence ? 1 : 0));
}

/** The newest grant for `resource` - the fence a takeover has to beat. */
function Newest(harness: Harness, resource: string) {
	const grants = Grants(harness, resource);
	assert.ok(grants.length > 0, `${resource} has no grant, so this fixture is wrong`);

	return grants[grants.length - 1];
}

/**
 * The grants for `resource` that are live at `now`.
 *
 * Liveness is restated here rather than imported from the module, so this is an
 * independent oracle: a bug in the module's own `isLive` cannot make the
 * assertion that rests on it pass.
 */
function Live(harness: Harness, resource: string, now: string) {
	return Grants(harness, resource).filter((row) => row.state === "held" && row.expiresAt > now);
}

/**
 * Every committed lease row as one stable text.
 *
 * `JSON.stringify` cannot carry a `bigint`, so `fence` is mapped through
 * `String(...)`; rows are ordered by id so two snapshots of the same content
 * compare equal whatever order the datastore iterates in.
 */
function Committed(harness: Harness): string {
	return JSON.stringify(
		Rows(harness)
			.sort((left, right) => left.id.localeCompare(right.id))
			.map((row) => ({ ...row, fence: String(row.fence) })),
	);
}

/**
 * The refusal a call throws, as its message.
 *
 * A call that is accepted fails the test by name, because every caller of this
 * helper is asserting a refusal rather than merely tolerating one.
 */
function Refused(body: () => void): string {
	try {
		body();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}

	throw new Error("the call was accepted, but this test proves it must be refused");
}

/**
 * Mark a grant released, the way the `release` reducer will.
 *
 * `release` is a separate card and does not exist yet, so the row is written
 * through a reducer transaction - the same access that reducer will use.
 */
function Release(harness: Harness, id: string): void {
	harness.withReducerTx(Caller, (ctx) => {
		const stored = ctx.db.lease.id.find(id);
		if (stored === null) throw new Error(`${id} is not a grant, so this fixture is wrong`);
		ctx.db.lease.id.update({ ...stored, state: "released" });
	});
}

/** Seed `generation` rows, the way `bind` will. */
function Generations(harness: Harness, ids: readonly string[]): void {
	harness.withReducerTx(Caller, (ctx) => {
		for (const id of ids) {
			ctx.db.generation.insert({
				id,
				boundAt: Stamp(0n),
				manifestDigest: `digest:${id}`,
				policyChanged: true,
			});
		}
	});
}

// ----------------------------------------------------------- concurrent claims

test("two claims on one resource in the same tick: exactly one is granted", () => {
	const harness = Setup();

	Claim(harness, { resource: "browser", durationMicros: MINUTE });

	// SpacetimeDB serialises reducer transactions, so "the same tick" is a
	// second transaction at an unchanged clock: it runs after the first has
	// committed and sees the grant it left. There is no interleaving to
	// simulate, and the refusal is the reducer's answer rather than a race.
	const before = Committed(harness);
	const refusal = Refused(() => Claim(harness, { resource: "browser", durationMicros: MINUTE }));

	assert.match(refusal, /^lease-held: browser is held by /);
	assert.ok(
		refusal.endsWith(`under fence 1 until ${Stamp(MINUTE)}`),
		`the refusal does not name what the caller waits on: ${refusal}`,
	);

	// Refused, not queued: the table holds the one grant and nothing behind it.
	assert.equal(Committed(harness), before);

	const grants = Grants(harness, "browser");
	assert.equal(grants.length, 1);
	assert.equal(grants[0].fence, 1n);
	assert.equal(grants[0].state, "held");
	assert.equal(Live(harness, "browser", Stamp(0n)).length, 1);
});

test("a claim arriving while the lease is still live is refused, however late it is", () => {
	const harness = Setup();
	Claim(harness, { resource: "browser", durationMicros: MINUTE });

	// One microsecond before the deadline the grant is still live, so the
	// refusal does not depend on both claims sharing an instant.
	At(harness, MINUTE - 1n);
	const before = Committed(harness);

	assert.throws(
		() => Claim(harness, { resource: "browser", durationMicros: MINUTE }),
		/lease-held: browser is held by /,
	);

	assert.equal(Committed(harness), before);
	assert.equal(Live(harness, "browser", Stamp(MINUTE - 1n)).length, 1);
});

test("a refused claim does not consume a fence number", () => {
	const harness = Setup();
	Claim(harness, { resource: "browser", durationMicros: MINUTE });

	assert.throws(
		() => Claim(harness, { resource: "browser", durationMicros: MINUTE }),
		/lease-held/,
	);

	// The takeover still gets the next number: a refusal issued no grant.
	At(harness, MINUTE + 1n);
	Claim(harness, { resource: "browser", durationMicros: MINUTE });

	assert.equal(Grants(harness, "browser").length, 2);
	assert.equal(Newest(harness, "browser").fence, 2n);
});

test("claims on different resources do not interfere", () => {
	const harness = Setup();

	Claim(harness, { resource: "browser", durationMicros: MINUTE });
	Claim(harness, { resource: "figma", durationMicros: MINUTE });

	// The fence is per resource, so each sequence starts at one.
	assert.equal(Newest(harness, "browser").fence, 1n);
	assert.equal(Newest(harness, "figma").fence, 1n);
	assert.equal(Live(harness, "browser", Stamp(0n)).length, 1);
	assert.equal(Live(harness, "figma", Stamp(0n)).length, 1);
});

// --------------------------------------------------------- claim after expiry

test("a claim after the deadline is granted, with a strictly greater fence", () => {
	const harness = Setup();
	Claim(harness, { resource: "browser", durationMicros: MINUTE });
	const expired = Newest(harness, "browser");

	// Past the deadline, not at it: liveness is a strictly-future comparison.
	At(harness, MINUTE + 1n);
	Claim(harness, { resource: "browser", durationMicros: MINUTE });

	const next = Newest(harness, "browser");
	assert.ok(
		next.fence > expired.fence,
		`fence ${next.fence} is not greater than ${expired.fence}`,
	);
	assert.equal(next.fence, 2n);
	assert.equal(next.state, "held");
	assert.equal(next.expiresAt, Stamp(MINUTE + 1n + MINUTE));
	assert.equal(Live(harness, "browser", Stamp(MINUTE + 1n)).length, 1);

	// Expiry is a comparison, never a rewrite: the lapsed row is untouched.
	assert.deepEqual(
		Rows(harness).find((row) => row.id === expired.id),
		expired,
	);
});

test("a claim exactly at the deadline is granted: liveness is strictly future", () => {
	const harness = Setup();
	Claim(harness, { resource: "browser", durationMicros: MINUTE });

	At(harness, MINUTE);
	Claim(harness, { resource: "browser", durationMicros: MINUTE });

	assert.equal(Newest(harness, "browser").fence, 2n);
	assert.equal(Live(harness, "browser", Stamp(MINUTE)).length, 1);
});

// ---------------------------------------------------------- the deadline bound

/**
 * The last instant a deadline stamp can name, restated here rather than imported
 * from the module, so this is an independent oracle: a wrong ceiling inside the
 * module cannot make the assertion that rests on it pass.
 */
const LAST_STAMPABLE = 253_402_300_799_999_999n;

test("every granted claim is live at the instant it is granted", () => {
	// The property the whole fence rests on. A grant that is not live when it is
	// written leaves the resource free, so the next claim succeeds beside it and
	// two holders share one resource - which no later assertion about fences can
	// repair.
	const harness = Setup();

	// Liveness is measured at the clock the grant was written under, not at the
	// fixture instant: a short grant from a later instant is still live then.
	let offset = 0n;
	for (const duration of [1n, 1_000n, MINUTE, 365n * 24n * 60n * MINUTE]) {
		Claim(harness, { resource: "browser", durationMicros: duration });
		assert.equal(
			Live(harness, "browser", Stamp(offset)).length,
			1,
			`a ${duration}µs grant is not live at the instant it was written`,
		);
		offset += duration + 1n;
		At(harness, offset);
	}
});

test("a claim past the last stampable instant is refused, leaving the resource free", () => {
	const harness = Setup();

	// ~31,700 years. Above the ceiling `Timestamp.toISOString()` writes an
	// extended-year form that reads as *before* a four-digit year, so an accepted
	// claim would grant nothing and the next claim would take the resource.
	const before = Committed(harness);
	const refusal = Refused(() =>
		Claim(harness, { resource: "browser", durationMicros: 1_000_000_000_000_000_000n }),
	);

	assert.match(refusal, /^lease-invalid: /);
	assert.equal(Committed(harness), before, "a refused claim wrote a grant anyway");

	// The fence was not consumed either: the first real claim is still fence 1.
	Claim(harness, { resource: "browser", durationMicros: MINUTE });
	assert.equal(Newest(harness, "browser").fence, 1n);
});

test("a claim landing exactly on the last stampable instant is granted", () => {
	const harness = Setup();

	// The bound is inclusive: the ceiling names an instant, so it is a deadline
	// like any other and the grant it makes is live.
	Claim(harness, { resource: "browser", durationMicros: LAST_STAMPABLE - BASE });

	const granted = Newest(harness, "browser");
	assert.equal(granted.expiresAt, "9999-12-31T23:59:59.999999Z");
	assert.equal(Live(harness, "browser", Stamp(0n)).length, 1);

	// One microsecond past it is not stampable, so it is refused.
	const before = Committed(harness);
	assert.throws(
		() => Claim(harness, { resource: "other", durationMicros: LAST_STAMPABLE - BASE + 1n }),
		/lease-invalid: .*past the last stampable instant/,
	);
	assert.equal(Committed(harness), before);
});

// ------------------------------------------------- renew with the current fence

test("renew with the current fence moves the deadline forward and leaves the fence alone", () => {
	const harness = Setup();
	Claim(harness, { resource: "browser", durationMicros: MINUTE });
	const granted = Newest(harness, "browser");

	// Ten seconds in the grant is still live, so the extension is measured from
	// the deadline it already carries - not from now, which would hand back a
	// shorter lease than the caller asked for.
	At(harness, 10n * SECOND);
	Renew(harness, { resource: "browser", fence: 1n, extensionMicros: 30n * SECOND });

	const renewed = Newest(harness, "browser");
	assert.equal(renewed.expiresAt, Stamp(MINUTE + 30n * SECOND));
	assert.equal(renewed.fence, granted.fence);
	assert.equal(renewed.id, granted.id);

	// A renewal is the same grant, not a new one: only the deadline moves.
	assert.deepEqual(renewed, { ...granted, expiresAt: Stamp(MINUTE + 30n * SECOND) });
	assert.equal(Grants(harness, "browser").length, 1);
});

test("successive renewals keep extending from the deadline, never from now", () => {
	const harness = Setup();
	Claim(harness, { resource: "browser", durationMicros: MINUTE });

	// The clock never moves, so a renewal that measured from now would answer
	// with the same deadline three times.
	for (let renewal = 1n; renewal <= 3n; renewal += 1n) {
		Renew(harness, { resource: "browser", fence: 1n, extensionMicros: 30n * SECOND });

		const renewed = Newest(harness, "browser");
		assert.equal(renewed.fence, 1n);
		assert.equal(renewed.expiresAt, Stamp(MINUTE + 30n * SECOND * renewal));
	}
});

test("a renewal keeps the microseconds it was given", () => {
	const harness = Setup();
	At(harness, 123_456n);

	Claim(harness, { resource: "browser", durationMicros: 90n * SECOND });
	assert.equal(Newest(harness, "browser").expiresAt, Stamp(123_456n + 90n * SECOND));

	// The deadline goes out as text and comes back through the module's parser,
	// so a `Date`-shaped round trip would lose these three digits.
	Renew(harness, { resource: "browser", fence: 1n, extensionMicros: 15n * SECOND });
	assert.equal(Newest(harness, "browser").expiresAt, Stamp(123_456n + 105n * SECOND));
});

test("renew on a lapsed grant extends from now, keeping the fence", () => {
	const harness = Setup();
	Claim(harness, { resource: "browser", durationMicros: MINUTE });

	At(harness, MINUTE + 5n);
	Renew(harness, { resource: "browser", fence: 1n, extensionMicros: MINUTE });

	const renewed = Newest(harness, "browser");
	// Measuring from the spent deadline would hand back a grant that is already
	// dead; the module measures from its own clock instead.
	assert.equal(renewed.expiresAt, Stamp(MINUTE + 5n + MINUTE));
	assert.equal(renewed.fence, 1n);
	assert.equal(Live(harness, "browser", Stamp(MINUTE + 5n)).length, 1);
});

// ----------------------------------------------------- renew with a stale fence

test("renew with a stale fence is refused and the stored lease is unchanged", () => {
	const harness = Setup();
	Claim(harness, { resource: "browser", durationMicros: MINUTE }); // fence 1

	At(harness, MINUTE + 1n);
	Claim(harness, { resource: "browser", durationMicros: MINUTE }); // fence 2: takeover

	const held = Newest(harness, "browser");
	const before = Committed(harness);

	// The worker whose lease expired comes back carrying the number it was
	// given. The resource has moved past it, so the renewal must not land on
	// the new holder's grant.
	const refusal = Refused(() =>
		Renew(harness, { resource: "browser", fence: 1n, extensionMicros: 30n * SECOND }),
	);

	assert.match(refusal, /^stale-fence: browser is at fence 2, not 1/);
	assert.equal(Committed(harness), before);

	const after = Newest(harness, "browser");
	assert.equal(after.fence, held.fence);
	assert.equal(after.expiresAt, held.expiresAt);
	assert.equal(after.holder, held.holder);
	assert.equal(after.state, held.state);
});

test("a fence the resource never issued is refused, and zero is never current", () => {
	const harness = Setup();
	Claim(harness, { resource: "browser", durationMicros: MINUTE });
	const before = Committed(harness);

	for (const fence of [0n, 5n]) {
		assert.throws(
			() => Renew(harness, { resource: "browser", fence, extensionMicros: MINUTE }),
			/stale-fence: browser is at fence 1, not /,
		);
	}

	assert.equal(Committed(harness), before);
});

test("renew after a release is refused rather than reopening the grant", () => {
	const harness = Setup();
	Claim(harness, { resource: "browser", durationMicros: MINUTE });
	Release(harness, "browser:1");
	const before = Committed(harness);

	assert.throws(
		() => Renew(harness, { resource: "browser", fence: 1n, extensionMicros: MINUTE }),
		/admission-refused: grant browser:1 on browser is released, and a renewal extends a held grant rather than reopening one/,
	);

	assert.equal(Committed(harness), before);
});

test("renew on a resource that was never granted is refused", () => {
	const harness = Setup();
	const before = Committed(harness);

	assert.throws(
		() => Renew(harness, { resource: "browser", fence: 1n, extensionMicros: MINUTE }),
		/admission-refused: browser has never been granted, so there is no lease to renew/,
	);

	assert.equal(Committed(harness), before);
});

test("a renewal that does not move the deadline is refused", () => {
	const harness = Setup();
	Claim(harness, { resource: "browser", durationMicros: MINUTE });
	const before = Committed(harness);

	assert.throws(
		() => Renew(harness, { resource: "browser", fence: 1n, extensionMicros: 0n }),
		/admission-refused: an extension must be a positive number of microseconds, not 0/,
	);

	assert.equal(Committed(harness), before);
});

// ---------------------------------------------------------- fence monotonicity

test("fences never repeat and never decrease across grant/expire/release cycles", () => {
	const harness = Setup();
	const seen: bigint[] = [];
	let now = 0n;

	for (let cycle = 1; cycle <= 8; cycle += 1) {
		Claim(harness, { resource: "browser", durationMicros: MINUTE });

		const newest = Newest(harness, "browser");
		const previous = seen.length === 0 ? 0n : seen[seen.length - 1];

		assert.ok(
			newest.fence > previous,
			`cycle ${cycle}: fence ${newest.fence} is not above ${previous}`,
		);
		assert.ok(!seen.includes(newest.fence), `cycle ${cycle}: fence ${newest.fence} was reused`);
		seen.push(newest.fence);

		// At most one grant is live at any instant, and it is the newest one.
		assert.equal(Live(harness, "browser", Stamp(now)).length, 1);

		// Alternate the two ways a grant stops being live, so the sequence is
		// not proving only one of them.
		if (cycle % 2 === 0) {
			Release(harness, newest.id);
		} else {
			now = MINUTE * BigInt(cycle) + 1n;
			At(harness, now);
		}
	}

	assert.deepEqual(seen, [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n]);
	assert.equal(Grants(harness, "browser").length, 8);
});

// ---------------------------------------------------------- stale generations

test("a lease write naming a superseded generation is refused rather than applied late", () => {
	const harness = Setup();
	Generations(harness, ["1", "2"]);

	Claim(harness, { resource: "browser", durationMicros: MINUTE, generation: "2" });
	const held = Newest(harness, "browser");
	const before = Committed(harness);

	// A worker bound with generation 1 comes back and renews. That generation
	// is no longer the latest, so its write must be refused instead of landing
	// on a lease it no longer reads correctly.
	const refusal = Refused(() =>
		Renew(harness, {
			resource: "browser",
			fence: 1n,
			extensionMicros: MINUTE,
			generation: "1",
		}),
	);

	assert.match(
		refusal,
		/^stale-generation: the write names generation 1, the latest bound generation is 2/,
	);
	assert.equal(Committed(harness), before);
	assert.deepEqual(Newest(harness, "browser"), held);
});

test("the same renewal under the latest generation is accepted", () => {
	const harness = Setup();
	Generations(harness, ["1", "2"]);

	Claim(harness, { resource: "browser", durationMicros: MINUTE, generation: "2" });
	Renew(harness, {
		resource: "browser",
		fence: 1n,
		extensionMicros: MINUTE,
		generation: "2",
	});

	assert.equal(Newest(harness, "browser").expiresAt, Stamp(MINUTE + MINUTE));
});

test("a claim naming a superseded generation is refused and writes nothing", () => {
	const harness = Setup();
	Generations(harness, ["1", "2"]);
	const before = Committed(harness);

	assert.throws(
		() => Claim(harness, { resource: "browser", durationMicros: MINUTE, generation: "1" }),
		/stale-generation: the write names generation 1, the latest bound generation is 2/,
	);

	assert.equal(Committed(harness), before);
	assert.equal(Grants(harness, "browser").length, 0);
});

// ---------------------------------------------------------------- rollback

test("a refusal rolls the transaction back, so a refused call writes nothing", () => {
	const harness = Setup();
	Claim(harness, { resource: "browser", durationMicros: MINUTE });
	const before = Committed(harness);

	// A write that is legal on its own, followed by a refusal in the same
	// transaction: the whole transaction must abort, not commit the first half.
	assert.throws(
		() =>
			harness.withReducerTx(Caller, (ctx) => {
				Catalog.renew(ctx, {
					resource: "browser",
					fence: 1n,
					extensionMicros: MINUTE,
				});
				throw new Error("refused after the write");
			}),
		/refused after the write/,
	);

	assert.equal(Committed(harness), before);
});

// ---------------------------------------------------------------- disclosure

test("the lease-held refusal does not name the identity that holds the resource", () => {
	const harness = Setup();

	// Two authenticated senders, one resource: the first takes it, the second is
	// refused. `lease` is a private table, so the holder's identity is a value
	// the refused caller cannot read for itself - and a refusal is a read, so it
	// must not carry one.
	const holder = HexOf(harness);
	const second = HexOf(harness, Other);
	assert.notEqual(second, holder, "the fixture's two senders resolved to one identity");

	Claim(harness, { resource: "browser", durationMicros: MINUTE });

	const refusal = Refused(() =>
		Claim(harness, { resource: "browser", durationMicros: MINUTE }, Other),
	);

	assert.match(refusal, /held by another identity/);
	assert.ok(!refusal.includes(holder), `the refusal names the holder's identity: ${refusal}`);

	// No identity hex at all, not merely this one: the general shape is what the
	// assertion is for, so a later change that leaks a different sender is caught.
	assert.doesNotMatch(refusal, /[0-9a-f]{64}/, `the refusal carries an identity hex: ${refusal}`);

	// The diagnostic value survives: the caller still learns that the resource is
	// taken, which fence stands in the way and when that fence lapses.
	assert.match(refusal, /^lease-held: browser is held by another identity under fence 1 until /);
	assert.ok(
		refusal.endsWith(`until ${Stamp(MINUTE)}`),
		`the refusal does not name the deadline the caller waits on: ${refusal}`,
	);

	// And the refusal wrote nothing: the first sender still holds the one grant.
	assert.equal(Grants(harness, "browser").length, 1);
	assert.equal(Newest(harness, "browser").holder, holder);
});

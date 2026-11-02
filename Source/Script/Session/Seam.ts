/**
 * The seam, and the one verb that crosses it (RFC-0043 §2).
 *
 * `publish` writes a drawer record into a canvas; `withdraw` is the same verb in
 * reverse. Nothing else crosses, and the reason is that every other act is a
 * local fact: a vote ranks, a comment is addressed to a `typed` audience and so
 * cannot reach a canvas at all, a propagation copies a record that is already
 * published, and curation selects among records that are already there
 * (RFC-0027 §2). Routing any of them through the seam would give a canvas a
 * second writer and turn rule 3's ownership into a merge.
 *
 * The rule is enforced twice, because a type is not an enforcement at run time:
 * `CrossTheSeam` accepts only the two crossing verbs, and a caller that has a
 * different act to perform has exactly one function to call instead -
 * `ActWithoutCrossingTheSeam`, whose name is the rule. There is no path from a
 * named local act to the seam that does not go through a type error.
 */
import type { Context } from "./Context.ts";
import { OwnerOf, Settle, type FieldOwner, type Versioned } from "./Ownership.ts";
import { Allows, type Standing } from "./Role.ts";

/** The two acts that cross the seam. A third is a record change. */
export type Crossing = "publish" | "withdraw";

/** Every act that does not cross it. Named so a caller can enumerate them. */
export type DrawerAct =
	| "read"
	| "vote"
	| "curate"
	| "select"
	| "comment"
	| "nominate"
	| "observe"
	| "arrange"
	| "propagate";

export const CrossingActs: readonly Crossing[] = ["publish", "withdraw"];

export const DrawerActs: readonly DrawerAct[] = [
	"read",
	"vote",
	"curate",
	"select",
	"comment",
	"nominate",
	"observe",
	"arrange",
	"propagate",
];

/** Why a crossing did not happen. Each is a different sentence to render. */
export type Refusal =
	"not-a-crossing-act" | "no-session" | "not-granted" | "not-author" | "stale-write";

/** The record a crossing is about, as the drawer holds it. */
export interface CrossingRecord {
	readonly Id: string;
	/** The identity whose subkey signed the record. */
	readonly Author: string;
	/** The drawer copy's version, which is what a stale write is measured against. */
	readonly Version: number;
}

export interface CrossingRequest {
	readonly Act: Crossing;
	readonly Context: Context;
	readonly Standing: Standing;
	readonly Record: CrossingRecord;
	/** The canvas's copy of the record, when one is already published. */
	readonly Published?: Versioned<string>;
}

/**
 * What a crossing settled to.
 *
 * `Audience` and `Visibility` are returned rather than derived by the caller:
 * RFC-0012 rule 1 defines withdraw as narrowing to `internal`, which in the
 * shadow store is `hidden`, and a caller that spelled those two strings itself
 * would be a second definition of the verb.
 */
export type CrossingResult =
	| {
			readonly Crossed: true;
			readonly Act: Crossing;
			readonly Record: string;
			readonly Destination: string;
			readonly Audience: "public" | "internal";
			readonly Visibility: "public" | "hidden";
			/** The stores the crossing writes, in the order it writes them. */
			readonly Owners: readonly FieldOwner[];
	  }
	| { readonly Crossed: false; readonly Reason: Refusal };

/** Whether a value is one of the two crossing verbs. */
export function IsCrossing(Act: unknown): Act is Crossing {
	return Act === "publish" || Act === "withdraw";
}

/**
 * The only function that reaches the seam.
 *
 * The parameter type admits two values; the guard inside is for the caller that
 * arrived through `any`, a JSON payload or a stale compiled bundle. Both exist
 * because the cost of a vote crossing the seam is a canvas with two writers,
 * and that is not a defect a later test finds cheaply.
 */
export function CrossTheSeam(Request: CrossingRequest): CrossingResult {
	const Act: unknown = Request.Act;

	if (!IsCrossing(Act)) {
		return { Crossed: false, Reason: "not-a-crossing-act" };
	}

	if (Request.Standing.Identity === null) {
		return { Crossed: false, Reason: "no-session" };
	}

	if (Act === "publish") {
		return Publish(Request);
	}

	return Withdraw(Request);
}

function Publish(Request: CrossingRequest): CrossingResult {
	const Room = Request.Context.Kind === "room";

	if (Room && Request.Record.Author !== Request.Standing.Identity) {
		// A member who could publish for another would be that person's signature
		// (RFC-0012 rule 2), so this is refused before the grant is even read.
		return { Crossed: false, Reason: "not-author" };
	}

	const Act = Room ? "publish-into-room" : "publish-own";

	if (!Allows(Request.Standing, Act)) {
		return { Crossed: false, Reason: "not-granted" };
	}

	if (Request.Published !== undefined) {
		const Settled = Settle(
			"canvas-copy",
			OwnerOf("canvas-copy"),
			{ Value: Request.Record.Id, Version: Request.Record.Version },
			Request.Published,
		);

		if (Settled.Kind === "refused") {
			return { Crossed: false, Reason: "stale-write" };
		}
	}

	return {
		Crossed: true,
		Act: "publish",
		Record: Request.Record.Id,
		Destination: Request.Context.Destination,
		Audience: "public",
		Visibility: "public",
		Owners: ["shadow", "room"],
	};
}

function Withdraw(Request: CrossingRequest): CrossingResult {
	if (!Allows(Request.Standing, "withdraw", { Author: Request.Record.Author })) {
		return { Crossed: false, Reason: "not-granted" };
	}

	if (Request.Published !== undefined) {
		const Settled = Settle(
			"canvas-copy",
			OwnerOf("canvas-copy"),
			{ Value: Request.Record.Id, Version: Request.Record.Version },
			Request.Published,
		);

		if (Settled.Kind === "refused") {
			return { Crossed: false, Reason: "stale-write" };
		}
	}

	// The drawer record is not deleted: the audience narrows, which is why the
	// verb is `withdraw` and not `unpublish` - the record is still there, and it
	// is still the owner's.
	return {
		Crossed: true,
		Act: "withdraw",
		Record: Request.Record.Id,
		Destination: Request.Context.Destination,
		Audience: "internal",
		Visibility: "hidden",
		Owners: ["shadow", "room"],
	};
}

/** Where a local act is performed, now that the seam is not available to it. */
export type Home = "drawer" | "room" | "viewer";

export interface LocalAct {
	readonly Act: DrawerAct;
	/** The rule, as a value: a local act has no crossing to report. */
	readonly Crosses: false;
	readonly Home: Home;
}

/**
 * Where every named act that is not publishing is performed.
 *
 * This is the single alternative to the seam, and its name says what it does:
 * a caller holding "vote", "curate", "comment", "nominate", "observe",
 * "arrange", "propagate", "select" or "read" can only get here. The `Home`
 * answers where the act happens - the drawer for a read or an observation, the
 * room for anything that ranks, selects, comments or copies, and the viewer for
 * the one arrangement field the viewing identity owns.
 */
export function ActWithoutCrossingTheSeam(Act: DrawerAct): LocalAct {
	switch (Act) {
		case "read":
		case "observe":
			return { Act, Crosses: false, Home: "drawer" };
		case "arrange":
			return { Act, Crosses: false, Home: "viewer" };
		case "vote":
		case "curate":
		case "select":
		case "comment":
		case "nominate":
		case "propagate":
			return { Act, Crosses: false, Home: "room" };
	}
}

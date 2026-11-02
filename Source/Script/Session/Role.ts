/**
 * Who may do what, in one context at a time (RFC-0043 §4).
 *
 * The three roles are not global. An identity is the owner of its own context, a
 * member of each room it joined, and a reader everywhere else - all at once -
 * which is why a standing is a value computed for a context rather than a field
 * stored on a person. The matrix below is RFC-0043 §4 transcribed: a cell is one
 * `switch` arm, and the arm's comment names the row it answers.
 */
export type Role = "reader" | "member" | "owner";

/**
 * What a membership row carries beyond its role.
 *
 * `authority` is RFC-0013's room-scoped signer, which that record puts on the
 * membership row as a role. It is read here as a grant so a member can hold it
 * without becoming the owner of the room: the owner column of §4 is the identity
 * that owns the workspace, and a room authority is a different fact.
 */
export type Grant = "author" | "curator" | "authority" | "propagate";

/**
 * Every act the matrix decides.
 *
 * The names are the table's own rows, with the subject made explicit where the
 * table distinguishes two of them: publishing into one's own canvas and
 * publishing a record into a room are separate acts, because the second needs a
 * grant the first does not.
 */
export type Act =
	| "read-canvas"
	| "read-drawer"
	| "write-drawer"
	| "publish-own"
	| "publish-into-room"
	| "withdraw"
	| "vote"
	| "select"
	| "arrange"
	| "admit"
	| "read-presence";

/** The identity's standing in the selected context. */
export interface Standing {
	readonly Role: Role;
	readonly Grants: readonly Grant[];
	/** The identity the standing belongs to; null while no session exists. */
	readonly Identity: string | null;
	/** Whether the room admits votes from identities without a membership row. */
	readonly OpenVote: boolean;
}

/** The record an act is about, where the matrix distinguishes the caller's own. */
export interface Subject {
	readonly Author: string;
}

/** Whether a standing carries a grant. */
export function Has(Standing: Standing, Grant: Grant): boolean {
	return Standing.Grants.includes(Grant);
}

/**
 * Whether a standing may perform an act.
 *
 * `About` is required by the one row that separates "their own records" from
 * "any record": a member may withdraw what they published and nothing else. An
 * act about a record that is not named is refused rather than allowed, because
 * the failure that matters is a member withdrawing someone else's record, and a
 * default of `true` would produce it.
 */
export function Allows(Standing: Standing, Act: Act, About?: Subject): boolean {
	switch (Act) {
		// Read a canvas: every role, and the audience table (RFC-0012) decides
		// which rows arrive. A role gate here would be a second visibility rule.
		case "read-canvas":
			return true;

		// Read a drawer, write a drawer record, publish into one's own canvas:
		// the owner, and only the owner. The drawer does not travel.
		case "read-drawer":
		case "write-drawer":
		case "publish-own":
			return Standing.Role === "owner";

		// Publish a record into a room: the `author` grant, which an owner also
		// needs - widening an audience needs the author's signature (RFC-0012
		// rule 2), and owning the room is not that signature.
		case "publish-into-room":
			return Standing.Role !== "reader" && Has(Standing, "author");

		// Withdraw: a member's own records, any record in the owner's drawer.
		case "withdraw":
			if (Standing.Role === "owner") return true;
			if (Standing.Role !== "member") return false;
			return (
				About !== undefined &&
				Standing.Identity !== null &&
				About.Author === Standing.Identity
			);

		// Vote: a member and an owner, and a reader only where the room is an
		// `open-vote` room. Whether a reader's vote is worth counting is RFC-0043's
		// open question, so this answers permission and not weight.
		case "vote":
			return Standing.Role === "owner" || Standing.Role === "member" || Standing.OpenVote;

		// Select for a canvas: the owner, or a member holding `curator`. Votes rank
		// and the authority selects (RFC-0027 §2).
		case "select":
			return (
				Standing.Role === "owner" ||
				(Standing.Role === "member" && Has(Standing, "curator"))
			);

		// Arrange a canvas: every role, always, because arrangement is per viewer
		// and the viewer is the only writer (RFC-0043 §3 R3).
		case "arrange":
			return true;

		// Admit or remove a member: the owner, or a member holding `authority`.
		case "admit":
			return (
				Standing.Role === "owner" ||
				(Standing.Role === "member" && Has(Standing, "authority"))
			);

		// Read presence in a room: a member and an owner. Presence is not a record
		// and its absence means unknown, so a reader is told nothing rather than
		// told "offline".
		case "read-presence":
			return Standing.Role === "owner" || Standing.Role === "member";
	}
}

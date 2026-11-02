/**
 * One record, one owning store (RFC-0043 §3).
 *
 * A field is written by exactly one store, and a copy on the other side is a
 * projection that never writes back. That removes the merge rather than
 * resolving it: two clients cannot both be right about a field, because only one
 * of them may write it. The three cases the rule leaves are stated as shapes -
 * an append-only row never conflicts, a single-holder field is refused when the
 * caller's copy is behind, and the viewer's arrangement is the one value a
 * second writer may hold because there is no second writer.
 *
 * The refusal names the version it saw (RFC-0030 §2) instead of overwriting,
 * because last-write-wins by clock makes the winner the clock that lied hardest
 * (RFC-0040).
 */
export type FieldOwner = "shadow" | "room" | "viewer";

/** How a field may be written when two copies exist. */
export type Shape = "append" | "single" | "viewer";

/** Every field the workspace reads or writes, with its one owner. */
export type OwnedField =
	| "drawer-record"
	| "observation"
	| "event"
	| "decision"
	| "visibility"
	| "vote"
	| "comment"
	| "propagation"
	| "selection"
	| "canvas-copy"
	| "membership"
	| "grant"
	| "arrangement";

const Fields: Readonly<Record<OwnedField, { readonly Owner: FieldOwner; readonly Shape: Shape }>> =
	{
		// The drawer: the owner's own archive, and the rows it keeps.
		"drawer-record": { Owner: "shadow", Shape: "single" },
		observation: { Owner: "shadow", Shape: "append" },
		event: { Owner: "shadow", Shape: "append" },
		decision: { Owner: "shadow", Shape: "append" },
		visibility: { Owner: "shadow", Shape: "single" },

		// The canvas: the room whose canvas it is.
		vote: { Owner: "room", Shape: "append" },
		comment: { Owner: "room", Shape: "append" },
		propagation: { Owner: "room", Shape: "append" },
		selection: { Owner: "room", Shape: "single" },
		"canvas-copy": { Owner: "room", Shape: "single" },
		membership: { Owner: "room", Shape: "single" },
		grant: { Owner: "room", Shape: "single" },

		// The one field a viewer owns, keyed by context.
		arrangement: { Owner: "viewer", Shape: "viewer" },
	};

/** The store that owns a field. */
export function OwnerOf(Field: OwnedField): FieldOwner {
	return Fields[Field].Owner;
}

/** How a field is reconciled when two copies exist. */
export function ShapeOf(Field: OwnedField): Shape {
	return Fields[Field].Shape;
}

/** A value with the version it was read at. */
export interface Versioned<Value> {
	readonly Value: Value;
	readonly Version: number;
}

/**
 * What a write settles to.
 *
 * `refused` is a result and not an exception: a stale write is an ordinary
 * outcome of two devices and the caller renders it, whereas a thrown error
 * during hydration is the blank page RFC-0043 exists to forbid.
 */
export type Settlement<Value> =
	| { readonly Kind: "kept"; readonly Value: Value; readonly Owner: FieldOwner }
	| { readonly Kind: "appended"; readonly Value: readonly [Value, Value] }
	| { readonly Kind: "merged"; readonly Value: Value }
	| {
			readonly Kind: "refused";
			readonly Reason: "stale-write" | "not-owner";
			/** The version the refused writer was behind, or -1 for a wrong owner. */
			readonly Current: number;
	  };

/**
 * Settle one write against the copy that already exists.
 *
 * `Writer` is passed rather than inferred so a projection that tries to write
 * back is refused by name: the bug this catches is a canvas component saving a
 * drawer field, which is a one-character mistake to make and an invisible one to
 * find. The version comparison is `Local.Version < Remote.Version` - a copy at
 * the same version has seen everything the other has, and a copy ahead is the
 * writer's own later read.
 */
export function Settle<Value>(
	Field: OwnedField,
	Writer: FieldOwner,
	Local: Versioned<Value>,
	Remote: Versioned<Value>,
): Settlement<Value> {
	const Owner = OwnerOf(Field);

	if (Writer !== Owner) {
		return { Kind: "refused", Reason: "not-owner", Current: -1 };
	}

	const Shape = ShapeOf(Field);

	if (Shape === "append") {
		// Two rows with two ids are both correct; the order is the order they were
		// read in, and nothing downstream depends on it.
		return { Kind: "appended", Value: [Remote.Value, Local.Value] };
	}

	if (Shape === "viewer") {
		// The viewer is the only writer, so there is nothing to reconcile: the
		// local value is the whole of the truth for this identity.
		return { Kind: "merged", Value: Local.Value };
	}

	if (Local.Version < Remote.Version) {
		return { Kind: "refused", Reason: "stale-write", Current: Remote.Version };
	}

	return { Kind: "kept", Value: Local.Value, Owner };
}

/**
 * A copy read across the seam.
 *
 * `Writable: false` is a literal type rather than a boolean field: a caller that
 * tries to assign through a projection is a compile error, and the comment on
 * the type is what explains why the seam exists at all. The value is the same
 * value - a projection is not a copy with a different shape, it is the same
 * shape that may only be read.
 */
export interface Projection<Value> {
	readonly Source: FieldOwner;
	readonly Value: Value;
	readonly Writable: false;
}

/** Read a field across the seam, without the ability to write it back. */
export function Project<Value>(Source: FieldOwner, Value: Value): Projection<Value> {
	return { Source, Value, Writable: false };
}

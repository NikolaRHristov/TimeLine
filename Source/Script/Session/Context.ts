/**
 * What the rail selects (RFC-0043 §1).
 *
 * Two kinds of context and no third: the owner's own archive, and one room of
 * the owner's User Network. A context carries its own label and its own publish
 * destination as data, because both are printed and neither is derived - a
 * destination invented in code would be a second place the product's words live.
 *
 * A context is not a route and not a store: it is the pair `(kind, room)` that
 * decides which canvas is on screen and where a published record lands. The
 * drawer is deliberately absent from this type - a person has one archive and
 * the archive is not a room's, which is why nothing here can address one.
 */
export type Context =
	| {
			readonly Kind: "own";
			/** What the context tab prints, e.g. `My Files`. */
			readonly Label: string;
			/** Where a publish from this context lands, e.g. `Showcase · Network`. */
			readonly Destination: string;
	  }
	| {
			readonly Kind: "room";
			/** The room's stable id, which is the value a selection holds. */
			readonly RoomId: string;
			readonly Label: string;
			readonly Destination: string;
	  };

/** The owner's own archive. There is exactly one of these per person. */
export function Own(Label: string, Destination: string): Context {
	return { Kind: "own", Label, Destination };
}

/** One room of the owner's User Network. */
export function Room(RoomId: string, Label: string, Destination: string): Context {
	return { Kind: "room", RoomId, Label, Destination };
}

/**
 * The key a context is addressed by.
 *
 * `own` is a literal and a room is prefixed, so a room whose id happens to be
 * `own` cannot collide with the owner's own archive. Canvas maps and arrangement
 * records are keyed by this string, which is why it is stated once here.
 */
export function Key(Context: Context): string {
	return Context.Kind === "own" ? "own" : `room:${Context.RoomId}`;
}

/** Whether two contexts address the same place. */
export function Same(Left: Context, Right: Context): boolean {
	return Key(Left) === Key(Right);
}

/**
 * Whether a context is a room.
 *
 * A predicate rather than a comparison at each call site: `Kind` is a literal
 * union, and a caller that wrote `Context.Kind === "room"` inline would have to
 * be found and changed if a third kind ever appeared.
 */
export function IsRoom(Context: Context): Context is Extract<Context, { Kind: "room" }> {
	return Context.Kind === "room";
}

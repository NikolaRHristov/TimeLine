/**
 * The four states an island may be in (RFC-0043 §7).
 *
 * A client that cannot tell live rows from stale ones will act on stale ones,
 * which is why the state is named in the interface instead of being inferred
 * from whether a fetch happened to resolve. The set is closed: a fifth state is
 * a record change, not a string a caller may invent.
 *
 * `static` is the build's own view and is where every surface starts, because
 * the server-rendered props are already on screen. `live` needs a subscription
 * and `joined` needs a membership row whose key epoch is not wrapped, so neither
 * is reachable from a one-shot read.
 */
export type IslandState = "live" | "snapshot" | "static" | "joined";

/**
 * When a state's rows are current to, as `2026-11-02 12:04 UTC`.
 *
 * Rendered in UTC rather than in the reader's zone on purpose: this string is
 * part of the server-rendered HTML, and a build in one zone hydrating in another
 * would produce two different sentences for the same moment. The full value
 * stays on the element's `datetime` attribute, which is where a machine reads
 * it and where a reader's own zone belongs.
 */
export function Stamp(AsOf: string): string {
	const Parsed = new Date(AsOf);

	if (Number.isNaN(Parsed.getTime())) {
		return AsOf;
	}

	const Pad = (Value: number) => String(Value).padStart(2, "0");

	return [
		`${Parsed.getUTCFullYear()}-${Pad(Parsed.getUTCMonth() + 1)}-${Pad(Parsed.getUTCDate())}`,
		`${Pad(Parsed.getUTCHours())}:${Pad(Parsed.getUTCMinutes())} UTC`,
	].join(" ");
}

/**
 * The one line the interface prints for a state.
 *
 * RFC-0043 §7 asks for a line naming the state and its time, and for nothing
 * else: a surface that explained itself would become a status bar, and a surface
 * that stayed silent would be the fallback RFC-0003 refuses. An unknown time is
 * stated rather than omitted, because an empty half of a sentence reads as a
 * defect rather than as an absence.
 */
export function Line(State: IslandState, AsOf: string | null): string {
	return `${State} · ${AsOf === null ? "time unknown" : Stamp(AsOf)}`;
}

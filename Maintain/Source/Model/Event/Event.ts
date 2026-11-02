import type { EventRecord } from "../Generated/Types.ts";

export type { EventRecord };

/**
 * Every kind the pipeline records, as a runtime list.
 *
 * The closed set itself is declared in `Model/Schema/Entities.ts` and reaches
 * the site's Zod schema through `Source/content.config.ts`; this array is the
 * copy a caller iterates. `Schema.test.ts` asserts the two agree, because a
 * type cannot be enumerated and a list that silently fell behind would let a
 * command record an event the site then rejects.
 */
export const EventKind = [
	"scrape.started",
	"scrape.finished",
	"bookmark.added",
	"bookmark.removed",
	"list.assigned",
	"list.removed",
	"bookmark.published",
	"bookmark.hidden",
	// The vote index: a nomination, a count that moved, and the owner's three
	// decisions. `vote.cast` carries the total, never who cast it.
	"vote.nominated",
	"vote.cast",
	"vote.approved",
	"vote.rejected",
	"vote.ranked",
] as const;

export type EventKind = EventRecord["kind"];

/**
 * `<ISO>-<kind>-<subject>.json`, with `:` and `.` flattened so the name is
 * portable across filesystems. The timestamp keeps millisecond precision, so
 * two events of the same kind and subject in the same second do not collide.
 */
export function fileName(at: string, kind: string, subject: string): string {
	return `${at.replace(/[:.]/g, "-")}-${kind}-${subject.replace(/[^A-Za-z0-9_-]+/g, "-")}.json`;
}

/** The suffix every event about `subject` shares; used to find one post's trail. */
export function subjectSuffix(subject: string): string {
	return `-${subject.replace(/[^A-Za-z0-9_-]+/g, "-")}.json`;
}

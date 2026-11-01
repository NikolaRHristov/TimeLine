/**
 * The event vocabulary, in one place.
 *
 * An event is a fact with a timestamp and a subject: what happened, to what,
 * when. The kinds are a closed set because the site's Event collection
 * validates against them - a new kind is a content-schema change, not a
 * string a caller may invent.
 */

/** Every kind the pipeline records. */
export const EventKind = [
	"scrape.started",
	"scrape.finished",
	"bookmark.added",
	"bookmark.removed",
	"list.assigned",
	"list.removed",
	"bookmark.published",
	"bookmark.hidden",
] as const;

export type EventKind = (typeof EventKind)[number];

export type EventRecord = {
	at: string;
	kind: EventKind;
	subject: string;
	payload: Record<string, unknown>;
};

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

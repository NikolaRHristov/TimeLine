import { createHash } from "node:crypto";
import type { EventRecord } from "../Generated/Types.ts";

export type { EventRecord };

/**
 * Every kind the pipeline records, as a runtime list.
 *
 * The closed set itself is declared in `Model/Schema/Entities.ts` and reaches
 * the site's Zod schema through `Source/content.config.ts`; this array is the
 * copy a caller iterates. The two must agree, because a type cannot be
 * enumerated and a list that silently fell behind would let a command record an
 * event the site then rejects.
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
 * The readable half of a name: every run of characters a filesystem would
 * object to becomes one `-`.
 *
 * A slug is not an identity. `a/b` and `a?b` both flatten to `a-b`, so two
 * subjects can share one slug by construction - which is why `fileName()`
 * carries a digest as well, and why the reader confirms the record.
 */
function slug(subject: string): string {
	return subject.replace(/[^A-Za-z0-9_-]+/g, "-");
}

/**
 * Eight hex characters of the subject's SHA-256, so two subjects that flatten
 * to the same slug still name different files.
 *
 * The digest covers the subject bytes and nothing else: not the timestamp, not
 * the kind, not the payload. A subject therefore always hashes the same, and a
 * file can be matched to a subject without reading it. Eight characters is
 * enough because the digest only has to separate subjects that already share a
 * slug - it is a filename, never the proof of identity. `Shadow.events()`
 * compares each record's own `subject` for that.
 */
function digest(subject: string): string {
	return createHash("sha256").update(subject, "utf8").digest("hex").slice(0, 8);
}

/**
 * `<ISO>-<kind>-<slug>-<digest>.json`, with `:` and `.` flattened so the name is
 * portable across filesystems. The timestamp keeps millisecond precision, so
 * two events of the same kind and subject in the same second do not collide.
 */
export function fileName(at: string, kind: string, subject: string): string {
	return `${at.replace(/[:.]/g, "-")}-${kind}-${slug(subject)}-${digest(subject)}.json`;
}

/**
 * The tokens an event file about `subject` carries in its name, digest-qualified
 * first.
 *
 * The first token is what this code writes. The second is what it wrote before
 * the digest existed, and those files are still on disk in every store built
 * since - a reader that knew only the new form would orphan them.
 *
 * A token, not a suffix: a name can carry more after it. `Shadow.event()` keeps
 * two events of the same kind, subject and millisecond by appending `-2`, and a
 * suffix test would drop that second file from the trail it belongs to.
 *
 * Both are pre-filters, not proof: a token is a name, and `Shadow.events()`
 * checks the record's own `subject` before returning it. That check is what
 * makes a query correct even for a file whose name says otherwise.
 */
export function subjectTokens(subject: string): string[] {
	const base = `-${slug(subject)}`;
	return [`${base}-${digest(subject)}`, base];
}

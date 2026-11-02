# RFC-0028 - Data lifecycle and retention

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the shadow store, the
module's payload rows, the observation log, erasure **Decision class:** policy **Supersedes:** none
**Superseded by:** none **Task dependencies:** RFC-0001 (the store is the only complete history),
RFC-0021 (an observation names its observer), RFC-0014 (delete is gated on export), RFC-0018 (runs
and spans already expire), RFC-0012 and RFC-0023 (a delivered copy cannot be recalled); implementing
card to be created: "Retention terms and the tombstone row"

## Decision

A record's life is a function of its audience, and deletion is two operations with different owners:
whoever holds a ciphertext deletes it, and the provenance row survives as a tombstone.

1. **Retention is a configuration term per room, not a constant in code.** Each audience carries a
   retention window as a term in the schema RFC-0011 defines - scope `room`, with a default, an
   effect and a validation rule. The defaults are: `public` kept indefinitely, because the published
   copy is already outside the room (RFC-0023 §3); `typed` kept until the last grant for that type
   is revoked, plus a grace period; `internal` kept while the room is open and dropped at archive;
   the observation log kept for a window the room sets, defaulting to one year. Runs and spans keep
   RFC-0018's 30 days and are not restated here.
2. **A tombstone is a hash and a reason, not a stub of the text.** Deleting a payload deletes the
   ciphertext and the wrapped message key, and keeps
   `{id, author, audience, contentHash, acceptedAt, reason, signature}`. The hash is what makes the
   deletion checkable and what stops a re-import from resurrecting the row: RFC-0015's import
   verifies hashes, and a hash the room has tombstoned is refused rather than re-written. A
   tombstone holds no plaintext and no key material.
3. **A source deletion is an observation, not a delete.** When the source platform stops serving a
   post, the harvester appends an observation with `action: absent`, carrying its `observer` and
   `job` as RFC-0021 §2 requires. The shadow store keeps the last good snapshot, because the archive
   exists so that a post gone from the source is not gone from the record. The projection marks the
   row `goneAt` and keeps serving it. Nothing is deleted, and a post that reappears clears the mark.
4. **Erasure is per author, and it cannot reach another person's copy.** A person erases what they
   authored: their payload rows become tombstones, the observations they produced are pruned
   (RFC-0021 §6 already scopes an export by `observer`), and their local shadow store is theirs to
   clear. They cannot erase the room's record of what it observed, because an observation is the
   observer's authorship and not the subject's, and they cannot recall a copy already delivered to a
   member, published, or federated - RFC-0012 and RFC-0023 §5 state the same limit for the same
   reason.
5. **Erasing the room's history is not a member power.** Only the room's authority may ask for a
   room-wide erasure, and the only mechanism is delete (RFC-0014), which is gated on every member
   holding a completed export. A room cannot be quietly emptied around its members.
6. **The module enforces the room's clock; the client enforces the store's.** A blind module deletes
   by envelope metadata - audience, accepted time, class - because that is all it can read. A
   scheduled reducer is the sweeper (`AGENTS.md:588` schedules one). The shadow store prunes locally
   by the same terms, since layer 1 is client-side (RFC-0001) and no host can reach it.
7. **A retention term that would outrun an export obligation is refused.** If a window would drop a
   row before a member could export it, the configuration fails validation with a named code rather
   than silently shortening the member's history.

## Context

The store's shape fixes what deletion can mean. `Maintain/Storage/Shadow/Observation.jsonl` is
append-only and is the only place complete history lives (RFC-0001); the projection is rebuildable
from it, so deleting a projection row is not deleting a record - the next rebuild restores it. That
is why a tombstone has to be a row in the room and not a gap in a file.

The engine offers no per-row expiry. It deletes a database wholesale (`spacetime delete`,
`AGENTS.md:211`) and it schedules a reducer by time (`ScheduleAt`, `AGENTS.md:588`), so a retention
sweeper is a reducer the room already has the machinery to run. Whether a host's backups honour a
row deletion is a separate question and is left open below.

The erasure limit is arithmetic, not policy. A payload is ciphertext under a room epoch wrapped to
each member (RFC-0013); deleting the room's copy leaves every member's copy, every export, and every
published card untouched. A record that promised otherwise would be making a promise the cipher
cannot keep.

## Alternatives considered

| Option                                                   | Why not chosen                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Delete the row and leave no trace                        | a rebuilt projection restores it from the observation log, so the deletion is a lie; and a re-import silently resurrects the post          |
| Keep a truncated plaintext stub for the record's sake    | the stub is content, and content in cleartext contradicts RFC-0007 for no gain over a hash                                                 |
| One global retention constant                            | a `public` post and an `internal` note have different obligations, and RFC-0011 already makes every such number a term                     |
| Delete from the observation log when the source deletes  | the archive's whole purpose is the post the source dropped; RFC-0001 makes the log the authority, and an authority that forgets is not one |
| Let a member erase their rows from other members' copies | the copy is on someone else's device under someone else's key; nothing in the system reaches it (RFC-0012, RFC-0023 §5)                    |
| Per-row TTL inside the engine                            | no such feature is documented in `Maintain/Spacetime/AGENTS.md`; the sweeper reducer is the available mechanism                            |

## Consequences

- A tombstone is permanent and cheap: the room grows by one hash per deleted row and never by a
  stub, so a long-lived room's deletion history is smaller than its content history.
- A content hash is stable across rooms, so two rooms that observed the same post can be joined by
  it. That is a correlation handle the tombstone keeps alive, and it is the price of making a
  deletion checkable.
- Erasure is honest but incomplete from the subject's point of view. The notice says what it covers
  (RFC-0038 §3), and a person who wants more has to ask the members who hold copies - which the
  system cannot do for them.
- Retention per audience means a member can lose read access to `internal` rows at archive while
  keeping `public` ones, so an export taken after archive is narrower than one taken before it.
- A room that sets a long observation window pays for it in the host's unit model (RFC-0039), which
  is the correct place for the trade to be visible.

## Verification

| Claim                                       | Test                                                                                                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A deleted payload leaves a tombstone        | `spacetime sql <room> "SELECT id, content_hash, reason FROM tombstone"` returns the row after the redaction, and `SELECT * FROM payload` does not (intent) |
| A tombstoned hash is refused on re-import   | import an RFC-0015 export containing the tombstoned hash; the import aborts naming the line and writes nothing (intent)                                    |
| A source deletion is not a local deletion   | `grep -c '"action":"absent"' Maintain/Storage/Shadow/Observation.jsonl` grows, and the status file for that id still exists                                |
| The sweeper runs on schedule                | `spacetime logs <room> -n 50` shows the retention reducer firing at its interval (engine scheduling, `AGENTS.md:588`)                                      |
| A member cannot delete another member's row | call the redaction reducer as a member without the `authority` role; it refuses with `action-refused` and the class (RFC-0024 §7)                          |
| Delete is still gated on export             | attempt room delete with one member's export record absent; the module records intent and the host does not delete (RFC-0014)                              |
| A too-short window fails validation         | set a retention term below the export obligation in a probe room; `config show` reports the validation code rather than accepting it (RFC-0011)            |

## Open questions

- Whether deleting a row deletes it from a host's backups, snapshots and logs. `spacetime delete`
  removes a database (`AGENTS.md:211`); what a provider retains afterwards is not documented in
  anything read. UNKNOWN, and it decides whether a retention promise is a promise about the live
  database only. Spike: write a row, delete the database, then ask the host for its backup listing.
- Whether a tombstone's `contentHash` should be salted per room, which would keep the correlation
  handle from joining two rooms while keeping the deletion checkable inside one. The trade is
  between verifiability across an import (RFC-0015 compares hashes) and unlinkability across rooms.
- Whether an observation the observer later wants erased can be pruned without breaking RFC-0021
  §5's completeness number, which is computed from observations received. A pruned log makes a
  member look less complete than they were, and no rule yet distinguishes "pruned" from "never
  observed".

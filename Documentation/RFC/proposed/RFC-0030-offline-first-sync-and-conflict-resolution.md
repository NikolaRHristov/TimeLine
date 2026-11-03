# RFC-0030 - Offline-first sync and conflict resolution

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the offline queue,
ratings, comments, curation, member preferences **Kind:** architecture **Subject:** transport
**Horizon:** next **Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0017 (a
queued write is signed at authoring time), RFC-0024 §5 (actions are idempotent by id), RFC-0027 §2
(votes rank, the authority selects), RFC-0040 (a client timestamp is a claim); implementing card to
be created: "Offline queue replay and stale-write refusal"

## Decision

Three kinds of data, three rules, and no CRDT: this system removes the concurrent-write case instead
of resolving it.

1. **Append-only rows never conflict, so they get no rule.** A comment, an observation, a rating
   vote and a propagation record are inserts with a fresh id, made idempotent by RFC-0024 §5. Two
   members commenting offline produce two rows, and both are correct. A design that merged them
   would be inventing a conflict.
2. **A single-holder field is last-write-wins by the authority, not by the clock.** Curation status,
   a grant row, a room's name and its retention terms have exactly one writer: the room's authority
   for the first two, the member for their own preferences, and RFC-0027 §2 already fixes that votes
   rank while the authority selects. A write from a member who was offline is refused with
   `stale-write` naming the row's current version, rather than overwriting it. Last-write-wins by
   timestamp is refused because RFC-0040 makes a client timestamp a claim: "last" would mean "the
   clock that lied hardest", and the overwrite would leave no record of what it replaced.
3. **Per-field merge applies to exactly one record: a member's own profile and preferences.** Those
   fields are independent, written by one identity, and a merge cannot lose another person's data.
   The merge is field-wise, against a per-field version counter, and a field whose counter is behind
   loses only that field.
4. **A CRDT is refused.** Convergence is needed only where two writers may write the same field
   concurrently, and rule 2 removes that case by giving every shared field one holder. A CRDT would
   buy convergence at the cost of a structure the module must store and every client must trust, in
   exchange for resolving a conflict this design deletes. It would also break the property RFC-0012
   rule 4 relies on - one writer, one history per row.
5. **A queued action keeps its authoring signature and its authoring time.** RFC-0017 already fixes
   the signature: it is made at authoring time, not at send time. This record adds the replay rule -
   the queue carries `actionId` and `authoredAt`, the replay is accepted on identity and idempotency
   rather than on recency, and an action older than the room's retention window is refused by name
   (RFC-0028) instead of being applied to a room that has moved on.
6. **The queue is ordered within an identity and unordered across identities.** A member's own
   writes keep their authoring order on replay, because a person expects their own edits to land in
   the order they made them. No order is implied between two members, and no client may assume one.
7. **What breaks under each alternative, named.** Last-write-wins by clock breaks under a wrong
   clock and loses a write with no trace. Per-field merge breaks where fields are not independent -
   a curation decision and the reason recorded for it are one decision, and merging them separately
   can pair one member's verdict with another member's justification. A CRDT breaks single-writer
   history and adds a merge state to the schema. The rules above choose a visible refusal over a
   silent merge, and the cost is that an offline member can lose a curation edit they made while
   someone else held the field.

## Context

The specification's offline requirement is already decided in part. RFC-0017 makes offline a
first-class state, caches the shell and the last snapshot, signs at authoring time and requires a
permanent failure to surface by name rather than disappear. RFC-0024 §5 makes an action idempotent
so a replay is safe. What neither settles is what happens when two members edited the same thing.

The row shapes answer it. A rating is a vote record and not a field of the post (RFC-0017), so two
people rating the same post write two rows and the display is the aggregate plus a count of voters -
concurrency is a feature there. A comment is a post with `replyTo` (RFC-0017), so it is an insert. A
curation decision is one row with one holder (RFC-0027 §2). Every shared mutable field in this
system turned out to have exactly one writer, which is why the merge machinery has nothing left to
merge.

## Alternatives considered

| Option                                     | Why not chosen                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Last-write-wins by client timestamp        | a client clock is a claim (RFC-0040); the loser's edit vanishes with no record, and a skewed device silently wins                     |
| Last-write-wins by server arrival order    | an offline member's queued edit always arrives last and always wins, which rewards being disconnected                                 |
| Per-field merge for every row              | a comment and a vote have no fields to merge; a curation verdict and its reason are one decision and cannot be merged apart           |
| A CRDT for curation and preferences        | convergence for a conflict one-holder-per-field already removes, at the cost of a merge state in the schema and a broken history rule |
| Vector clocks on every row                 | version vectors are the CRDT's bookkeeping by another name, for the same non-problem                                                  |
| Server-side merge with the content visible | the module cannot read the payload (RFC-0007), so a semantic merge is not available to it in any form                                 |

## Consequences

- A refusal is the common outcome of a genuine race, and a refusal has to be rendered well: the
  client shows what it tried to write and what the room now holds. That is more work than a merge
  and less work than explaining a lost edit.
- The schema stays flat: no version vectors, no tombstones per field, no merge metadata on content
  rows. Only the member's preference record and the single-holder rows carry a version counter.
- A room's authority can hold a field indefinitely, and an offline member cannot take it back. That
  is the same asymmetry RFC-0027 §2 already grants the authority, made explicit at the sync layer.
- Idempotency by `actionId` (RFC-0024 §5) does the work a conflict protocol would otherwise do for
  replays, so the queue is safe to flush twice - which is what a flaky connection does in practice.

## Verification

| Claim                                  | Test                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A replayed action is applied once      | queue an action, drop the transport, reconnect twice; `spacetime sql <room> "SELECT count(*) FROM payload WHERE action_id = '<id>'"` returns 1 (intent) |
| A stale curation write is refused      | move a curation row from another client, then replay the offline edit; the result is `stale-write` naming the current version (intent)                  |
| Two offline comments both survive      | write a comment from two clients with the transport down, replay both; both rows exist with distinct ids and authors (intent)                           |
| Preference merge keeps both edits      | change two different preference fields offline from two devices; both values are present after replay (intent)                                          |
| An expired queued action is named      | hold an action past the retention window, then replay; the refusal names the window and the action id (RFC-0028, RFC-0024 §7)                           |
| No version vector exists in the schema | `spacetime describe <room> tables --json` lists no version or vector column outside the preference record and the single-holder rows (intent)           |

## Open questions

- Whether a curation verdict and its reason should be one field or two. Rule 7 names the break;
  which shape avoids it is undecided, and it decides whether a rejection can ever be edited without
  re-approving it.
- Whether a member who loses a stale-write race should be able to propose the edit again
  automatically, or must see the current value first. Automating it turns the refusal into a
  last-write-wins with extra steps.
- Whether the offline queue survives a client reinstall. The queue is signed and stored with the
  keystore's reach; whether it is in the export (RFC-0015's five files do not name it) is UNKNOWN,
  and it decides whether a lost device loses pending writes.

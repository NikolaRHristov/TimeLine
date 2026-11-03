---
title: One record, many references
rfc: 0059
category: Architecture/Data
kind: rfc
date: 2026-11-02
status: proposed
horizon: next
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: the post row, the envelope, the propagation record, the tombstone
supersedes: none
superseded_by: none
depends:
    - "RFC-0021 §4 (reconciliation inside a room, extended here across rooms)"
    - RFC-0005 (a room is a database, so no shared table exists to canonicalise in)
    - "RFC-0028 §2 (the tombstone this record propagates)"
    - |-
        RFC-0012 and RFC-0023 §5 (a delivered copy cannot be recalled); implementing card to be created: "Post key, propagation row and the retraction reducer"
statuses:
    - name: Identity is content plus author, not a row
      state: open
      evidence: the rule names no file or command
    - name: Across rooms, five copies beat one canonical row with references
      state: open
      evidence: the rule names no file or command
    - name: Repost and quote are different, and only one is a duplicate
      state: open
      evidence: the rule names no file or command
    - name: A retraction is signed by the author and addressed to the post
      state: open
      evidence: the rule names no file or command
    - name: A retraction travels one hop further than the copy did, and then stops
      state: open
      evidence: the rule names no file or command
    - name: A conflict between two copies is visible, never resolved
      state: open
      evidence: the rule names no file or command
    - name: The tombstone hash is the join key, and that is the price
      state: open
      evidence: the rule names no file or command
---

## Decision

A post's identity is the pair of its author's key and its content hash. A room that holds a post
holds its own row for it; a repost is a reference; and a retraction is a signed message to copies
rather than a delete.

1. **Identity is content plus author, not a row.** `postKey = H(authorKey ‖ contentHash)`. Two rows
   in two rooms with the same `postKey` are the same post. No registry assigns the key and no
   service resolves it - it is computable by anyone holding the two rows, which is what keeps
   RFC-0005's "no shared table" intact.
2. **Across rooms, five copies beat one canonical row with references.** Each room stores its own
   row: its own ciphertext under its own epoch, its own audience, its own `acceptedAt`, deduplicated
   inside the room by `postKey`. A reference to a canonical row in another room would be a
   cross-database read on every page (RFC-0005) and would put that row in one room's custody, making
   one authority the censor of four others.
3. **Repost and quote are different, and only one is a duplicate.** A repost of identical content by
   the same author shares the `postKey`: one record, and the repost is a `propagation` row. A quote
   with commentary is new content by a new author, with its own `postKey` and a reference to the
   quoted one - that is attribution (RFC-0060), not duplication.
4. **A retraction is signed by the author and addressed to the post.**
   `retract(postKey, reason, signature)`. A room holding the row marks it retracted and keeps the
   tombstone (RFC-0028 §2). Propagation is per copy: each room that received a copy must receive the
   retraction, and a room that never receives it keeps serving the copy - which is stated rather
   than hidden.
5. **A retraction travels one hop further than the copy did, and then stops.** A copy already
   delivered to a member, exported or published is out of reach (RFC-0028 §4, RFC-0023 §5). The
   retraction's job is to stop the next delivery, not to chase the last one.
6. **A conflict between two copies is visible, never resolved.** Two rooms holding one `postKey`
   with different ciphertexts means one was tampered with or the hash collided; the client shows
   both and merges neither. RFC-0021 §4's divergence event is the same rule at the observation
   layer.
7. **The tombstone hash is the join key, and that is the price.** RFC-0028 §2 keeps `contentHash` so
   a deletion stays checkable; the same hash is what lets two rooms' copies be matched. Cross-room
   deduplication and cross-room unlinkability cannot both hold, and this record chooses
   deduplication, because a retraction that cannot find its copies is a retraction that does
   nothing.

## Context

RFC-0021 §4 decides reconciliation _inside_ a room: one post row per status id, built from the
newest observation, with a divergence event when two observers report different hashes. Nothing
decides what happens when the same post is observed by five rooms, which is the ordinary case for a
public timeline - RFC-0005's product shape is many small rooms over the same sources.

The projection's key is the reason the question is open rather than settled. In
`Maintain/Spacetime/spacetimedb/src/Schema.ts:17` the `post` table's primary key is documented as "X
status id - the same key the file store uses, and the filename it becomes". An identity that means
something only on one platform cannot deduplicate a post that was copied between two platforms, and
it cannot survive the platform.

The archive already holds the duplicate case in miniature.
`ls Maintain/Storage/Shadow/Post/*.json | wc -l` prints 209 and each file is keyed by status id, so
two archives of the same post in two rooms would be two files with no field relating them.

## Alternatives considered

| Option                                            | Why not chosen                                                                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| One canonical row plus references from every room | the reference is a cross-database read per page, and the canonical room's authority becomes the censor of every room that references it |
| One shared post table across rooms                | RFC-0005 rejects it: one bad rule exposes every room at once                                                                            |
| Deduplicate by the platform's id                  | an id is per platform; a post copied between two platforms has two ids and one author                                                   |
| Deduplicate by hash alone                         | a hash proves the bytes, not the author (RFC-0013); two people quoting the same paragraph would collapse into one post                  |
| Chasing retractions into delivered copies         | the copy is on someone else's device under someone else's key (RFC-0028 §4)                                                             |
| Resolving a hash conflict by taking the newer     | a conflict means one copy is not what the author signed; newer is not truer                                                             |
| A retraction that deletes the row                 | a rebuilt projection restores it from the observation log, so the deletion would be a lie (RFC-0028's own reasoning)                    |

## Consequences

- A popular post costs every room that holds it a row, so cross-room duplication is a storage cost
  with no deduplication dividend. RFC-0067 prices it and deduplicates the payload inside one store.
- A retraction is best-effort across rooms, so the client must render "retracted" and "this copy
  predates the retraction" as different states.
- `postKey` makes cross-room correlation cheap for anyone holding both rows, an observer included.
  That is the price of a retraction that can find its copies.
- A quote is never deduplicated, so a chain of quotes grows the archive with every hop. That is
  authorship, and the alternative is collapsing people's words into one another's.
- Reconciliation inside a room keeps RFC-0021's divergence rule and gains a second key to compare,
  so the divergence event names both `postKey` and the two hashes.

## Verification

| Claim                           | Test                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity is author and content  | compute `postKey` for two rows with the same text and different authors: different; same author and same text: equal (intent, unit test under `Maintain/Source/Test`) |
| Five rooms hold five rows       | propagate one post to five fixture rooms; five `post` rows carry one `postKey` (intent)                                                                               |
| A repost is a propagation       | repost from the same author; `select count(*) from post` is unchanged and one `propagation` row appears (intent)                                                      |
| A quote is new content          | quote with commentary; a new `postKey` exists and the row references the quoted key (intent)                                                                          |
| A retraction marks, not deletes | call `retract`; the tombstone exists, the payload does not, and the row reads `retracted` (RFC-0028, intent)                                                          |
| A missed retraction is visible  | withhold the retraction from one room; its client renders the copy as unretracted with the post's age (intent)                                                        |
| A hash conflict is refused      | two rooms hold one `postKey` with different hashes; the client shows both and merges nothing (intent)                                                                 |

## Open questions

- Whether `postKey` should include a room or a salt, which would make cross-room correlation
  impossible and cross-room retraction impossible with it. RFC-0028's tombstone question is the same
  question one layer down.
- Whether a retraction should be able to reach a room that holds a copy through the federation
  allowlist (RFC-0022 §3) when that room's authority refuses to act. The record says the room is
  sovereign and the copy stands.
- Whether an edit is a new `postKey` or a version of the old one. A new key makes an edit a repost
  and a retraction of the old key; a version makes a key mutable and a hash no longer an identity.
- UNKNOWN whether the engine indexes a compound key over two hashes cheaply enough for a large
  archive. Spike: 100,000 inserts against an `(author, hash)` index, then a lookup by the pair.

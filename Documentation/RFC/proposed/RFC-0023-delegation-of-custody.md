# RFC-0023 - Delegation of custody

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the delegation table,
the client's custody screen, revocation, publication **Kind:** contract **Subject:** identity
**Horizon:** next **Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0012
(audience is who may read; this record is where a copy is held), RFC-0013 (revocation rotates an
epoch), RFC-0014 (grants and membership), RFC-0016 (the host is a holder), RFC-0026 (a peer is a
holder); implementing card to be created: "Delegation rows, revocation and the custody screen"

## Decision

A delegation is a signed, revocable grant that names a holder and a scope of the delegator's own
content. It decides where a copy is held, never who may read it.

1. **Shape.** `{id, delegator, holder, scope, at, notAfter, signature, revokedAt}`, written to the
   delegator's identity record and mirrored into the room so the room can refuse to serve a scope it
   is no longer authorized to hold.
2. **Scope is narrower than authorship.** A delegator may delegate content they authored, and
   content granted to them by an audience grant (RFC-0014). Never another member's content: a
   delegation is the delegator's own signature over their own rows.
3. **Three kinds of holder, one record.** A room's host (RFC-0016), a peer that carries or
   replicates the room (RFC-0026), and the publication host that serves `public` content as the
   static site (RFC-0012, RFC-0017). Publication is the third case and it is a delegation, not a
   visibility flag: publishing moves a copy out of the room and onto a host that holds no key for
   anything else.
4. **Holding is not reading.** A holder that was not granted the audience receives ciphertext it
   cannot open (RFC-0007, RFC-0013). A peer holding `typed` rows holds bytes, and reading them needs
   the epoch, which is wrapped per member and per room. The two questions stay separate by
   construction.
5. **Revocation rotates, and only forward.** Revoking a delegation deletes the row, appends an
   event, and rotates the epoch for the delegated scope (RFC-0013), because the holder already holds
   the ciphertext it was given. Revocation stops future writes; it cannot recall a copy, and
   RFC-0012 already states the same limit for a federated push.
6. **No one delegates on another's behalf.** A room authority, a curator or an operator cannot
   create, extend or renew a delegation over a member's content. This is the property that
   distinguishes a delegation from a visibility flag: a flag is set by whoever holds the room, and a
   delegation is signed by whoever owns the row.
7. **Delegations outlive the room.** Deleting a room (RFC-0014) destroys the database and leaves any
   live delegation elsewhere intact; the deletion intent names the delegations it knows about, so a
   person is told what they are about to leave behind.

## Context

Audience and custody are currently one question in the specification, and RFC-0012 separates them
only implicitly: its table answers "who may read", and the column "Leaves the room" answers "is a
copy held elsewhere" as a side effect. That is why publishing, federation and hosting all look like
variations on visibility today.

They are not. Publishing to `public` puts a copy on a static host that has no database, no
membership and no key; a federated push puts a copy in another room that can re-serve it; hosting
puts the room's only copy on one provider. Each is a decision by the person whose content it is,
each is revocable separately, and each has a different blast radius when revoked. A single flag
cannot carry three revocation semantics.

The mechanical difference is measurable. A visibility change is a write the module authorizes from
the membership row; a delegation is a write the module authorizes from a signature (RFC-0013),
because the delegator may not be present when the holder takes the copy. That is the same
distinction RFC-0012 rule 2 already draws for widening an audience, applied to a different question.

## Alternatives considered

| Option                                               | Why not chosen                                                                                                          |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| One `visible` flag per post covering all three cases | three revocation semantics behind one boolean: revoking publication also revokes hosting, or neither                    |
| Delegation as a membership grant                     | a grant authorizes what a member does inside a room; a holder may hold no membership at all (the static host)           |
| Delegation as part of the audience model (RFC-0012)  | audience answers who may read; a holder may be forbidden to read what it holds, which no audience value expresses       |
| Operator-managed delegations                         | an operator who can move a member's content to another host can move it anywhere, which is the power the model denies   |
| Revocation that deletes the copy                     | a holder that has the ciphertext and no key still has the ciphertext; deletion is a promise only an honest holder keeps |
| Per-post delegations                                 | cost is posts x holders, and a person changing host rewrites every row; the scope is a selector, not a row              |

## Consequences

- The client gains a custody screen: what is held where, by whom, until when, and one button per
  holder to revoke. It is the first screen the product needs that has no analogue in a normal social
  client.
- Revocation is a key operation, so a delegation change is a key epoch change and every member's
  client learns about it (RFC-0013).
- Publication becomes revocable in the same vocabulary as everything else, which means the site's
  publication step is a delegation lookup rather than a status filter.
- A delegation with `notAfter` expires without an action, so an abandoned host stops holding by
  itself; the record makes expiry the default and permanence the exception.
- A room cannot promise a member that nothing was copied: the delegations it knows about are named
  at deletion, and a delegation made outside the room's knowledge is what RFC-0020 lists as
  undefended.

## Verification

| Claim                                       | Test                                                                                                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Only the delegator can delegate             | a room authority attempts to delegate a member's `typed` scope: `delegation-forbidden` and `select count(*) from delegation` unchanged (intent) |
| A holder without the audience reads nothing | a peer holds a `typed` scope and attempts to decrypt with its own keys: failure (intent)                                                        |
| Revocation rotates the epoch                | revoke a publication delegation; `select max(epoch) from key_epoch` increases and the next public post carries the new epoch                    |
| Revocation is forward-only                  | a copy taken before revocation still decrypts for the holder that held the epoch (intent, stated as a limit)                                    |
| Delegations are enumerable per person       | `maintain custody list --json \| jq -r '.[] \| [.holder, .scope, .notAfter] \| @tsv'` prints one line per live delegation                       |
| Deletion names what it leaves behind        | a room with one live peer delegation records a deletion intent whose `delegations` array names the peer (intent)                                |
| Expiry needs no action                      | a delegation with `notAfter` in the past stops serving the scope without a write (intent)                                                       |

## Open questions

- Whether a delegation to a peer (RFC-0026) is a different record from a delegation to a host,
  because a peer also carries traffic and therefore learns metadata the host would. The record
  assumes one shape with a `kind` and leaves the metadata consequence to RFC-0026.
- Whether a delegator can delegate a scope they hold through another delegation (re-delegation).
  This record says no, because a chain of custody with no root is a chain nobody can revoke.
- UNKNOWN whether the module can refuse to serve a scope whose delegation was revoked while the
  holder still holds the epoch - it can stop writing, and it cannot unlearn. Spike: revoke, then
  read the scope as the holder's client against a room that still has the epoch row.
- Whether publication delegation is per post or per list. Per post is what the static site renders;
  per list would let a person publish a shelf and withdraw it in one action, which the vote
  subsystem (RFC-0017) would need to understand.

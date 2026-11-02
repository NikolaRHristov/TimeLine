# RFC-0014 - Room lifecycle and invitations

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the module's room
tables, invitations, grants, archival and deletion **Decision class:** product **Supersedes:** none
**Superseded by:** none **Task dependencies:** RFC-0005 (a room is a database), RFC-0012 (audiences
and propagation), RFC-0013 (an invitation carries wrapped key epochs), RFC-0015 (deletion is gated
on export); t_1621cc5c (substrate research); implementing card to be created: "Room lifecycle,
invitations and grants"

## Decision

A room has four states and a side state, a membership has five, and an invitation has three.

```
room:        created -> open -> archived -> deleted
                          \-> suspended          (host-imposed, RFC-0016)
membership:  invited -> joined -> granted -> left | removed
invitation:  issued -> accepted | expired | revoked
```

**An invitation carries** an invite id (content-addressed), the room's database identity, the room's
name, the inviter's identity, the room authority's signature over the invite, `expiresAt`,
`maxUses`, and the wrapped key epochs (RFC-0013). When the invitee's public key is not known yet -
the normal case for a first invitation - the epochs are wrapped to a one-time claim code carried in
the link fragment, and the claim code is spent on the first accept.

**Join-without-seeing.** Accepting an invitation creates a membership row with `grant = none`. The
member may read room metadata - name, member count, the audience types the room declares - and no
content. This is the product's central privacy claim expressed as a lifecycle step, and it means the
empty state is a designed screen, not an error.

**Grant.** A grant row is `{identity, scope, at, by, signature}`. A scope is an audience tier
(`typed:<type>`), a channel, or `propagate`. Revocation deletes the row, appends an event, and
rotates the key epoch when the scope carried key material.

**Leaving.** Content the member authored stays, and stays attributed. The member loses read access
and keeps the right to export what they authored or were granted (RFC-0015). Removal by the
authority is the same transition with a recorded reason.

**Archive is the default way to close a room**, because it destroys nothing: no new rows, no new
members, everything readable and exportable by those who already hold it.

**Delete destroys the database** and is permitted only when every member has a completed export
recorded, or when a retention window fixed at room creation has elapsed. The module records a
deletion intent; the host performs the delete after the check. A room cannot be deleted while a
member has not exported.

## Context

No room, membership, invite or grant table exists. The module has six tables - `post`, `author`,
`media`, `observation`, `event`, `membership` - and the last one is a curated-list relation keyed
`<list>:<handle>` (index.ts:94-107), an unrelated meaning of the same word. RFC-0019 resolves that
collision; this record needs the name, so the glossary decision lands first or in the same change.

Nothing can be created, joined, invited to or closed today: `spacetime publish` creates a database
and that is the whole lifecycle. The invitation is the first thing the product needs that the engine
does not provide as a primitive, and the claim code exists because a first-time invitee has no key
to wrap to.

## Alternatives considered

| Option                                         | Why not chosen                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Invitation creates the membership row directly | no consent step and no expiry; the inviter decides who is in, which is the wrong direction for a private room |
| A shared link carrying the room key            | anyone who sees the link is a member, and revocation means rotating the key for everyone                      |
| Join grants read immediately                   | destroys the join-without-seeing guarantee that makes an invitation safe to accept                            |
| Delete on close                                | destroys what people authored, which the product explicitly refuses                                           |
| Rooms that only grow                           | an archive state costs one boolean and prevents the only destructive action people actually need              |
| Claim codes stored in the clear in the invite  | a stored code is a stored password; it must be spent, not kept                                                |

## Consequences

- Two-step joining means a room can be joined and empty, so the client needs an empty state that
  explains the wait rather than looking broken.
- An invitation must be resolvable by a non-member: the client needs to reach a room identity and
  read its metadata before membership exists, which depends on the open question below.
- Deletion is gated on export, so a room can refuse to die while one member has not exported. That
  is the intended friction.
- The word `membership` must be resolved before the room tables land, or two relations share a name
  and every query becomes ambiguous.
- Archival must be enforced by the module; if the engine cannot freeze a database, the host must
  revoke write permission instead, which is a weaker guarantee.

## Verification

| Claim                           | Test                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| An invitation expires           | issue one with `expiresAt` in the past, accept it: `invite-expired` with the invite id                                 |
| Joining grants nothing          | accept, then the member's subscription returns 0 rows from `post` and 1 from `room` (intent, needs the tables)         |
| A grant opens exactly its scope | grant `typed:alpha`; the same subscription returns alpha rows only                                                     |
| Revocation is immediate         | delete the grant row; the subscription stops delivering within one transaction                                         |
| Leaving keeps authorship        | leave the room, export, and the posts authored are still present and attributed (intent, shares RFC-0015's round trip) |
| An archived room refuses writes | `spacetime call <room> observe ...` on an archived room errors and `select count(*) from post` is unchanged            |
| A claim code is single-use      | accept the same invitation twice: the second accept is `invite-spent`                                                  |
| Deletion is gated               | attempt delete with one member unexported: refused, and the refusal names that member                                  |

## Open questions

- Whether a non-member can call a reducer on a database at all, or whether connecting is itself the
  membership boundary. If connecting is the boundary, an invitation cannot be accepted by the
  invitee's client and the claim code has to be redeemed by the authority on their behalf. UNKNOWN;
  spike: publish a local room, call a reducer from an identity with no membership row, read the
  result.
- Whether the engine can freeze a database against writes for archival, or whether archival is a
  module-level check that a newer module could lift.
- Whether an invitation should be a row in the room (visible to members) or a signed document handed
  out by the inviter (invisible until accepted). The record assumes the signed document, because a
  revoked invite should leave no trace in the room that a member can enumerate.

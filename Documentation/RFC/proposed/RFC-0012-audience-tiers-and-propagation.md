---
title: Audience tiers and propagation
rfc: 0012
category: Contract/Data
kind: rfc
date: 2026-11-02
status: proposed
horizon: next
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: the module, the envelope (RFC-0007), the static site's publication step, federation
supersedes: none
superseded_by: none
depends:
    - RFC-0005 (rooms are databases)
    - RFC-0007 (the envelope)
    - |-
        RFC-0013 (widening needs a signature); t_1621cc5c (substrate research); implementing card to be created: "Audience tiers and the propagation record in the module"
statuses:
    - name: Narrowing is unilateral by the author
      state: open
      evidence: the rule names no file or command
    - name: Widening requires the author's signature over the new audience (RFC-0013)
      state: open
      evidence: the rule names no file or command
    - name: A federated push is a call from the sending room's module to the receiving...
      state: open
      evidence: the rule names no file or command
    - name: "Every move appends a `propagation` row - `{id, postId, from, to, actor, at,..."
      state: open
      evidence: the rule names no file or command
    - name: "`internal` content is excluded from export and from federation by the module,..."
      state: open
      evidence: the rule names no file or command
---

## Decision

Four audiences exist, each with a guarantee that the other three do not give, and a post moves
between them only by a recorded decision.

| Audience         | Who may address it                          | Who may read                                              | Leaves the room                          | May be republished                |
| ---------------- | ------------------------------------------- | --------------------------------------------------------- | ---------------------------------------- | --------------------------------- |
| `public`         | any member holding the `author` grant       | any identity, member or not                               | yes - into `Source/Content/` and export  | yes, with attribution             |
| `typed`          | any member; the type must exist in the room | members holding a grant for that type                     | no                                       | no                                |
| `internal`       | any member                                  | every member of the room                                  | no - not even into an export             | no                                |
| `federated-push` | a member holding the `propagate` grant      | the receiving room's members, per the copy's own audience | yes, as a copy addressed to another room | no - a copy is never re-addressed |

Five rules make that table enforceable.

1. Narrowing is unilateral by the author: `public` to `typed` to `internal` takes effect at the next
   read, with no other consent.
2. Widening requires the author's signature over the new audience (RFC-0013). No member, curator or
   room authority can widen another person's post; a curator selects what is published, never what
   is addressed.
3. A federated push is a call from the sending room's module to the receiving room's reducer
   (RFC-0005), carrying the envelope and a propagation id. The receiving room records the copy with
   `origin` naming the sending room; the sending room records the delivery. A push that is not
   acknowledged is `pending`, not delivered.
4. Every move appends a `propagation` row - `{id, postId, from, to, actor, at, signature}` - in the
   room where the post lives. A post's audience is derived from its latest propagation row and is
   never written directly: one writer, one history.
5. `internal` content is excluded from export and from federation by the module, not by the
   exporter.

## Context

Today audience is one string on the post table - `visibility: shadow | public | hidden`
(`Maintain/Spacetime/spacetimedb/src/index.ts:32`) - set by a reducer that accepts any id and any
value from any caller (index.ts:227-234). It is a publication switch, not an audience model: it
cannot express "these nine people, not those two", it keeps no history of who changed it, and it
does not bind the change to the author.

The shadow store's three states remain the states of the public projection; this record does not
replace them, it places them inside a larger set. `shadow` is a post no audience has been chosen
for, `hidden` is a post withdrawn from `public` by its author.

RFC-0005 records how visibility is enforced at delivery - a per-user view keyed on `ctx.sender` -
and RFC-0007 leaves the envelope's audience field undefined beyond its existence. This record
decides what that field may contain and what each value promises.

## Alternatives considered

| Option                                        | Why not chosen                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A per-post reader list (one row per reader)   | cost is members x posts, and every membership change rewrites every row's access list                            |
| Audience as a property of the ciphertext only | the module could not enforce rate or quota per audience, and could not refuse a widening it cannot see           |
| A single `private` flag                       | no typed audiences, no federation, and no way to publish to a subset while keeping the rest internal             |
| Federation by shared table                    | a shared table becomes the single point of failure the per-room boundary exists to avoid (RFC-0005)              |
| Widening allowed by a room authority          | an authority that can publish a member's internal writing is a moderation power the privacy claim cannot support |

## Consequences

- A read costs one more lookup per row: the grant that admits it.
- The static site can render only `public`, so the publication step is a filter with a name.
- A widening cannot be undone for copies already pushed: a federated copy is independent of its
  origin, and the sender's later narrowing does not reach it. That is stated, not prevented.
- The module needs the author's public key to verify a widening, which couples this record to
  RFC-0013 and to the certification of keys.
- `internal` content is deliberately unexportable, which makes it the one class of content a person
  can lose by leaving a room. RFC-0015 states the exception.
- A push needs an acknowledgement path across two databases, which the engine's inter-database calls
  make asynchronous.

## Verification

| Claim                                 | Test                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Widening needs the author's signature | `spacetime call <room> propagate '"<postId>"' '"public"'` from a second identity errors and `select count(*) from propagation` is unchanged |
| Narrowing is unilateral               | the same call from the author appends exactly one `propagation` row                                                                         |
| Audience is derived, never written    | `select count(*) from propagation where post_id = '<id>'` is at least 1 for any post whose audience differs from its creation value         |
| `internal` never exports              | `maintain export --room <id> \| jq 'map(select(.audience=="internal")) \| length'` prints 0 (intent until RFC-0015 lands)                   |
| `typed` content is not published      | `pnpm maintain store publish`, then `grep -r <typed text> Source/Content` finds nothing                                                     |
| A push is pending until acknowledged  | push to a stopped receiving room, read `propagation.state` = `pending`; start it and replay, read `delivered` (intent, needs the reducer)   |
| A copy is never re-addressed          | calling `propagate` on a `federated-push` post errors with `audience-fixed` (intent)                                                        |

## Open questions

- Whether a typed audience is a key (a per-type key epoch) or an envelope field the module checks.
  The envelope field is cheaper and weaker: the host still cannot read the payload, but the module
  can, and the module runs on the host.
- Whether a receiving room can be trusted with a copy at all. It can publish what it received; that
  is a leak by a reader and RFC-0020 lists it as undefended.
- UNKNOWN whether the engine lets a module record delivery in the same transaction as the outbound
  call. The module documentation in `Maintain/Spacetime/AGENTS.md` describes inter-database calls as
  asynchronous, which would make `pending` the permanent state until a later acknowledgement.
- Spike: publish two local rooms and push between them, then read both event logs for the
  propagation id. This settles the acknowledgement question and the transaction boundary together.

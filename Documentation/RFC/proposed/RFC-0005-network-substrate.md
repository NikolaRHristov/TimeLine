# RFC-0005 - Network substrate

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the SpacetimeDB
module, room lifecycle, identity, federation **Decision class:** product **Supersedes:** none
**Superseded by:** none **Task dependencies:** t_1621cc5c (research), RFC-0001, RFC-0004

## Decision

A room is a database, not a table.

Each room is its own SpacetimeDB database, published from a shared module. Joining a room
establishes a connection and a membership row; it does not grant read access. Visibility is decided
per row by the module, from the membership row and the row's declared audience, in the same
transaction that would serve it.

Rooms federate by calling reducers in other rooms' databases - the mechanism available since
v2.14.0 - rather than by sharing a table. A person's data is exportable from the room they authored
it in, without the room's cooperation.

## Context

The current deployment is a single database holding one archive. The product shape is many small
networks of a handful of people each, with invitations between them, where a member may be connected
yet see nothing until granted. That is a permissions question first and a hosting question second,
so the decision above is deliberately about where the boundary sits: per database, not per row in a
shared table.

## Alternatives considered

| Option                                                       | Why not chosen                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| One database, rooms as tables, permissions per row           | one bad rule exposes every room at once; blast radius is the whole network |
| One database per person, rooms as joins                      | invitation and revocation become distributed transactions                  |
| Rooms as databases, membership in a shared identity database | a shared table becomes the single point of failure it was meant to avoid   |

## Consequences

- Publishing a module per room means an upgrade is a rollout, not a single publish; a broken module
  must be caught before it reaches every room.
- Cross-room reads require an explicit call, which is slower but auditable.
- Export can be scoped to a room, which makes the exit guarantee tractable.

## Verification

| Claim                         | Test                                                           |
| ----------------------------- | -------------------------------------------------------------- |
| Connection without visibility | connect as a non-member, subscribe to a table, receive no rows |
| Membership grants             | add the membership row, the same subscription returns rows     |
| Revocation is immediate       | remove the row, the subscription stops delivering              |
| Rooms are isolated            | a query in room A cannot address room B's tables               |
| Export is per person          | export returns only rows authored by that identity             |

## Open questions

- Whether the engine supports per-row read permission at the subscription layer, or only filtering
  inside the module. This is UNKNOWN and decides whether the isolation above is enforceable or
  advisory.
- Whether a module can gate a subscription by identity, or only filter results after they are
  selected.
- Upgrade strategy across many databases: staged rollout, version pinning, or a compatibility
  window.

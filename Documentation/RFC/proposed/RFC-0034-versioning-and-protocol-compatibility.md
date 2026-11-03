# RFC-0034 - Versioning and protocol compatibility

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the schema, the client
protocol, the artifact, the compatibility window **Kind:** contract **Subject:** transport
**Horizon:** next **Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0011
(`schemaVersion` and the term lifecycle), RFC-0002 (derivation from one schema), RFC-0025 §1 (the
artifact is content-addressed), RFC-0016 §2 (staged rollout and a window); implementing card to be
created: "Version triple in the health view"

## Decision

Three versions move independently, each with one owner, and a room may lag exactly one of them for a
bounded window.

1. **The schema version belongs to the module.** RFC-0011's `schemaVersion` increments when a term
   is added or removed; this record fixes the rule: an additive change (a new optional column with a
   default, a new term with a default) is a minor and is the only compatible table change the engine
   allows (`AGENTS.md:405`'s `.default(value)` rule exists for exactly this); anything else is a
   major and a major is a new room.
2. **The protocol version belongs to the client.** It is the wire shape of RFC-0024's `submit`
   envelope plus the row shape a view returns (RFC-0025 §5). The module declares `minClient` and
   `maxClient`; a client outside that range is refused at connect with `protocol-refused` naming
   both numbers, and never silently mis-parsed.
3. **The artifact version belongs to the host.** Content-addressed hash plus a semver, both recorded
   per room (RFC-0025 §1, RFC-0016 §2). The hash is what a rollout reverts to; the semver is what a
   person reads. Two rooms may run different hashes at the same time and that is normal.
4. **The compatibility window is two releases or 90 days, whichever comes first.** A room may stay
   on the previous artifact for two published releases or 90 days. After that the host refuses to
   serve it and the room's authority must accept the upgrade or migrate (RFC-0033). The window is a
   term, so a host may set it shorter for its own rooms and not longer for anyone's.
5. **A newer client degrades against an older room, and says so.** The client reads the room's
   protocol range, speaks the highest version the room accepts, and refuses an action the room
   cannot express with `protocol-refused` naming the action. It does not emulate the missing
   behaviour locally, because a local approximation is a second implementation of a rule.
6. **An older client against a newer room gets the old shape for the window, and nothing is
   zeroed.** A field the old shape cannot carry is omitted from the response and the client shows it
   as absent. A zero would be a value the client believes, which is worse than a gap it can see.
7. **A schema change never rewrites a row.** The module cannot read ciphertext, so it cannot migrate
   content in place. A change that needs existing rows rewritten is a new room and an import
   (RFC-0015), and the record that decides it must say so at the time - not discover it at publish
   time.
8. **The version triple is observable per room.** RFC-0016 §3's health view already carries the
   module version; this record adds schema and protocol, so "which room is on what" is a query
   rather than a support conversation.

## Context

The engine's compatibility surface is narrower than a general platform's. A republish hot-swaps the
module without disconnecting clients (`AGENTS.md:99`), so two module versions can serve the same
room within one connection's lifetime - which means the client cannot assume the schema it validated
against at connect is the schema still running. That is the constraint that makes rule 5 and rule 6
necessary rather than polite.

What the engine does not offer is a version negotiation the module can read. `ctx.sender` is an
identity (`AGENTS.md` identity section) and `ctx.connectionId` is a connection; neither carries a
client version. RFC-0024 §1's `submit` envelope can carry a declared protocol version in its
cleartext header, which is the mechanism this record relies on - and a declared version is a claim
the client makes, which is why the module checks it against a range instead of trusting it for
authorization.

The set already has the pieces and no rule joining them. RFC-0011 makes every varying term a schema
row with a version; RFC-0002 makes the schema the single declaration; RFC-0016 §2 names a
compatibility window without defining it; RFC-0025 makes the artifact content-addressed. This record
is the definition that was missing.

## Alternatives considered

| Option                                               | Why not chosen                                                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| One version number for everything                    | a schema change and a client change have different owners and different blast radii; one number hides which one moved |
| No compatibility window - upgrade every room at once | RFC-0016 §2 already refuses it: one bad publish would reach every room                                                |
| Version negotiation by capability list               | a client can claim a capability it does not implement, and the module cannot verify a claim about behaviour           |
| Rewrite rows during a schema migration               | the module cannot read them (RFC-0007), so the rewrite would need a client to do it, per row, per member, forever     |
| Let an old client keep working indefinitely          | the window exists so a room is not permanently two rooms; an unbounded window is the same as never fixing a schema    |
| A schema version per table                           | RFC-0002 makes one declaration the authority; per-table versions reintroduce the drift it removes                     |

## Consequences

- Every room's health view grows three fields and every rollout has three numbers to check instead
  of one. That is the cost of knowing which of the three moved.
- A client must carry at least two protocol shapes for the length of the window, so a client release
  is never a single-version build. This is the same trade RFC-0025 §1's hot-swap already forces.
- Additive-only schema changes mean a design mistake in a table's shape is permanent for that room.
  RFC-0002's derivation makes that mistake cheap to spot early and expensive to fix late, which is
  the right direction.
- A major schema change is a room migration, so RFC-0033 becomes the normal path for a breaking
  change rather than an escape hatch. The migration cost is then the cost of a breaking change,
  which is the honest price.
- `protocol-refused` joins the refusal vocabulary RFC-0024 §7 and RFC-0032 §6 established, so a
  client can distinguish "this room is too old" from "you are not allowed".

## Verification

| Claim                                          | Test                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A room reports all three versions              | `spacetime sql <room> "SELECT schema_version, protocol_min, protocol_max, module_hash FROM room"` returns one row (intent)                              |
| An out-of-range client is refused by name      | submit with a declared protocol below `minClient`; the refusal is `protocol-refused` naming both numbers (intent)                                       |
| An additive column publishes without a rewrite | add an optional column with a default to a fixture module, republish; existing rows read back with the default and nothing is dropped (`AGENTS.md:405`) |
| A removal is refused as incompatible           | remove a column and republish a fixture module; the publish fails rather than silently dropping data (intent, engine behaviour to confirm)              |
| Hot-swap keeps an old client connected         | republish mid-session; the subscription survives and the client observes the version change from the health view (engine, `AGENTS.md:99`)               |
| The window is enforced                         | age a room's artifact past two releases in a fixture host; the host refuses to serve it and names the migration path (intent)                           |

## Open questions

- Whether the module can learn a client's version at connect without the client declaring it. No
  field on `ctx.sender` or `ctx.connectionId` carries one, and whether the engine's own protocol
  exchange exposes a version the module can read is UNKNOWN. Spike: connect with two SDK versions
  and compare every value a lifecycle hook can see.
- Whether a republish that removes a table destroys its rows or merely hides them.
  `spacetime publish --delete-data=always` destroys everything; a selective drop is not documented
  in anything read. UNKNOWN, and it decides whether rule 7's "a major is a new room" is a policy or
  a necessity.
- Whether the 90-day half of the window should be measured from the release or from the room's first
  read after it, which matters for a room nobody opened during the window.

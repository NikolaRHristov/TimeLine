# RFC-0043 - Local-first workspace: identity, network and publishing

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the workspace page,
the session layer, the permission model, the network surface, the transport contract **Kind:**
architecture **Subject:** surface **Horizon:** now **Supersedes:** none **Superseded by:** none
**Task dependencies:** RFC-0001 (the shadow store and publication), RFC-0003 (the transport seam),
RFC-0005 (a room is a database), RFC-0007 (the envelope), RFC-0012 (audiences), RFC-0013 (identity,
keys and authority), RFC-0017 (the client surface), RFC-0019 (vocabulary, `circle`), RFC-0024 §5 (an
action is idempotent by id), RFC-0027 (votes rank, the authority selects), RFC-0030 (the sync
rules), RFC-0040 (a client timestamp is a claim); t_1621cc5c (substrate research); t_ab85d9de (the
workspace session and network layer)

## Decision

The workspace is one page over two stores with one seam between them and exactly three roles. A
person's drawer is private to them and lives in their own shadow store; a canvas is a projection
published out of that store into a context; publishing is the only verb that crosses the seam; and
the page renders the server-rendered view first and replaces it only with state it can name.

Ten rules make that enforceable.

### 1. One drawer per person, one canvas per context

A person has exactly one drawer: their own archive, read from their own shadow store (RFC-0001). A
canvas belongs to a context, and the rail selects the context. Two kinds of context exist - the
owner's own archive, and one room of the owner's User Network - and the drawer does not change with
it. Selecting a room changes the canvas and the publish destination, never the drawer's contents,
because a person has one archive and the archive is not a room's.

A canvas is therefore a projection of one or more drawers. The owner's own canvas is a projection of
exactly one; a room's canvas is a projection of one record per member who published into it. That is
the whole of the two-views-of-one-store claim, and it holds only where the context is the owner's
own.

### 2. Publishing is the only verb that crosses the seam

Named acts that do not cross it: reading, voting, curating, selecting, commenting, nominating,
observing, arranging and propagating. Only `publish` writes a record from a drawer into a canvas.
`withdraw` is the same verb in reverse - it narrows the record's audience to `internal` (RFC-0012
rule 1), which in the shadow store is the `hidden` state, and it removes the canvas copy. It does
not delete the drawer record.

Three corollaries, because each of these is mistaken for publishing in some product:

- Curation selects among records that are already published and never publishes one (RFC-0027 §2).
- A vote ranks and never publishes.
- A comment is addressed to `typed` (RFC-0017), so by RFC-0012's table it cannot reach a canvas at
  all. A propagation copies an already-published record into another room; it is not a publication
  of a drawer record.

### 3. One record, one owning store

Every field has exactly one owner. Drawer fields are owned by the shadow store. Canvas fields are
owned by the room whose canvas it is. A copy on the other side is a projection and never writes
back. Conflict is therefore resolved by ownership rather than by a merge, and the reconciliation
rule is a refusal to merge across the seam.

Three sub-rules decide the cases that remain:

- **R1 - append-only rows never conflict.** An observation, an event, a vote, a decision, a comment
  and a propagation record are inserts with a fresh id, made idempotent by `actionId` (RFC-0024 §5).
  Two people voting on the same record offline produce two rows and both are correct.
- **R2 - single-holder fields are refused, not merged.** A record's `visibility`, a canvas's
  selection, a membership row and a grant each have exactly one writer. A write from a client whose
  copy is behind is refused with `stale-write` naming the current version (RFC-0030 §2), because
  last-write-wins by clock makes the winner the clock that lied hardest (RFC-0040).
- **R3 - per-field merge applies to one record: the viewer's arrangement.** Where a tile sits on a
  canvas is the viewing identity's preference, keyed by context, and only that identity writes it.
  Two members may lay out the same room canvas differently and both are correct.

The split in R3 is what removes the last field two writers could touch. **Selection** - which
records appear on a canvas - is one holder, the context's authority. **Arrangement** - where they
sit - is per viewer. Conflating the two is the only way this rule set acquires a genuine conflict.

### 4. Three roles, and they are not global

An identity is the owner of its own context, a member of each room it joined, and a reader
everywhere else. All three hold at once, which is why no identity carries a single role.

| Act                                  | Reader                 | Member                            | Owner                      |
| ------------------------------------ | ---------------------- | --------------------------------- | -------------------------- |
| Read a canvas                        | `public` rows only     | per the audience table (RFC-0012) | every row of their room    |
| Read a drawer                        | no                     | no                                | yes                        |
| Write a drawer record                | no                     | no                                | yes                        |
| Publish into their own canvas        | no                     | no                                | yes                        |
| Publish their own record into a room | no                     | with the `author` grant           | with the `author` grant    |
| Withdraw a published record          | no                     | their own records                 | any record in their drawer |
| Vote                                 | only under `open-vote` | yes                               | yes                        |
| Select for a canvas                  | no                     | with the `curator` grant          | yes                        |
| Arrange a canvas                     | their own view         | their own view                    | their own view             |
| Admit or remove a member             | no                     | with the `authority` role         | yes                        |
| Read presence in a room              | no                     | yes                               | yes                        |

Two cells carry the design. A member may never publish another member's record, because widening an
audience needs the author's signature (RFC-0012 rule 2) and a member who could publish for another
would be that signature. A member never reads a drawer that is not their own, because the drawer
does not travel: the owner's browser reads it from the owner's own store through the transport seam
(RFC-0003), and no room ever holds it.

### 5. `Decision.by` answers how; `Decision.actor` answers who

`by` stays closed at `rule | model | manual` and gains nothing. A network member's decision is
`by: "manual"` with `actor` naming the member's identity. A fourth value would conflate two axes: a
member may reach a decision by rule, by model or by judgement exactly as the owner does, and adding
`member` to `by` would answer "who" in a field that answers "what produced this".

`actor` is never null. A `rule` or `model` decision is produced by the owner's pipeline on the
owner's behalf, so its actor is the owner's identity; a `manual` decision's actor is the person who
made it. Every decision is signed by its actor's subkey (RFC-0013), so `actor` is verified rather
than asserted.

A decision is a row about a subject, not a field of it, and it is append-only. The effective
decision on a subject is derived in this order: the owner's `manual` decision if one exists,
otherwise the latest decision by an actor holding the grant that decision requires. A member's
`manual` decision is therefore a nomination - it ranks, and only the authority writes the curation
field (RFC-0027 §2). That is how a network member's decision is represented without granting the
member a write the authority holds.

`Decision` gains `actor` and `at`, which is a schema change with a migration under RFC-0002. The
site's projection gains neither field: a page states a decision, not who made it.

### 6. The User Network

Connection to the User Network is three facts, and only the first is required.

1. **Membership.** The identity holds at least one membership row (RFC-0019), and for that room the
   current key epoch is wrapped to the identity's public key (RFC-0013). Without the wrap the
   identity is a member who reads nothing - joined but not granted - and the client renders that as
   its own state rather than as an empty canvas.
2. **Presence.** An expiring claim `{identity, room, at}` that the identity was reachable within a
   window. Presence is not a record: it never enters an export (RFC-0015), never affects a
   permission, and its absence means unknown, never offline. Nothing in the product may wait on
   presence, and no surface may render its absence as an error.
3. **Visibility.** Per record, decided by the audience table (RFC-0012) and enforced at delivery by
   the room's per-user view (RFC-0005). A member sees `internal` rows and the `typed` rows they hold
   a grant for; a reader sees `public` only.

The User Network is not a second concept. It is the `circle` of RFC-0019 rendered as a surface:
every room the identity belongs to, each with its canvas. "Connected" describes the client's
session, not the person's availability.

### 7. Four states, and a failed fetch is the third

The static shell is identical for every visitor and is what the build emits. The island renders from
three sources in order and names which one produced what is on screen.

| State      | Source                                           | What it means                                   |
| ---------- | ------------------------------------------------ | ----------------------------------------------- |
| `live`     | the room subscription over the transport         | rows are current to the last tick               |
| `snapshot` | the last state the client received               | rows are current to the snapshot's receive time |
| `static`   | the server-rendered props from the build         | the public projection as of the build           |
| `joined`   | the membership row, with no grant admitting rows | the room exists and its rows are not readable   |

Five rules make the ladder safe.

- The island's initial signals are its props. Hydration never resets them to empty, so the
  server-rendered view is already on screen before any fetch resolves.
- A failed fetch sets `static` and keeps the props. It never sets an empty collection.
- The state is visible in the interface - one line naming the state and its time. RFC-0003 refuses a
  silent fallback for the tool layer because a caller that cannot tell live data from stale data
  will act on stale data; the same reason applies here, and naming the state is what distinguishes
  this ladder from the fallback that record refuses.
- `empty` is a data state and not a failure state. An empty drawer over a `live` subscription
  renders the composition's ghost rows, because an empty archive is a normal state and the page
  header already says so.
- The drawer's live source is the owner's own store through the transport seam, not the network. A
  person's drawer does not travel to its owner, so a drawer state is `static` or `live` from the
  local seam and is never `joined`.

**The island's contract.** Per context the island receives `context` (`{kind, roomId, label}`),
`role`, `grants`, `state`, `asOf`, `drawer` (the owner's rows), `canvas` (tiles as
`{id, title, meta, href, seat}` in the viewer's arrangement) and `pending` (queued actions with
`actionId` and `authoredAt`). That is the whole session layer's output, and every field is either
build-time data or a named state.

### 8. Offline behaviour, surface by surface

| Surface | Online source                 | Offline source                                    | What a write does                                                       |
| ------- | ----------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| Rail    | build-time counts             | the last build's counts, labelled with build time | nothing - stage selection is local state                                |
| Drawer  | the local store via the seam  | the snapshot, read-only                           | queues a signed action, ordered within the identity (RFC-0030 §6)       |
| Seam    | the destination's grant check | the same check, performed locally                 | a permitted drop is queued; a forbidden drop is refused before queueing |
| Canvas  | the room subscription         | the last built canvas                             | nothing - a canvas is written by publishing, never directly             |

A publish performed offline completes its local half - the record becomes `public` in the shadow
store and a file appears in `Source/Content/` (RFC-0001 layer 3) - and queues its network half. The
tile renders with a pending marker rather than being absent, so a person can tell a publish that has
not reached the room from a publish that never happened. This is the concrete meaning of assuming
nobody is online: the local half is authoritative and the network half is a queued claim.

### 9. The substrate's requirements

SpacetimeDB is the candidate because RFC-0005 already chose it for the room boundary, not because it
is assumed to satisfy this list. A capability claimed without a test is UNKNOWN and may not be
depended on.

| #   | Requirement                               | Why the product needs it                                                               | Candidate evidence                                                                                              |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | An authenticated caller identity          | every cell in §4 is a statement about a caller                                         | `ctx.sender` exists; the module reads it nowhere (`grep -c` prints 0, RFC-0020)                                 |
| 2   | Visibility enforced at delivery           | `internal` and `typed` rows must not reach a caller who may not read them              | a per-user view keyed on the caller, and a SQL visibility filter (`Maintain/Spacetime/AGENTS.md:617`, `:681`)   |
| 3   | An ordered stream with a resumable cursor | the island replaces a snapshot with current rows, not a week of replay                 | subscriptions deliver changes; a resumable cursor is UNKNOWN                                                    |
| 4   | Idempotent action by id                   | a queue flushed twice by a flaky connection must apply once                            | a unique `actionId` column checked in the reducer; no engine primitive                                          |
| 5   | A server-side clock for ordering          | a client timestamp is a claim (RFC-0040)                                               | transaction timestamps                                                                                          |
| 6   | Opaque payloads                           | the host must not read content (RFC-0007)                                              | a byte column the module never projects                                                                         |
| 7   | Refusals that name their reason           | `stale-write`, `not-granted`, `audience-fixed` are three different sentences to render | reducer errors carrying a message string                                                                        |
| 8   | Export without the host's cooperation     | exit is free (RFC-0015, RFC-0027 §6)                                                   | the client holds the keys and the rows it may read, so export is client-side                                    |
| 9   | Acceptance of an action authored offline  | no assumption that a person is online                                                  | the queue is client-side; the substrate sees a replay, and must not restamp `authoredAt`                        |
| 10  | A cross-room call with an acknowledgement | federation only (RFC-0012 rule 3)                                                      | inter-database calls are asynchronous (`Maintain/Spacetime/AGENTS.md:143`); the transaction boundary is UNKNOWN |

The personal workspace needs rows 1 to 9. Only a network of rooms needs row 10, which is why the
workspace may ship before federation does. Rows 1, 2, 3 and 10 are the ones where the candidate is
documented rather than demonstrated, and each names the spike that would settle it.

### 10. No client-side secret

The only secrets the client holds are the identity key and its device subkeys (RFC-0013). They live
in the keystore, are unlocked by a passphrase, never enter a bundle, never enter `Source/Content/`,
and never enter the shadow store.

The session token is a runtime credential obtained after load, scoped to a host session and carrying
no key material. A token in storage is a bearer credential, and losing it loses a session rather
than an identity - which is the distinction that makes it not a client-side secret in the sense that
matters here. The bundle ships no secret at all, and a build that does is caught by the same grep
that guards the store.

## The vocabulary

RFC-0019 is the naming authority and the glossary it names does not exist yet, so this table is the
definition of every term this record introduces. The terms enter
`Documentation/Reference/Glossary.md` in the change that creates it; until then this table is their
only home.

| Term                                | One meaning                                                                                                                | Decided by         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| workspace                           | the page that composes a rail, a drawer, a seam and a canvas over one session                                              | RFC-0043           |
| context                             | what the rail selects: the owner's own archive, or one room of their User Network                                          | RFC-0043           |
| rail                                | the fixed-width band that lists the archive's stages and selects one                                                       | RFC-0043           |
| stage                               | one of the archive's named steps - source, ingestion, processing, review - with an accent, a rail band and a drawer column | RFC-0043           |
| drawer                              | the private band: the owner's own records, one column per stage                                                            | RFC-0043           |
| canvas                              | the published band: one tile per record selected for a context                                                             | RFC-0043           |
| tile                                | one record's place on a canvas, as `{id, title, meta, href, seat}`                                                         | RFC-0043           |
| seam                                | the strip between drawer and canvas; the only place a record may cross                                                     | RFC-0043           |
| publish                             | addressing one drawer record to a canvas - the only verb across the seam                                                   | RFC-0043           |
| withdraw                            | narrowing a published record's audience and removing its canvas copy                                                       | RFC-0043           |
| reader                              | an identity with no membership row in the context's room                                                                   | RFC-0043           |
| member                              | an identity holding a membership row; this record gives its acts (RFC-0019 defines the term)                               | RFC-0019, RFC-0043 |
| owner                               | the identity holding the `authority` role (RFC-0013) in the workspace's room                                               | RFC-0043           |
| User Network                        | the `circle` of RFC-0019 rendered as a surface: every room the identity belongs to                                         | RFC-0019, RFC-0043 |
| presence                            | an expiring claim that an identity was reachable in a room recently; not a record                                          | RFC-0043           |
| session                             | the client's authenticated state: an account token, an identity and a set of room subscriptions                            | RFC-0043           |
| snapshot                            | the last per-user state a client received, stored as ciphertext with its receive time                                      | RFC-0043           |
| account                             | the host-side billing record for a person (RFC-0016); never the unit of authorship                                         | RFC-0043           |
| selection                           | which records appear on a canvas; one holder, the context's authority                                                      | RFC-0043           |
| arrangement                         | where a record sits on a canvas; per viewer, never shared                                                                  | RFC-0043           |
| open-vote                           | a room term admitting votes from identities without a membership row; off by default                                       | RFC-0043           |
| `live` `snapshot` `static` `joined` | the four states the island may be in; each is rendered and none is an empty page                                           | RFC-0043           |

## Context

The composition exists and the layer behind it does not. `Source/pages/Workspace/index.astro` reads
five content collections at build time and hands them to a Solid island as plain data; the island
holds five signals, three of them seeded from its props and two holding UI state; `Workspace.tsx`
already models publishing as placement into the first free cell, so the drawer's queue and the
canvas's layout cannot disagree. The page's own header states the requirement this record answers -
the shell, the rail and the canvas are static, and what a person sees in their own drawer depends on
who they are and which network they belong to.

Nothing decides who they are. There is no session layer, no role, no membership read by the page and
no per-user state of any kind. The module reads no caller
(`grep -c "ctx.sender" Maintain/Spacetime/spacetimedb/src/index.ts` prints 0, RFC-0013), `Decision`
has three values and no actor (`Source/content.config.ts:81-88`), and the drawer is a build-time
slice of the same public collections the rest of the site renders. The gap is not cosmetic: the
composition claims a per-user private half that has no source.

Three records already constrain the answer and none of them decides it. RFC-0017 makes offline a
first-class state and refuses an empty screen that looks like a room with nothing in it; RFC-0030
removes the concurrent-write case rather than resolving it; RFC-0003 refuses a silent fallback
because a caller cannot tell live data from stale. This record places the workspace on top of all
three, which is why its reconciliation rule is a refusal to merge and its degradation ladder names
its own state.

## Alternatives considered

| Option                                               | Why not chosen                                                                                                                                       |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serve the drawer over the network like the canvas    | the drawer is the one thing that never needs to travel; serving it makes the host a reader of the archive and puts the private half behind a session |
| One role per identity                                | an identity is owner, member and reader at the same time, in different contexts; a single role cannot express that                                   |
| A fourth `Decision.by` value for a network member    | `by` answers how a decision was produced; a member's judgement is `manual`, and who made it is a different field                                     |
| Let a member write the curation field                | votes rank and the authority selects (RFC-0027 §2); a member with the write is a second authority with no accountability                             |
| A CRDT over drawer and canvas                        | rule 3 removes the two-writer case, and RFC-0030 §4 already refuses a merge state for a conflict this design deletes                                 |
| A silent fallback from the subscription to the cache | RFC-0003 refuses silent fallback for the tool layer for the same reason, so the ladder names its state instead of hiding it                          |
| Presence as a required signal                        | nothing may wait on presence; a required signal turns an offline person into a broken page                                                           |
| Assume SpacetimeDB meets the requirements            | the substrate must be replaceable (RFC-0026 already allows a second carrier); a requirement table is what makes a replacement testable               |
| Render the island with no server-rendered fallback   | a failed fetch would produce the empty page this record exists to forbid                                                                             |

## Consequences

- The page gains the first stateful layer in a build that has none: identity, membership, grants and
  four named states. That is more surface than any record so far, and it is the reason the state is
  named in the interface rather than inferred.
- The drawer's live path depends on the tool layer being reachable from the browser. On a device
  without it the drawer is the build's snapshot or `static`, and that must be a named state rather
  than a blank - which means the workspace is a desktop surface before it is a phone surface.
- `Decision` gains `actor` and `at` and a schema version (RFC-0002), while the site's projection
  gains nothing it must render. The audit lives where the module lives.
- A shared canvas needs a per-context arrangement record, which is the only merge in the schema and
  the only row whose loss is cosmetic.
- The requirement table becomes a review gate. A row that moves from UNKNOWN to demonstrated needs a
  test in the same change, or the record stops being a specification and becomes a hope.
- A reader and a member are indistinguishable on a public canvas, which is correct and also means
  the role distinction is invisible until a canvas is not public. The interface must not invent a
  difference to show that the model exists.

## Verification

| Claim                                  | Test                                                                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The build needs no database            | `astro build` passes with `spacetime start` stopped (true today; keep it as a check)                                                                                               |
| The island starts from its props       | `grep -n "createSignal(Props" Source/Component/Workspace/Workspace.tsx` prints three lines - `Stage`, `Active`, `Published` - and the other two signals hold UI state (true today) |
| A failed fetch is not an empty page    | block the subscription, load `/Workspace/`: the drawer and canvas render the build's rows and the state line reads `static` (intent)                                               |
| Every state names itself               | force each of `live`, `snapshot`, `static`, `joined`; each renders a distinct line and no state renders an empty container (intent)                                                |
| A drawer record never leaves the store | `grep -rl <drawer text> Source/Content/` prints nothing before `store publish` (Storage-Model's own test)                                                                          |
| Publishing is the only crossing        | `store status` shows `public: 0` until `store publish` runs (Storage-Model's own test)                                                                                             |
| A member cannot publish for another    | publish another identity's record as a member: refused with `not-author` (intent, RFC-0012 rule 2)                                                                                 |
| A reader reads no drawer row           | subscribe as a non-member: the drawer table returns no rows (intent)                                                                                                               |
| `by` still has three values            | `grep -n "by: z.enum" Source/content.config.ts` prints one line with three values (true today)                                                                                     |
| A member's decision names its actor    | a member's decision row carries `by: "manual"` and `actor: <member>`, and the curation field is unchanged (intent)                                                                 |
| No client-side secret ships            | `grep -rl "privateKey" Maintain/Storage/ Source/Content/ Target/` prints nothing (RFC-0013's test, extended to the build)                                                          |
| Absent presence is not offline         | expire every presence row: the canvas still renders and no surface reports an error (intent)                                                                                       |
| The rail renders offline               | load once, go offline, reload: the rail renders with its build time and stage selection still works (intent)                                                                       |

## Open questions

- Whether a room's arrangement is per viewer or shared. This record says per viewer, because a
  shared arrangement is a second single-holder field and would change R3. A room that wants a fixed
  composition needs that field, and the record that adds it must say which of selection and
  arrangement the authority holds.
- Whether a reader may ever vote. `open-vote` admits it; whether a vote from an identity with no
  membership row is worth counting is a product question RFC-0027 does not answer.
- Whether the drawer's live source can be the local seam on a device that has no tool layer. This
  record says the drawer is `static` there, which decides whether a phone shows a drawer at all.
- UNKNOWN whether a subscription cursor is resumable. Spike: subscribe, disconnect for a minute,
  reconnect, and compare the rows delivered against the rows changed.
- Whether presence is a row with a module-enforced expiry or a client-only fact. A module-enforced
  expiry needs a sweep, and a sweep is a cost on every room.
- Whether `actor` belongs on `Decision` or on a separate attribution row. `Decision` is read by the
  site build; a separate row keeps the build's schema at three fields and puts the audit where the
  module lives.
- UNKNOWN whether the engine can deliver a whole audience rule through one per-user view without a
  scan per subscriber. This is RFC-0005's open question inherited here, and the workspace cannot be
  built against requirement 2 until it is settled.

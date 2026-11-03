---
title: Time, ordering and causality
rfc: 0040
category: Architecture/Data
kind: rfc
date: 2026-11-02
status: proposed
horizon: next
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: every row's timestamp, the replay window, observation reconciliation, the migration seam
supersedes: none
superseded_by: none
depends:
    - "RFC-0022 §2 (a reducer reads no clock)"
    - RFC-0007 (the envelope's timestamp field)
    - "RFC-0021 §4 (reconciliation by `at`)"
    - |-
        RFC-0033 §6 (cutover and two clocks); implementing card to be created: "Accepted time and claimed time on every row"
statuses:
    - name: A reducer reads no clock, and the only time a room writes is the engine's
      state: open
      evidence: the rule names no file or command
    - name: A client timestamp is a claim inside the signed envelope, kept and never...
      state: open
      evidence: the rule names no file or command
    - name: Order within a room is total and needs no sequence
      state: open
      evidence: the rule names no file or command
    - name: An observation's timestamp is the observer's claim, corroborated by arrival
      state: open
      evidence: the rule names no file or command
    - name: Across rooms there is no order, only the causality a row records
      state: open
      evidence: the rule names no file or command
    - name: Clock skew is a property of a host, not of a room
      state: open
      evidence: the rule names no file or command
    - name: A duration is measured in the room's clock and a person is told so
      state: open
      evidence: the rule names no file or command
---

## Decision

The module's clock is the transaction's, a client's timestamp is a claim, and there is no "before"
between two rooms except the one a propagation row records.

1. **A reducer reads no clock, and the only time a room writes is the engine's.** RFC-0022 §2
   already forbids a reducer from touching a clock; the engine supplies `ctx.timestamp`, the
   transaction's server-assigned time, deterministic per reducer call (`AGENTS.md:526`). That value
   is a row's `acceptedAt`, and it is the only field anything orders by. A client-supplied time used
   as `acceptedAt` would let a caller rewrite history by lying.
2. **A client timestamp is a claim inside the signed envelope, kept and never trusted for order.**
   It is bounded by the replay window (RFC-0020), and it is stored beside `acceptedAt` because
   offline authoring needs it (RFC-0017, RFC-0030 §5) and because "when the person wrote it" and
   "when the room took it" are two different facts. The room orders by the second and shows the
   first.
3. **Order within a room is total and needs no sequence.** `ctx.timestamp` orders rows; two rows
   sharing a microsecond tie-break by row id. Auto-increment ids are explicitly not an order - the
   engine's own rules say gaps are normal (`AGENTS.md` critical rule 4) - so no id is ever read as a
   sequence number.
4. **An observation's timestamp is the observer's claim, corroborated by arrival.** RFC-0021 §4
   reconciles by `at`, and this record says which: the observer's claimed observation time, because
   a post's own timestamp belongs to the source platform and cannot be trusted to be honest, while
   arrival time is the room's own. The projection keeps both, and a divergence between them is a
   fact about the observer's cadence rather than an error to correct.
5. **Across rooms there is no order, only the causality a row records.** A federated push (RFC-0012
   rule 3) is a row in the receiving room, so the copy's `acceptedAt` is later than the send's
   `acceptedAt` on the same host's clock. Across hosts, that row is the only happens-before relation
   the system has. Two rooms observing the same post are concurrent, and nothing orders them - not a
   shared source timestamp, not a hash, not a wall clock.
6. **Clock skew is a property of a host, not of a room.** Two rooms on one host share a clock; two
   hosts do not. A migration (RFC-0033) therefore produces a room whose timeline has a seam, and the
   migration row carries both hosts' readings at cutover - which is the only way a reader can
   distinguish a skew from an event order. Without it the seam is invisible and the history is
   quietly wrong.
7. **A duration is measured in the room's clock and a person is told so.** "Expires in 24 hours" is
   a duration from `ctx.timestamp`, never from the client's clock, so an offline device with a wrong
   clock cannot extend an invitation's life (RFC-0014's `expiresAt`) or an appeal's deadline
   (RFC-0031 §5).

## Context

The engine's determinism rule is the whole reason this record exists. Reducers must not use external
clocks (`AGENTS.md` critical rule 2) and `ctx.timestamp` is provided precisely so a module has a
reproducible time to write (`AGENTS.md:526`); `ctx.random` exists for the same reason
(`AGENTS.md:529`). A module that ignored both would be non-deterministic, and a non-deterministic
module cannot be replayed

- which RFC-0037's replay layer depends on.

The federated case has no mechanism to build on. The engine's inter-database call is asynchronous
(RFC-0005), the registry's outbox module is described as exactly-once _apply_, and nothing in the
documents read offers a cross-database clock, a vector clock or a consensus timestamp. So "before"
across rooms is not a thing the engine can give, and the only honest definition is the one a row
records.

The observation log makes the distinction concrete. An observation carries `at`, `source`,
`statusId`, `action`, `observer` and `job` (RFC-0021 §2). Two observers reporting the same status id
inside one window with different content hashes produce a `divergence` event, and RFC-0021 §4
already refuses to let either overwrite the other. This record supplies the missing definition of
which `at` the window is measured against.

## Alternatives considered

| Option                                      | Why not chosen                                                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Trust the client's timestamp for ordering   | a client can lie and a device can be wrong; the room's history would be writable by whoever set their clock furthest ahead          |
| Lamport or vector clocks on every row       | solves an ordering problem the design does not have, at the cost of a column every writer must maintain and every reader must trust |
| A global time service for all hosts         | a single authority for time is a single point of failure and a new trust anchor the set does not otherwise need                     |
| Order across rooms by source timestamp      | the source's timestamp belongs to a platform whose clock nobody checked, and two rooms observing the same post would tie            |
| Auto-increment id as the sequence           | the engine states gaps are normal (`AGENTS.md` critical rule 4); an id is not an order                                              |
| Wall-clock durations measured on the client | an offline device with a wrong clock would extend or expire a deadline it does not own                                              |

## Consequences

- Every row carries two times, so every read path has to know which one it means. That is a small
  permanent tax and it is the only way to keep both facts.
- A room's history is ordered by its host's clock, so a host with a drifting clock produces a room
  with a drifting history. The drift is visible against `acceptedAt` versus `authoredAt` only if
  someone looks, and nothing currently watches it.
- A migration leaves a seam and the seam is documented rather than smoothed. Smoothing it would mean
  rewriting `acceptedAt`, which is rewriting history.
- Invitations and appeals become immune to client clock manipulation, which closes a trivial bypass
  of RFC-0032's invitation expiry.
- Replay (RFC-0037 §3) is possible because the module's time is deterministic; a module reading a
  real clock would produce a different projection on every run.

## Verification

| Claim                                     | Test                                                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| A row's order comes from `ctx.timestamp`  | write two rows in sequence; `spacetime sql <room> "SELECT id, accepted_at FROM payload"` is ordered by `accepted_at`, and ids may have gaps (intent) |
| A client timestamp cannot reorder history | submit a row claiming a time in the past; `accepted_at` is the transaction's and `authored_at` carries the claim (intent)                            |
| An out-of-window claim is refused         | submit a claim outside the replay window; the refusal is `action-refused` naming the window (RFC-0020, intent)                                       |
| An invitation expires on the room's clock | accept an invitation after `expiresAt` while the client's clock says otherwise; the refusal is `invite-expired` (RFC-0014, RFC-0032 §6)              |
| A migration records both clocks           | inspect the migration row after a fixture move; it carries both hosts' readings at cutover (RFC-0033 §6, intent)                                     |
| No sequence is derived from ids           | `grep -ri "order by id" Maintain/Source` returns nothing on a content table (intent)                                                                 |

## Open questions

- Whether `ctx.timestamp` is the transaction's admission time or its commit time. The distinction
  matters for the migration seam and for a retried action, and neither the CLI reference nor the
  engine notes read state which. UNKNOWN. Spike: submit two rows in one reducer and compare their
  `ctx.timestamp` values against the server log's ordering.
- Whether `ctx.timestamp` stays monotonic across a hot-swap (RFC-0025 §1). A republish replaces the
  module without disconnecting clients, and whether the clock behind `ctx.timestamp` survives that
  is UNKNOWN.
- Whether an observation's claimed time should be signed separately from the envelope's, given that
  RFC-0021 §4 reconciles by it and a lying observer would shift a window. It is inside the signed
  envelope already, so the question is whether reconciliation needs a second signature over the
  claim alone.
- Whether a room should publish a clock-drift health metric, given RFC-0016 §3's health view exists
  and drift is a property a member cannot otherwise see.

---
title: Action ingress gateway
rfc: 0024
category: Contract/Transport
kind: rfc
date: 2026-11-02
status: proposed
horizon: next
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: the module's reducer surface, the worker, agent turns, the inbound HTTP router
supersedes: none
superseded_by: none
depends:
    - RFC-0004 (jobs are one class of action)
    - RFC-0006 (which classes a job may submit)
    - "RFC-0003 (the transport's `mutable` flag)"
    - |-
        RFC-0020 (the envelope checks this record routes through); implementing card to be created: "Action gateway reducer and the action-class table"
statuses:
    - name: One entry point
      state: open
      evidence: the rule names no file or command
    - name: The class is derived, not declared
      state: open
      evidence: the rule names no file or command
    - name: Attribution is the signing identity, never the prompting one
      state: open
      evidence: the rule names no file or command
    - name: Validation is split three ways, one rule each
      state: open
      evidence: the rule names no file or command
    - name: "Actions are idempotent by `actionId`"
      state: open
      evidence: the rule names no file or command
    - name: Inbound HTTP is the second door with the same lock
      state: open
      evidence: the rule names no file or command
    - name: A refused action says why, by name
      state: open
      evidence: the rule names no file or command
---

## Decision

Every action - a person's command, an agent's turn, a scheduled job - enters a room through one
reducer family, and the gateway decides the action's class rather than trusting the caller's word
for it.

1. **One entry point.** `submit(action)` is the only reducer that writes a row on behalf of a
   caller. An action is `{actionId, class, target, envelope, signature}` (RFC-0007's envelope,
   RFC-0013's signature). Per-action reducers do not exist, because authorization, replay, rate and
   size are written once in the gateway instead of once per action and forgotten once per action.
2. **The class is derived, not declared.** `read`, `harvest`, `mutate` - and the gateway derives it
   from the target and the action type in a table it owns, so a caller cannot label a mutation as a
   read to pass the gate. RFC-0006 already fixes what a scheduled job may submit; this record is
   where that rule has a single enforcement point.
3. **Attribution is the signing identity, never the prompting one.** An agent acts as an identity it
   holds a key for (RFC-0013). An action that will be authored by a person is signed by that
   person's client, so an agent turn cannot produce a row attributed to the person who typed the
   prompt.
4. **Validation is split three ways, one rule each.** The client validates content (RFC-0007),
   because it is the only party that can read it. The gateway validates the envelope - signature,
   nonce, replay window, size, per-identity rate, per-room quota (RFC-0020). The worker validates
   capability, using the transport's `mutable` flag so a read-only transport refuses a mutation
   before any side effect (RFC-0003). No rule is implemented twice.
5. **Actions are idempotent by `actionId`.** A repeat returns the first outcome and writes nothing.
   This is what makes the worker safe to retry and what lets a queued offline write (RFC-0017) be
   replayed on reconnect without a duplicate post.
6. **Inbound HTTP is the second door with the same lock.** A module's `httpHandler` routes into
   `submit` rather than writing tables directly (`Maintain/Spacetime/AGENTS.md:717-737`), so a
   webhook and a person's click meet the same gate. A room may close that door entirely (RFC-0022).
7. **A refused action says why, by name.** `action-refused` carries the class, the rule that refused
   it, and the action id, so a queued write that fails permanently surfaces as a named failure
   rather than disappearing (RFC-0017's requirement).

## Context

Ingress exists for one kind of work today. RFC-0004 gives the database a `Job` table and a `JobRun`
table, a scheduled reducer fires when the time arrives, and a worker outside the module claims the
job, drives the browser and reports back by calling reducers. That is a complete story for scraping
and no story for anything else: a person posting, an agent acting, a webhook arriving and a queued
offline write all reach the module through whatever reducer happens to exist.

The module's current reducer surface shows the shape of the problem rather than a gateway. Four
reducers exist - `observe`, `record`, `classify` and `attach` - and `observe` writes a post, an
observation and the post's `visibility` straight from its arguments
(`Maintain/Spacetime/spacetimedb/src/index.ts`), so the field that decides what reaches the public
site is set by whatever string the caller passed. None asks what class of action it is serving, and
`grep -c "ctx.sender" Maintain/Spacetime/spacetimedb/src/index.ts` prints 0, so no reducer
authorizes its caller at all. A gateway is the smallest structure that makes the authorization check
unavoidable rather than optional.

The three classes are not invented here: RFC-0006 already distinguishes a scrape (read-only, may be
scheduled) from a mutation (its own flag, never scheduled), and RFC-0003 already distinguishes a
mutating transport from a read-only one. This record gives those two decisions one place to be
applied.

## Alternatives considered

| Option                                              | Why not chosen                                                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| One reducer per action, each authorizing itself     | the same five checks written twenty times, and the twentieth forgets one; the gateway is one copy              |
| Class declared by the caller                        | a caller that mislabels a mutation as a read passes the gate, which is the whole failure being prevented       |
| Classify in the worker instead of the module        | the worker is outside the module and untrusted (RFC-0020); a classification it enforces is advice              |
| Let an agent sign as the person who prompted it     | it forges authorship, which RFC-0013 exists to prevent, and it makes the person answerable for the agent       |
| No idempotency key, rely on content hashes          | a content hash collides for two identical legitimate posts, and a retry that should replay becomes a duplicate |
| A separate gateway service in front of the database | a second hop that must be authorized itself, for a check the module can do in the same transaction             |

## Consequences

- Every action costs one extra table lookup for its class, and the class table becomes a review
  surface: adding an action type is a data change with an authorization rule beside it.
- An agent that cannot hold its own identity cannot act at all, which is the intended friction: it
  makes "who did this" answerable.
- The worker's reducer calls collapse into one call shape, which is a smaller surface to test and a
  larger one to get wrong once.
- Idempotency requires storing an outcome per `actionId` for a retention window, which is a table
  with a cleanup policy the module must own.
- The inbound HTTP door now shares the gateway's rules, so a webhook cannot bypass the replay window
  and must carry a nonce like any other action.

## Verification

| Claim                             | Test                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| There is one write entry point    | `spacetime describe <room> reducers --json \| jq -r '.reducers[].name'` lists `submit` and no second action writer (intent) |
| A mislabelled mutation is refused | submit a `setVisibility` action with `class: "read"`: `action-refused` naming `class-mismatch` (intent)                     |
| A job cannot mutate               | submit a `mutate` action from a scheduled job's identity: refused (shared with RFC-0006's table)                            |
| An agent cannot borrow authorship | an action signed by the agent's key and claiming a member's author is refused (intent)                                      |
| A replay writes nothing           | submit the same `actionId` twice: the second returns the first outcome and `select count(*) from post` is unchanged         |
| HTTP meets the same gate          | post a webhook with no nonce to the router: `action-refused`, and no row is written                                         |
| Refusals are named                | a permanently failing queued write surfaces `action-refused` with its rule and id, never a silent drop                      |

## Open questions

- Whether the gateway is one reducer with a discriminated argument or a small family (`submitRead`,
  `submitHarvest`, `submitMutate`) sharing a private helper. The family is cheaper for the engine's
  argument typing and weaker as a single gate; the record assumes one, and the implementation may
  split it if the engine's type system makes a discriminated argument unusable. UNKNOWN.
- Whether an action's outcome can be stored in the same transaction as its effect, which is what
  makes idempotency exact. Reducers are transactional (`Maintain/Spacetime/AGENTS.md:12`), so this
  should hold; it is unverified against the running module.
- How long an `actionId` outcome is retained. Too short and a delayed retry duplicates; too long and
  the table grows with the archive. UNKNOWN, and it interacts with the retention question RFC-0006
  already leaves open.
- Whether a person's own client should be able to submit a `mutate` action that the person did not
  sign, for example a scheduled reminder they authored earlier. The record says no; the class table
  could allow a pre-signed standing action, which would be a new decision.

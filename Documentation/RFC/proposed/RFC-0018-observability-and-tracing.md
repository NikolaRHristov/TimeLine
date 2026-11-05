---
title: Observability and tracing
rfc: 0018
category: Architecture/Operation
kind: rfc
date: 2026-11-02
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: |-
    every command in `Maintain/Source/Command/`, the transport seam, the module's event table
supersedes: none
superseded_by: none
depends:
    - RFC-0001 (the shadow store is the authority and already holds events)
    - RFC-0003 (the seam a span crosses)
    - RFC-0004 (job orchestration)
    - "RFC-0016 (per-room health); t_7936cc8e (transport)"
    - |-
        t_92e48af0 (a failure that left no trace); implementing card to be created: "Runs and spans across the CLI, the transport and the module"
statuses:
    - name: "Run - `{id, command, argv (redacted), startedAt, endedAt, outcome, counts}`"
      state: open
      evidence: the rule names no file or command
    - name: "Span - `{id, runId, parentId, name, startedAt, endedAt, outcome, attributes}`"
      state: open
      evidence: the rule names no file or command
    - name: Granularity floor - a command that touches the network or the browser emits at...
      state: open
      evidence: the rule names no file or command
    - name: The run id is the trace id and travels with every reducer call as an argument,...
      state: open
      evidence: the rule names no file or command
    - name: "What a person sees about their own archive, without logs - `maintain store..."
      state: open
      evidence: the rule names no file or command
    - name: Retention - runs and spans are the newest append-only log in the shadow store
      state: open
      evidence: the rule names no file or command
---

## Decision

Every command is a run, every external effect and every decision inside it is a span, and a failure
names its run so a person can see the tree without reading a log.

- **Run** - `{id, command, argv (redacted), startedAt, endedAt, outcome, counts}`. Exactly one run
  row per invocation, written even when the command fails.
- **Span** - `{id, runId, parentId, name, startedAt, endedAt, outcome, attributes}`. A span exists
  for each external effect (a CDP call, an HTTP call, a reducer call, a file write, a model call)
  and for each decision (classify, publish, propagate, grant). A pure function gets no span; that
  rule is what keeps the tree readable.
- **Granularity floor** - a command that touches the network or the browser emits at least one span
  per request, and a command that writes emits one per file or per row batch. A command with zero
  spans is a defect, not a fast path.
- **The run id is the trace id** and travels with every reducer call as an argument, so a room-side
  event carries the run that caused it. That is what makes propagation traceable from an author's
  client into a receiving room.
- **What a person sees about their own archive, without logs** - `maintain store status --json`
  (counts per layer and the lag between them), `maintain event tail` (the append-only log in order),
  `maintain run show <id>` (the span tree with timings and the failure code), and the `/Activity/`
  page rendering the same events. No log file is required to answer what happened to the archive.
- **Retention** - runs and spans are the newest append-only log in the shadow store. A run older
  than 30 days is summarised into one row (counts and outcomes) and its spans are dropped, so the
  store does not grow without bound.

## Context

The failure that motivates this record is already in the tree's history: `withPage` discarded the
readiness wait's result, so a page that never loaded ran the body anyway (card t_92e48af0). The
output said nothing - the wait had failed and the command continued, and the only way to see it was
to read the code. A span per wait, with its outcome, would have made the failure visible the first
time it happened.

The module has an append-only `event` table with an opaque JSON payload (index.ts:80-91) and nothing
that groups events into a command, so a person can see that something happened but not what caused
it. The store writes files with no record of which command wrote them. The `/Activity/` page renders
events, which is the right shape, but it renders a flat list with no parent-child relation.

The engine's event payload is free-form JSON by construction, so carrying a run id inside it needs
no schema change. That part is settled, not open.

## Alternatives considered

| Option                                         | Why not chosen                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Structured logs on disk only                   | a person must tail them, and the archive's own history stays invisible without shell access        |
| An OpenTelemetry SDK and an external collector | a service to run, and the product claims a person can see their own archive without infrastructure |
| Events only, no spans                          | no timing, no tree, no way to attribute a slow command to a step                                   |
| Spans only, no events                          | nothing durable a person can read a month later, and the module's event table would stay unused    |
| A span per function                            | the tree becomes the call graph, which is noise; the rule is effects and decisions, not functions  |
| Sampling                                       | at this volume, sampling removes exactly the failing run someone needs                             |

## Consequences

- Every command gains a write at start and at end: one file append per run and one row per span.
- Redaction becomes mandatory. `argv` can carry a token, and `MAINTAIN_*` values are never recorded;
  a redaction bug is a leak in a gitignored directory, which is still a leak.
- The run id must be threaded through the CLI, the transport and every reducer call, which touches
  every command's signature and the module's reducers.
- Summarising old runs is a job someone must own, or the retention rule is a comment.
- A failing command now has two outputs: the failure JSON on stdout and a run row. They must agree,
  or the run table becomes the unreliable one.

## Verification

| Claim                          | Test                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| One run per invocation         | `maintain tab list`, then `jq 'length' Maintain/Storage/Shadow/Run/index.json` increases by exactly 1                            |
| A failure carries its run      | `MAINTAIN_CONFIG=/nonexistent maintain config show` exits 2 and prints `runId`; `maintain run show <runId>` shows one error span |
| The tree is readable           | `maintain run show <runId> --json \| jq -r '.. \| .name? // empty'` lists spans in parent-before-child order                     |
| A room event carries the trace | `spacetime sql <room> "select payload from event where kind='post.observed'"` contains the run id (intent)                       |
| argv carries no secret         | a leak audit extended to fail on any recorded `argv` containing a configured secret (intent)                                     |
| Retention is enforced          | a run older than 30 days has one row and no spans (intent, needs the summariser)                                                 |
| The floor holds                | a command that writes produces at least one write span (review rule; intent until spans land)                                    |

## Open questions

- Whether runs live in the shadow store or in the database. The record puts them in the store,
  because a run must be recordable with no server - the failure a person most needs to trace is
  often the one where the server was not there.
- Whether span attributes are free-form or schema-checked. Free-form with a reserved key list is the
  starting position; the moment an attribute is queried it becomes a schema.
- Whether the transport seam (RFC-0003) emits spans itself or leaves that to each command. The seam
  is the only place that sees every external call, so it should emit them - but it is also the place
  a span is most likely to be forgotten.
- Whether `/Activity/` should read the run table instead of the event table, or both. Reading both
  is the honest answer; it is also two queries per page load.

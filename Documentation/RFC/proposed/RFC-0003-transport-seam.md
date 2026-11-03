---
title: Transport seam
rfc: 0003
category: Contract/Transport
kind: rfc
date: 2026-11-02
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: "every command under `Maintain/Source/Command/`"
supersedes: none
superseded_by: none
depends:
    - t_7936cc8e (implements)
    - "`Documentation/Reference/Transport.md` (spec)"
statuses:
    - name: Every command receives a transport rather than importing one
      state: open
      evidence: the rule names no file or command
    - name: There is no automatic fallback
      state: open
      evidence: the rule names no file or command
---

## Decision

Every command receives a transport rather than importing one. Two transports exist: `cdp`, the only
one permitted to mutate, and `view`, a read-only projection over the shadow store. Selection is
`--transport cdp|view`, default `cdp`. A mutating command resolved to `view` fails before any side
effect.

There is no automatic fallback. When CDP is unreachable a read command returns `cdp-unreachable`;
answering from the archive instead would hide a broken browser behind stale data, and the caller
that wants the archive can ask for it.

## Context

The tool layer currently reaches the browser directly from each command, which means three things
happen implicitly: a command decides its own failure mode, a read requires a live browser, and tests
require one too. The seam makes those explicit. Shape parity is the constraint that keeps it
honest - a read from `view` and a read from `cdp` must differ only in the `source` field.

## Alternatives considered

| Option                                          | Why not chosen                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Silent fallback to the archive when CDP fails   | hides a broken browser; the caller cannot tell live data from stale                              |
| A single transport with a `--offline` flag      | the flag ends up threaded through every command; the seam is the same work with a worse boundary |
| Interface per command instead of per capability | duplicates the same twelve methods across twenty commands                                        |

## Consequences

- Commands become transport-blind, so adding a third transport touches one directory rather than
  every command.
- Every mutating command must declare `mutable: false` handling explicitly, which is where a future
  remote transport would need its own authorisation story.
- Tests can run against `view` without a browser, which makes the suite cheap.

## Verification

| Claim                        | Test                                                                   |
| ---------------------------- | ---------------------------------------------------------------------- |
| `view` is read-only          | `post like --id X --transport view` exits 2 with `read-only-transport` |
| Shapes match                 | `post extract` from both transports differs only in `source`           |
| No silent fallback           | stop the browser, `tab list` returns `cdp-unreachable`                 |
| Commands are transport-blind | `grep -rn "Transport/CDP" Maintain/Source/Command` is empty            |

## Open questions

- Whether `view` should ever answer for a post the browser has never shown - it can, because it
  reads the archive, but the `source` field must say so.
- Where a future remote transport would sit relative to `visibility`.

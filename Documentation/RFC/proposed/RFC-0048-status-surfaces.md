---
title: The status surfaces
rfc: 0048
category: Specification/Surface
kind: rfc
date: 2026-11-02
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: the footer band, the rail's security cluster, every surface that states liveness
supersedes: none
superseded_by: none
depends:
    - RFC-0017 (the live layer and offline as a first-class state)
    - RFC-0020 (the trust model)
    - RFC-0026 (peer-carried transport)
    - RFC-0045 (the material)
    - RFC-0046 (the spectrometer)
    - RFC-0047 (the swimlanes)
statuses:
    - name: The footer states liveness, not achievement
      state: open
      evidence: the rule names no file or command
    - name: One baseline across two columns
      state: open
      evidence: the rule names no file or command
    - name: A mark without a state is not drawn
      state: open
      evidence: the rule names no file or command
    - name: Degraded is a state, never a grey
      state: open
      evidence: the rule names no file or command
---

## Decision

Two surfaces state what the machine is doing, and they share one baseline.

- **The footer** sits at the bottom of the composition: a thin band carrying the connection state,
  the sync state, the count of queued writes and the protocol set in use.
- **The rail's security cluster** sits at the bottom of the drum sidebar, aligned to that same
  baseline: the protocol marks and the current network status, in the smallest voice the material
  has.

They are one instrument read across two columns, not two widgets. Four rules make that true.

### 1. The footer states liveness, not achievement

Every value in the footer is a state of the connection or of the queue. None is a count of content.

- **connected / disconnected** - the live layer's state (RFC-0017).
- **synced / syncing** - whether the last write has been acknowledged.
- **queued N** - writes signed and waiting (RFC-0017: signed at authoring, replayed on reconnect).
- **failed N** - writes that failed permanently. This is a named failure, never a silent drop.

A footer that reported post counts or vote totals would be a second, worse canvas. The canvas
already states what was published; the footer states whether the machine can be trusted to publish
it.

### 2. One baseline across two columns

The rail's cluster and the footer share a baseline. The rail is `224` wide and `360` tall in the
composition; the cluster is bottom-aligned inside it, and the footer's first line sits on the same
horizontal. A reader scanning the left edge and the bottom edge reads one line of status.

That alignment is the whole reason the cluster is in the rail rather than beside the footer: the
rail is the only surface present on every workspace page, so it is the only place a persistent
status can live without repeating itself.

### 3. A mark without a state is not drawn

Each protocol mark in the cluster carries a state: `engaged`, `available`, `absent`. A mark with no
state is decoration, and decoration in a security surface reads as an assurance nobody gave.

The set is closed and small - the protocols RFC-0026 and RFC-0013 actually name. A mark for a
protocol this deployment does not implement is not drawn at all (RFC-0046 rule 5, applied here).

### 4. Degraded is a state, never a grey

A disconnected footer is not a dimmed connected footer. It states `disconnected`, in words, with the
same weight as `connected`. The failure this prevents is the common one: a status indicator that
looks slightly different when it is broken, and is read as working.

The same applies to the cluster. A protocol that was engaged and is no longer engaged reads
`absent`, not a faded `engaged`.

## Context

RFC-0017 makes offline a first-class state and RFC-0043 makes publishing the only verb across the
seam. Neither provides a place where the machine's own state is visible. The composition ends at the
canvas, so a person has no way to tell a slow sync from a failed one without opening a console.

The footer and the cluster are that place. They are the only two surfaces in the composition that
report on the system rather than on the content.

## Alternatives considered

**A toast for each state change.** Rejected: a toast is an event, and these are standing states. A
toast that says "disconnected" also has to say it again in ten seconds.

**Status inside the drawer header.** Rejected: the drawer is the private side and is absent from the
published pages, so the status would disappear exactly where a reader most needs to know whether
what they are reading is current.

**A single global status bar at the very bottom of the viewport.** Rejected: it would sit below the
composition rather than inside it, and the composition is the thing being designed.

## Consequences

- The footer is the first surface to become stale if the live layer is not running, so it must be
  rendered from the build with a `static` state rather than omitted. A missing footer is
  indistinguishable from a broken one.
- The cluster's width is `200` inside the rail, which fits four marks and a word. A fifth protocol
  forces a design decision rather than an overflow.
- Both surfaces are cheap to render and expensive to fake, which is the right ratio for a status
  surface.

## Verification

| Claim                                | Test                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| The footer renders without a session | it is present with `Emulation.setScriptExecutionDisabled`, reading `static`    |
| Disconnected is textual              | the rendered node contains the word, not only a colour class                   |
| The cluster shares the baseline      | `verify-composition.mjs` asserts the cluster's bottom equals the rail's bottom |
| A mark carries a state               | a mark rendered without one fails the cluster's prop contract                  |
| Failed writes are counted            | a session with one failed write renders `failed 1`, never `queued 0`           |

## Open questions

- Whether the footer belongs on the published pages as well as the workspace. The composition draws
  it once; a published page has no live layer, so its footer would read `static` permanently.
- Whether the cluster shows the transport cipher or only the protocol family. The cipher is the more
  honest answer and the wider label.
- Whether `failed N` should be actionable from the footer or only from the session layer.

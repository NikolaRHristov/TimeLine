# RFC-0050 - The data states

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** every surface that
reads a collection, the empty and partial states, the failure vocabulary **Kind:** specification
**Subject:** surface **Horizon:** now **Supersedes:** none **Superseded by:** none **Task
dependencies:** RFC-0017 (offline as a first-class state), RFC-0049 (the component states), RFC-0038
(what the operator owes)

## Decision

Every surface that reads a collection has the same six data states, and each one is rendered rather
than implied: `pending`, `ready`, `empty`, `partial`, `stale`, `failed`.

A surface that can only render `ready` is not finished, because every other state is a normal day.

Six rules make that enforceable.

### 1. `empty` is a state with an explanation and a way out

An empty surface states what would fill it and the command that does it. The front page already does
this - it renders the commands that fill the archive rather than a blank grid - and the rule makes
that the standard rather than one page's good habit.

A blank region is not an empty state. A reader cannot tell it from a broken one, and neither can the
next developer.

### 2. `partial` is a state, not an error

Some records read and some did not. The surface renders what it has and states the ratio:
`18 of 20 posts`. It does not throw away the eighteen because two failed, and it does not pretend
the twenty are present.

This is the state most systems lack, and it is the one that matters on a network where a peer can be
unreachable while the rest of the room is fine.

### 3. `stale` states its age

Data older than the build is a state with a timestamp, not a silent value. The archive's own
`firstSeenAt` exists because the interface never exposed when a post was saved (RFC-0017); a surface
that shows a count without its age makes the same claim the interface refused to make.

The timestamp is absolute, not relative, because "2 hours ago" is a claim about now and the page may
be served from a cache tomorrow.

### 4. `failed` is named, with the code

A failure carries the error code the tool layer already uses - `no-config`, `no-post`,
`unknown-list` - and the remedy. The site and the CLI share one vocabulary for failure, so a reader
who sees `no-post` on the page and in the terminal sees the same fact twice rather than two facts.

A failure rendered as "something went wrong" is a failure the operator cannot act on.

### 5. The state is derived, never passed as a flag

A surface computes its state from the read it performed. It is never handed `IsEmpty` or `IsError`
by a parent, because a parent that computes it does so without the collection, and a boolean cannot
carry the ratio, the timestamp or the code.

The state object is one shape: `{ State, Count, Total, At, Code, Remedy }`. A component that needs
less renders less; a component that needs more is a vocabulary change.

### 6. `pending` preserves the frame

While a read is in flight the surface keeps its geometry and states that it is reading. It does not
collapse to a skeleton of a different size, because a skeleton that changes the layout is a second
layout to maintain and a visible jump on every load.

## Context

The repository's rule that an empty archive is a normal state predates any of this: the front page
renders commands when it holds nothing. That instinct is correct and was never generalized, so each
page decides for itself what a missing record looks like. The result is one surface that explains
itself and several that do not.

The site is also read offline from a service worker and, once rooms exist, from a live layer that
can be partly unreachable. Both make `partial` and `stale` ordinary rather than exceptional.

## Alternatives considered

**A single `error` state.** Rejected: it merges "nothing here yet" with "the read failed", and those
need opposite responses from the reader.

**Rendering `partial` as a warning banner over a `ready` surface.** Rejected: the ratio belongs to
the list, not to the page. A banner also implies something is wrong, when a partial read is the
correct result of a peer being offline.

**Relative timestamps.** Rejected on rule 3: a cached page's "2 hours ago" is a false statement by
the time it is read.

## Consequences

- Every surface grows six renderings. That is the cost of not lying, and it is bounded because the
  state object is shared.
- The failure vocabulary is shared with the CLI, so a new error code is a change in one place.
- `partial` makes a peer's unreachability visible without making it alarming, which is the correct
  posture for a network that is expected to have unreachable peers.

## Verification

| Claim                            | Test                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------ |
| Every surface renders `empty`    | build with an empty `Source/Content/`; no page throws and each explains itself |
| `partial` states its ratio       | a read with one unreadable record renders `N of M`, never `M`                  |
| `stale` carries an absolute time | the rendered node contains an ISO date, not a relative phrase                  |
| `failed` carries a code          | a forced read failure renders the code and the remedy, not a generic message   |
| No boolean flags                 | `grep` for `IsEmpty=` in `Source/` returns nothing                             |

## Open questions

- Whether `stale` is per-record or per-surface. A surface where one record is older than the build
  is a real case and the current answer is per-surface, which overstates.
- Whether `partial` should be actionable (retry the missing records) or informational. It is
  informational today.
- How a `failed` state interacts with the service worker's cached copy: whether the cached page
  reports itself as cached, which the footer (RFC-0048) partly answers.

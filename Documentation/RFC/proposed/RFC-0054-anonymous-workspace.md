# RFC-0054 - The anonymous workspace

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** `/Workspace`, the
session slot, every control that requires an identity **Decision class:** product **Supersedes:**
none **Superseded by:** none **Task dependencies:** RFC-0017 (the live layer and offline), RFC-0043
(the seam and the three roles), RFC-0048 (the status surfaces), RFC-0049 (`locked`), RFC-0050 (the
data states), RFC-0053 (the showcase surface)

## Decision

`/Workspace` is public. An unauthenticated reader loads the full composition - rail, drawer, seam,
canvas - with their own drawer, and is never redirected to a sign-in.

Four rules make that safe rather than leaky.

### 1. The server renders the anonymous workspace

The static build emits the composition with an empty drawer and an empty canvas. That is the page
every reader gets before a session exists, and it is the page a service worker caches. Hydration
replaces it only with state it can name (RFC-0043).

There is no gate and no redirect. A gate on the product's own demonstration page means the product
cannot be seen without joining it, which is the opposite of what a network provider should ask.

### 2. The drawer is the reader's own, always

An unauthenticated drawer is **empty**, never a sample and never another person's records. A demo
drawer filled with fictional posts is the standard pattern and it is a lie: the reader cannot tell
which of the rows they own.

An empty drawer is an honest empty state (RFC-0050) - it explains what fills it and the command that
does it.

### 3. Publishing is `locked`, not hidden

Every verb that crosses the seam (RFC-0043) is present and `locked` for an anonymous reader, with
its reason: publishing needs an identity, because a published record carries an author (RFC-0013).

The control is not removed. A hidden control teaches nothing; a locked one teaches the one rule the
product has.

### 4. The status surfaces say `static`

The footer and the rail's cluster (RFC-0048) report `static` - not `disconnected`, which would be
alarming, and not `connected`, which would be false. An anonymous reader is not offline; they have
no live layer at all.

## Context

RFC-0043 defines three roles - reader, member, owner - and a drawer per person. It does not say
whether a reader without an identity may open the workspace, and the default of every product like
this one is that they may not.

For a network provider that "knows nothing about the content" (RFC-0055), gating the workspace is
also incoherent: the page is a shell around the reader's own store, so showing it reveals nothing
the provider holds.

## Alternatives considered

**Redirect to a sign-in route.** Rejected: it makes the product invisible to the person evaluating
it.

**A demo drawer with sample records.** Rejected on rule 2: it is the one place the product would be
lying about whose data is on screen.

**Hiding the drawer entirely until a session exists.** Rejected: the composition is the product. A
page that renders two thirds of it until you join is a worse demonstration than one that renders all
of it and marks three controls `locked`.

## Consequences

- The workspace becomes the entry point of the site, which changes what the showcase pages are for
  (RFC-0053): they explain, the workspace demonstrates.
- `locked` gets its first real use, which validates RFC-0049's distinction from `disabled`.
- The anonymous state must be exercised in the design verifier, because it is now the default state
  of the most important page.

## Verification

| Claim                            | Test                                                                    |
| -------------------------------- | ----------------------------------------------------------------------- |
| No gate                          | a request with no session returns 200 with the full composition         |
| The drawer is empty, not sampled | the anonymous drawer renders zero items and one explanation             |
| Publishing is locked, not absent | the seam's publish control is present with `aria-disabled` and a reason |
| The status reads `static`        | the footer's state is `static`, never `disconnected`                    |
| It survives no-JS                | the no-JS audit (RFC-0048's script) passes on the anonymous page        |

## Open questions

- Whether an anonymous reader may create a local drawer in the browser before joining anything. That
  would make the page a real workspace with a local store, which is a larger decision than this
  record takes.
- Whether the seam's publish control should explain itself on hover or on press for an anonymous
  reader.
- Whether `/` should redirect to `/Workspace` once the showcase pages exist (RFC-0053).

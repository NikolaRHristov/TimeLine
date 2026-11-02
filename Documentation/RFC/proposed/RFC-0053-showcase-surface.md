# RFC-0053 - The showcase surface

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** every public page that
is not the workspace, the uncontained bento, the copy layer **Decision class:** product
**Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0045 (the material),
RFC-0047 (the swimlanes), RFC-0048 (the status surfaces), RFC-0050 (the data states), RFC-0055 (DELO
and the provider position)

## Decision

The pages that **explain** the product are a showcase of the system; the pages that **do** something
keep their data. They render no collection, carry no counts, and hold no records. Their content is
copy and their structure is the composition itself.

Six rules make that enforceable.

### 0. A route that performs an action is not a showcase

The distinction is the route's job, not its position:

- **Explains** - the homepage. A reader arrives knowing nothing, and the page's work is to state
  what the system is. No collection, no counts. This is the showcase.
- **Does** - `/Voted` (a visitor ranks candidates), `/Activity` (the event trail), `/Bookmark`,
  `/List`. Each exists so a reader can _perform_ or _read_ something, and a copy-only version of
  them deletes the feature rather than presenting it.

An earlier draft of this record converted every public route to a showcase, which was wrong for the
reason above: `/Voted` without the vote queue is a page about voting that cannot be voted on. A
showcase surface is the front door, not the building.

A route that does something still follows the material, the data states (RFC-0050) and the component
states (RFC-0049). It is a product surface under the design system, not an exception to it.

### 1. A showcase page reads nothing

No `getCollection`, no vote count, no list. A page that renders a record is a data surface and
belongs under the data-state rules of RFC-0050; a showcase page is `ready` by construction because
it has nothing to be empty of.

The failure this prevents is the half-marketing page: a hero with a live count under it, which is
stale on a cache and reads as a broken dashboard rather than a pitch.

### 2. The bento is uncontained and larger

The workspace's canvas is a six-track grid with a 48px inset and a fixed tile size, because it holds
records that must line up. A showcase canvas has no records to line up, so its boxes are **larger,
fewer, and free of the container**: they bleed to the page edge, carry a single idea each, and use
the same 24px corner and the same three greys.

The result reads as a SaaS page built from the product's own material, which is the point: the page
demonstrates the system rather than describing it.

### 3. The sidebar stays

The provenance rail stays on the left of a showcase page. It is the one element that makes the page
look like the product rather than a landing page that borrowed its colours.

It carries no live data: the drum draws its ladder (RFC-0045) from the page's own copy sections, so
the rail becomes a table of contents with the product's own depth metaphor.

### 4. Large headings, and copy that is the content

A showcase page is read in headings. The type scale gains one step above `--text-2xl` for this
surface only, and the body copy is short enough that a heading plus two sentences carries a section.

Copy lives in `Content/` and is baked in at build time like every other string. No sentence is
written into a component.

### 5. No call to action that the product cannot honour

A showcase page may invite a reader to the workspace (RFC-0054) because that route is public. It may
not invite them to "sign up", "request access" or "book a demo" - none of which this deployment can
perform, and all of which are the standard furniture of a page that has nothing to show.

## Context

The repository's public pages were built to render an archive. Once the archive is thin - which it
is on a fresh clone, and which it is by design for anyone hosting their own - those pages are empty
states dressed as products. RFC-0050 makes an empty state honest; it does not make it persuasive.

A showcase surface is the honest alternative: it shows what the system is, using the system's own
material, and leaves the data to the workspace where a person's own records live.

## Alternatives considered

**Keep the data pages and add a marketing hero above them.** Rejected: the hero promises and the
list below it delivers a count of zero.

**A separate design for the marketing pages.** Rejected: two design systems in one tree is the drift
RFC-0045 exists to prevent, and the showcase's whole argument is that the product looks like this.

**Contained bento, same as the workspace.** Rejected: the container is a constraint that exists to
align records. With no records it is only a smaller canvas.

## Consequences

- The public surface stops being a view of one person's archive and becomes a description of the
  system, which changes what a first-time visitor sees.
- The type scale grows one step, which the token contract will require to have a reader.
- The rail gains a second use - table of contents - without a second component.

## Verification

| Claim                               | Test                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| A showcase page reads no collection | `grep` for `getCollection` in the page returns nothing                       |
| It is `ready` with no data          | build with an empty `Source/Content/`; the page renders identically          |
| The rail is present                 | the page mounts the rail component, and the verifier asserts its 224px width |
| No unhonourable action              | `grep` for "sign up", "demo", "request access" in the page returns nothing   |
| Copy is not inline                  | every sentence resolves through `@Library/Content.ts`                        |

## Open questions

- Whether the showcase pages share one route prefix or sit at the root beside the workspace.
- Whether the uncontained bento needs its own grid definition or can reuse the canvas's with a bleed
  modifier.
- How many showcase pages exist before the set becomes a marketing site rather than a demonstration.

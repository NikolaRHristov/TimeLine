---
title: The showcase surface
rfc: 0053
category: Architecture/Surface
kind: rfc
date: 2026-11-02
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: every public page that is not the workspace, the uncontained bento, the copy layer
supersedes: none
superseded_by: none
depends:
    - RFC-0045 (the material)
    - RFC-0047 (the swimlanes)
    - RFC-0048 (the status surfaces)
    - RFC-0050 (the data states)
    - RFC-0055 (DELO and the provider position)
statuses:
    - name: The workspace is the only data surface
      state: open
      evidence: the rule names no file or command
    - name: A showcase page reads nothing
      state: open
      evidence: the rule names no file or command
    - name: The bento is uncontained and larger
      state: open
      evidence: the rule names no file or command
    - name: The sidebar stays
      state: open
      evidence: the rule names no file or command
    - name: Large headings, and copy that is the content
      state: open
      evidence: the rule names no file or command
    - name: No call to action that the product cannot honour
      state: open
      evidence: the rule names no file or command
---

## Decision

The pages that **explain** the product are a showcase of the system; the pages that **do** something
keep their data. They render no collection, carry no counts, and hold no records. Their content is
copy and their structure is the composition itself.

Six rules make that enforceable.

### 0. The workspace is the only data surface

Every route that is not `/Workspace` is a showcase: no collection reads, no counts, no records. The
workspace holds the data - the drawer's columns are the Voted queue, the curated picks and the
activity trail, and the canvas is the published side.

This is one rule with one consequence: **a reader who wants to do something goes to the workspace; a
reader who wants to understand something reads a showcase page.** Splitting it any other way
produces two half-surfaces that each explain a feature they cannot perform.

An earlier draft of this record drew the line at "does the route perform an action", keeping
`/Voted` and `/Activity` as data pages because a vote queue is a thing you can do. That was wrong
twice over: it contradicted the product decision that the archive lives in one place, and it left
the drawer's own Voted column competing with a second, public vote queue for the same records.

A showcase page still follows the material (RFC-0045), the component states (RFC-0049) and the data
states (RFC-0050) - it simply has no data to be in a state about.

**The one exception is a record detail route.** `/Bookmark/<id>` and `/List/<slug>` render one
record, because a link has to point at something and a shared permalink that resolves to marketing
copy is a broken link. A detail route is a projection of the canvas, not a showcase, and it keeps
its data.

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

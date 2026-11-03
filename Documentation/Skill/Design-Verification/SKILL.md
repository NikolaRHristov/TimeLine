---
name: design-verification
description: Use when a built page must be proven to match a design, not merely to compile.
version: 1.0.0
author: TimeLine
license: MIT
platforms: [macos]
metadata:
    hermes:
        tags: [design, verification, cdp, geometry, figma, scss]
---

# Design Verification

A green `astro build` proves a page compiled. It does not prove the composition is the composition.
This skill is the check between those two facts: serve the build, drive it in a real browser, and
compare the measured geometry against numbers that were read from the design file.

The authority is `Documentation/Reference/Design-Composition.md`. The check is
`Reference/verify-composition.mjs`. Neither is a test suite - the script is ad-hoc verification, and
it says so when it fails.

## When to use

- A component was built or restyled against a design and the result must be proven, not eyeballed.
- A layout "looks wrong" and the stylesheet looks right - which is the signature of a rule that
  never reached the page.
- A design reference was inferred from a screenshot and has to be replaced with measured values.

## The two facts a screenshot cannot give you

**A stylesheet that is not imported does nothing.** `.workspace` rendering as `display: block` with
a correct `display: flex` rule in a correct `.scss` file means the sheet was never imported by the
component. The build succeeds, the class names match, and the layout is a column. Check the import
before checking the rule.

**A probe reads a cached page.** Chromium keeps the document across a rebuild, so a probe run after
a build can report the previous geometry with no error. Cache-bust the URL (`?v=$(date +%s)`) or the
result describes the page that used to exist.

## Running it

```sh
node Documentation/Skill/Design-Verification/Reference/verify-composition.mjs
```

With no arguments it waits for the build to stop writing, serves a copy of `Target/` on port 4411
itself, probes `/Workspace/`, prints one line per invariant and exits 0 when every one holds.

The copy is the point: `astro build` empties the output directory before it writes, so a probe that
serves the live tree while another agent's build runs sees zero routes and reports each as "the
route served no document" - a total failure that is in the observer, not the page. What the snapshot
guarantees is narrower than coordination with the builder: it is a quiet-time heuristic. It waits
until the newest mtime under `Target/` has been quiet for 1.5s, records that mtime, copies, and
re-reads it; a tree that moved across the copy is thrown away and the wait starts again, and a tree
still being written after 180s is a blocker rather than a snapshot of whatever was on disk. A build
that starts in the instant between the quiet check and the copy is therefore still possible - the
re-read catches it, so the run retries or blocks, but nothing prevented the overlap.

| Argument or variable | Effect                                                  |
| -------------------- | ------------------------------------------------------- |
| `--url <url>`        | Probe a server already running instead of spawning one. |
| `PORT`               | The port it serves on. Default `4411`.                  |
| `CDP_URL`            | The browser endpoint. Default `http://127.0.0.1:9222`.  |

Exit codes: `0` every invariant held; `1` at least one broke, or an element an invariant names is
absent from the page; `2` only that the check could not run - no build, no browser, or a route that
served no document. A `2` names the command that fixes it, because a missing browser is not the
page's fault. An absent element is never a `2`: it prints as `ABSENT` with the selector that stopped
matching, because a deleted component reported in the precondition class is a page defect filed
where the reader is told not to look.

## The invariants

The frame, in the page's own coordinates: the rail is `224 × 360` and level with the drawer; the
drawer starts at `240` (the rail plus the ground showing through); the seam is `40` tall directly
under it; the canvas is `900` tall directly under that. The drum draws thirteen bands and its ladder
reads `8, 10, 12, 16, 22, 28, 44, 28, 22, 16, 12, 10, 8` from edge to centre and back.

The composition then grows downward. Three bands follow the canvas on its own 20px rhythm, in the
order a reader meets them - the swimlanes, the spectrometer, the status footer - and the rail's
security cluster is bottom-aligned in the rail column, so its last mark sits on the footer's
baseline. The lane air is measured against the canvas's own gap rather than against a literal, so
the invariant survives a change to either. The footer's four values are asserted as words, because a
status band that reports itself only in colour is the failure RFC-0048 exists to prevent.

Those are the numbers that a screenshot cannot distinguish and a stylesheet can silently lose.

The seam is also measured for its state, because `/Workspace` is public and the build's own state is
the anonymous one (RFC-0054): the publish control must read `locked` with `aria-disabled="true"`,
and its note must state the reason a drop cannot cross - a published record carries an author. A
page whose seam silently offered the verb would pass every geometric invariant and still be wrong,
which is why the state is asserted beside the frame.

## The showcase pages

Five pages that are not the workspace are the showcase surfaces (RFC-0053), and they have their own
script:

```sh
node Documentation/Skill/Design-Verification/Reference/verify-showcase.mjs
```

It serves the same build, probes `/`, `/Bookmark`, `/List`, `/Voted` and `/Activity` at 1440 wide,
and asserts what a showcase page can be wrong about: the rail is 224 wide, sits at the page's left
edge and stays in view while the page is read; the hero takes the one extra type step (48px); the
page holds three boxes, each bleeding to the page's own edge with the tile's 24px corner on the side
that is still inside the page, in the canvas's own three greys; the rail is a table of contents
whose every band resolves to a section that exists; and no record is drawn at all - no canvas, no
drawer, no seam.

The last one is the point of the whole check. A showcase page that grew a tile would still look
right, and would have become a data surface - the state RFC-0053 exists to keep it out of.

**`/Showcase` is the sixth page that is not the workspace, and it has its own probe.** It
demonstrates the layout primitive with six dispersed boxes rather than three, so the three-box,
three-grey invariants describe a surface it is not:

```sh
node Documentation/Skill/Design-Verification/Reference/verify-spread.mjs
```

That script asserts what the spread claims: consecutive boxes sit at different horizontal offsets,
the vertical gap exceeds the canvas's own 20px rhythm, and the page ends on a three-column pillar
band. A spread whose boxes lined up would still pass a "no record is drawn" check and would have
lost the only thing it demonstrates.

The route inventory is the tree's own: `find Target -name index.html` lists every page the build
emitted, and a route that appears there and in none of the three probes is unverified rather than
passing. A count written into this file is a claim about the route set and goes stale the moment a
page is added.

## Extending it

An invariant is one line in the `Frame` table: a label, a reader over the measured box, and either a
literal or a function of the other measurements. Add the measurement to `Probe` when the reader
needs something the page does not already expose - the band heights were added that way, after an
assertion compared against `None` and reported a failure the page had not committed.

A new invariant must be a fact from the design file. An invariant invented from the implementation
proves the implementation agrees with itself.

## Claim → test

| Claim                                   | Test                                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| The workspace matches the frame         | `node .../verify-composition.mjs` exits 0 and every line reads `PASS`                         |
| An absent element fails, and is named   | delete `class=bento` from a copy of the build: exit 1 and `ABSENT  .bento is not in the page` |
| A snapshot refuses an unsettled tree    | run it against a tree that never stops being written: exit 2, and nothing is served           |
| A probe reads a settled build           | run it while `pnpm run build` runs: exit 0, not "served no document"                          |
| Every emitted route is probed           | `find Target -name index.html` lists only routes one of the three probes names                |
| The seam states its state, not a title  | the workspace probe reports `locked/true` and the reason, not a record name                   |
| No record is drawn on a showcase page   | `verify-showcase.mjs` reports `no record is drawn on the page`                                |
| A missing precondition is not a failure | with no browser on `CDP_URL`, the exit code is 2 and the fix is printed                       |

## References

| File                     | Covers                                                                 |
| ------------------------ | ---------------------------------------------------------------------- |
| `verify-composition.mjs` | Serve, probe and assert the built workspace against the spec           |
| `verify-showcase.mjs`    | Serve, probe and assert the five showcase pages against RFC-0053       |
| `verify-spread.mjs`      | Serve, probe and assert `/Showcase` against the spread it demonstrates |

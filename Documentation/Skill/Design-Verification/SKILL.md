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

With no arguments it serves `Target/` on port 4411 itself, probes `/Workspace/`, prints one line per
invariant and exits 0 when every one holds.

| Argument or variable | Effect                                                  |
| -------------------- | ------------------------------------------------------- |
| `--url <url>`        | Probe a server already running instead of spawning one. |
| `PORT`               | The port it serves on. Default `4411`.                  |
| `CDP_URL`            | The browser endpoint. Default `http://127.0.0.1:9222`.  |

Exit codes: `0` every invariant held, `1` at least one broke, `2` a precondition was missing - no
build, or no browser. A `2` names the command that fixes it, because a missing browser is not the
page's fault.

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

The five pages that are not the workspace are showcases (RFC-0053), and they have their own script:

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

## Extending it

An invariant is one line in the `Frame` table: a label, a reader over the measured box, and either a
literal or a function of the other measurements. Add the measurement to `Probe` when the reader
needs something the page does not already expose - the band heights were added that way, after an
assertion compared against `None` and reported a failure the page had not committed.

A new invariant must be a fact from the design file. An invariant invented from the implementation
proves the implementation agrees with itself.

## References

| File                     | Covers                                                           |
| ------------------------ | ---------------------------------------------------------------- |
| `verify-composition.mjs` | Serve, probe and assert the built workspace against the spec     |
| `verify-showcase.mjs`    | Serve, probe and assert the five showcase pages against RFC-0053 |

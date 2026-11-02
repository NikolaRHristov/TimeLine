---
name: progressive-enhancement
description: Use when a page must paint before its JavaScript runs.
version: 1.0.0
author: TimeLine
license: MIT
platforms: [macos]
metadata:
    hermes:
        tags: [astro, solid, hydration, no-js, audit, cdp]
---

# Progressive Enhancement

The site is a static archive behind a service worker, so a reader with a cold cache, a blocked
script or a browser that never runs one must still see the archive. Every surface therefore has two
jobs: paint itself from the build, then hydrate for interaction. A surface that renders its content
only after hydration has one job, and it is the wrong one.

The rule is one sentence: the first paint is the server's, and JavaScript only makes it interactive.

## The first paint is the server's

A page reads its content at build time from the content collections and renders it into HTML. That
is what the service worker caches and what a script-free reader sees.

- **Props carry the data; the island never fetches it.** `Source/pages/Workspace/index.astro` reads
  the collections and hands `Stages`, `Columns` and `Tiles` to the island as plain objects. The
  island holds state for what a person is doing right now - which stage is selected, which record is
  open - and nothing else. An island that fetched its own content would render an empty frame first.
- **`client:visible` over `client:load`.** A `client:load` island competes with the first paint for
  the main thread; `client:visible` lets the canvas paint and boots when the island is on screen.
  The workspace fills the viewport, so it hydrates immediately in practice - the directive only
  changes who wins the first frame.
- **`client:only` never sits on a content surface.** It renders nothing at build time, so the page
  ships an empty box and a script fills it. The audit fails on it outright.
- **Interaction may be absent without scripts.** A button that does nothing is acceptable; a row, a
  tile or a heading that is missing is not. That distinction is the whole scope of this skill.

## A visible island needs a rendered frame

`client:visible` observes the island's children with an `IntersectionObserver`, and the observation
only delivers while the page is being rendered. Two conditions break it, both of which look like a
broken component rather than a broken environment:

- **A background tab is never rendered.** A target created with `background: true` - the polite way
  to open a tab in someone's own browser - receives no rendering updates, so the observer stays
  silent and the island never hydrates. The audit calls `Page.bringToFront` for this reason. A real
  reader's tab is in front, so this is an audit-environment rule, not a product defect.
- **An observer target with no box never intersects.** Astro styles `astro-island` as
  `display: contents`, which is why the directive observes children rather than the island itself. A
  child that is itself `display: contents`, `display: none` or zero-height keeps the island dormant.

A `client:visible` island that stays static is diagnosed by reading the `ssr` attribute: the runtime
removes it on hydration, so `document.querySelector("astro-island[ssr]")` still matching means the
directive never fired. The audit reports that as `js=static` and warns that the parity comparison
measured two static renders.

## The audit

```sh
node Documentation/Skill/Progressive-Enhancement/Reference/no-js-audit.mjs
```

It serves `Target/` on loopback, launches its own headless browser on a throwaway profile, and loads
every built route twice over CDP: once with `Emulation.setScriptExecutionDisabled`, once normally.

- **The script-free pass is the measurement.** `Runtime.evaluate` still answers while page script
  execution is disabled - the switch stops the document's own scripts, not the debugger's - so the
  pass reports what the first paint actually shows, with layout. "Visible" is a layout fact: a node
  inside `display: none` or a zero-height wrapper is present in the markup and absent from the page.
- **Parity is the rule that catches the defect.** For every selector a route profile names, the
  script-free render must show at least as much as the hydrated one. Content that appears only in
  the second pass fails with `content waits for hydration`.
- **Discovery is the guard against a silent skip.** Every `index.html` in the build is audited. A
  route with no profile still gets the generic checks (title, `<main>` text, a visible `<h1>`,
  island SSR) and is reported as `generic`, so a new page cannot pass by being unknown.
- **Exit code 1 means at least one route failed.** The report lists every route, pass or fail, and a
  failing route is named in the run's result rather than dropped.

| Flag          | Effect                                                      |
| ------------- | ----------------------------------------------------------- |
| `--root`      | The build directory to audit; defaults to `./Target`.       |
| `--origin`    | Audit an already-served origin instead of serving `--root`. |
| `--route`     | Audit one route; repeatable.                                |
| `--browser`   | The Chromium binary; overrides `$NO_JS_AUDIT_BROWSER`.      |
| `--json`      | Machine-readable report, including both passes' counts.     |
| `--timeout`   | Per-command CDP timeout in milliseconds.                    |
| `--keep`      | Leave the browser profile behind for inspection.            |
| `--self-test` | Audit a generated fixture and require it to fail.           |

The browser binary is configuration, never a constant: `--browser`, then `$NO_JS_AUDIT_BROWSER`,
then the first installed candidate (Chrome, Chromium, Brave, a Playwright cache). A clone on another
machine needs no edit.

## Adding a route

A new page is audited the moment it builds, and its expectations are a table entry in the script:

```js
{
	Path: "/Voted/",
	Title: "h1.sheet__title",
	Require: [{ Selector: "article.sheet", Min: 1 }],
	Some: [[{ Selector: ".roster__row", Min: 1 }, { Selector: ".note", Min: 1 }]],
}
```

`Require` is a minimum visible count per selector. `Some` is a group of alternatives, at least one
of which must hold - that is how an empty archive passes: the page shows rows when there is content
and a note when there is none, and both are complete first paints. A dynamic route names its
variable segment with `:`, so `/Bookmark/:Id/` covers every built post.

Expectations are structural selectors, not counts of records: a count that depends on the archive
would make the audit fail on a fresh clone, which is a normal state.

## Proving the audit bites

An audit that cannot fail is decoration. `--self-test` generates a page that satisfies every
structural rule and still renders its rows from a script, then requires the audit to fail on it:

```sh
node Documentation/Skill/Progressive-Enhancement/Reference/no-js-audit.mjs --self-test
# self-test passed: the fixture failed on 3 rules, including hydration parity and an empty island
```

Exit code 0 means the rules fired. Exit code 1 means one of them stopped catching the defect it
exists for, and the fixture's report is printed so the gap is visible. The fixture is generated by
the script rather than archived beside it, so the negative control cannot drift away from the rules
that are supposed to catch it. Run the self-test after changing the audit itself.

A build that is still writing shows up as a route serving no document at all - no title, an empty
`<main>` - which the verdict names as such rather than reporting a content defect. A page that
genuinely lost its content fails the selector rules instead.

## Claim → test

| Claim                                      | Test                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Every built route renders without scripts  | `node .../no-js-audit.mjs` exits 0 and prints one `PASS` line per route                                              |
| The workspace island hydrates              | the audit's `/Workspace/` line ends in `js=hydrated`                                                                 |
| A route's content is not hydration-only    | the route line carries no `content waits for hydration` failure                                                      |
| The audit catches the defect it exists for | `--root "$TMPDIR/no-js-fixture"` exits 1 with `content waits for hydration`                                          |
| The island boots after the canvas paints   | the built HTML carries `<astro-island ... client=visible>`; `grep -c 'client=load' Target/Workspace/index.html` is 0 |

## References

| File              | Covers                                                        |
| ----------------- | ------------------------------------------------------------- |
| `no-js-audit.mjs` | The audit: two CDP passes, route profiles, verdict, exit code |

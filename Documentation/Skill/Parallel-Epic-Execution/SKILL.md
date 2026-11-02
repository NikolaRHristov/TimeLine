---
name: parallel-epic-execution
description: "Use when agents share an epic - defer builds to the end."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos, linux]
metadata:
    hermes:
        tags: [agents, kanban, builds, prototyping, coordination]
---

# Parallel Epic Execution

When several agents work the same tree, the build is the bottleneck, not the writing. Every
`astro build`, `pnpm install`, `spacetime build` or scrape run is minutes long and takes the tree
out of other agents' hands. Defer them.

## When to Use

- Several agents or cards are working the same repository at once.
- An epic spans many small edits and the temptation is to build after each one.
- A worker is about to run `astro build`, `pnpm install`, a scrape sweep, or a SpacetimeDB publish
  to "check" a one-line change.
- You are the coordinator deciding what runs now and what waits for the boundary.

Do not use it for a single-agent, single-change task - there the build _is_ the check, and deferring
it just delays the answer.

## The rules

1. **No build per edit.** A worker that changed TypeScript does not run the site build, does not
   reinstall dependencies, and does not re-scrape. It runs the narrowest thing that proves its own
   change: the package's `check`, or a single `node` invocation of the command it touched.
2. **Validate at the epic boundary, once.** The coordinator runs the full pass - `pnpm run check`,
   the site build, formatting, the module build - after the last card in the epic lands. Doing it
   per card repeats the same minutes N times and tells you nothing new.
3. **Storage is not rebuilt.** The shadow store, the scraped reference cache and the SpacetimeDB
   projection are append-only and expensive to produce. A code change never justifies re-scraping;
   only a new source or a parser fix does.
4. **One writer per tree.** Before dispatching parallel work, split by file ownership. Two workers
   editing `Maintain/Source` and the site at once is fine; two workers editing the same folder is a
   merge conflict with extra steps.
5. **A rename lands whole.** Folder renames and their import updates go in one pass, never
   half-applied - a half-renamed tree fails every other worker's check and looks like their bug.
6. **Report the deferred cost.** Say plainly which validation was skipped and when it will run, so a
   green narrow check is never mistaken for a green epic.

## What each worker runs instead

| Change                               | Run                                             | Do not run                 |
| ------------------------------------ | ----------------------------------------------- | -------------------------- |
| `Maintain/Source/**/*.ts`            | `pnpm run check` in `Maintain`                  | site build, `pnpm install` |
| `Maintain/Spacetime/spacetimedb/src` | `spacetime build`                               | publish, server restart    |
| Site pages/styles                    | nothing, or `astro check` if it is already warm | full `astro build`         |
| Docs only                            | `prettier --check` on the touched files         | anything else              |
| Command behaviour                    | that one command, `--dry-run` where it exists   | a scrape sweep             |

## The epic boundary

At the end, one pass, in this order - each step cheap enough that failing early saves the rest:

1. `pnpm run check` (types)
2. `spacetime build` (module types + wasm)
3. `pnpm exec prettier --check .` (style)
4. `pnpm run build` (site - the expensive one, last)
5. a single scrape of the source the epic touched, if it touched a parser

## Pitfalls

- **A worker that "helpfully" reinstalls** invalidates every other worker's `node_modules` mid-run.
  Install once at the start of an epic, never inside it.
- **`astro build` needs Node >= 22.23.4.** A worker on an older node reads that as a broken repo and
  starts fixing what is not broken. Check `node --version` before blaming the code.
- **Prefix `pnpm` with `timeout` to keep it in the foreground.** Some runtimes background a bare
  `pnpm run …` and report the wrapper's status instead of the check's, which reads as "unverified".
  `timeout 300 pnpm run check` returns the real exit code.
- **Put the newer Node on `PATH` inside the same command.**
  `PATH="…/v26.5.1/bin:$PATH" timeout 420 pnpm run build` passes; the same build fails with
  `Node.js v22.23.0 is not supported by Astro` when the bundled interpreter wins.
- **A per-card build hides real breakage** behind noise: the failure you see is usually another
  worker's in-progress file, not yours. That is exactly why validation belongs at the boundary,
  after the tree stops moving.
- **Skipping validation entirely is not the rule.** Deferring is not dropping: an epic that ends
  without the boundary pass is unfinished.
- **A card that rewrites files another card owns mid-run is a blocked card, not a race.** When a
  scope reversal puts two cards on the same file, the later record has to be amended before either
  worker continues - guessing which record wins costs one of them the whole run. Stop and escalate;
  the cost of one blocked card is smaller than two implementations of one page.
- **A restore after a reversal is a byte-identical copy, proven by hash.** Take the file from the
  commit or the preserved copy, write it, then compare `git hash-object <path>` with
  `git rev-parse <commit>:<path>` (or `cmp` against the preserved copy). A restore that only looks
  right is a second implementation, and the measurements made against the first one no longer
  describe it.

## Claim → test

| Claim                          | Test                                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| No build ran per edit          | the epic's git log has no build-output churn between feature commits |
| Validation ran once            | one `pnpm run check` at the end, not N                               |
| Storage untouched by code work | shadow post count unchanged by a code-only card                      |
| Ownership was disjoint         | no two concurrent cards touched the same folder                      |
| A restore is the original      | `git hash-object` of every restored file equals its source blob      |

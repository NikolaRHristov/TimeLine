---
title: A verifier asserts the spec, not the implementation
rfc: 0072
category: Method/Operation
kind: rfc
date: 2026-11-03
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: "every verifier under `Documentation/Skill/*/Reference/`"
supersedes: none
superseded_by: none
depends:
    - RFC-0037 (what can be proven before a second host exists)
    - RFC-0045 (the component contract)
    - RFC-0049 and RFC-0048 (the state and the status words the composition asserts)
    - |-
        RFC-0053 (the showcase surface); implementing card to be created: "A spec-to-verifier link that fails when the spec moves"
statuses:
    - name: The spec names the verifier, and the verifier names the spec
      state: current
      evidence: Documentation/Skill/Design-Verification/Reference/verify-composition.mjs
    - name: An invariant is a fact from the design record
      state: current
      evidence: "verify-composition.mjs:84-89"
    - name: Transcription is manual and the record says so
      state: current
      evidence: Documentation/Skill/Design-Verification/Reference/verify-composition.mjs
    - name: A verifier drives the built page in a browser
      state: current
      evidence: "no-js-audit.mjs:17-20"
    - name: "A verifier has three exit codes, and `2` is not a defect"
      state: current
      evidence: "verify-composition.mjs:288"
    - name: A probe tolerates an absent node, so a missing part fails rather than blocks
      state: current
      evidence: "verify-showcase.mjs:60-63"
    - name: A count invariant guards every universal one
      state: current
      evidence: "verify-showcase.mjs:67"
    - name: An inequality states the inequality it asserts
      state: current
      evidence: "verify-spread.mjs:160-164"
    - name: A verifier states what it does not measure
      state: current
      evidence: "verify-composition.mjs:5"
---

## Decision

Every surface has a runnable verifier, its invariants are facts transcribed from the design record
rather than observations of the code, and its exit status separates "the page broke" from "the check
could not run". A verifier whose invariants were read off the implementation proves only that the
implementation agrees with itself.

1. **The spec names the verifier, and the verifier names the spec.**
   `Documentation/Reference/Design-Composition.md:206` names
   `Documentation/Skill/Design-Verification/Reference/verify-composition.mjs`, and that file's
   header at `:3` names the document back. A verifier that names no spec asserts nothing a reader
   can check, and a spec that names no verifier states numbers nobody runs.
2. **An invariant is a fact from the design record.** The rule is already written down at
   `Documentation/Skill/Design-Verification/SKILL.md:108-109`: an invariant invented from the
   implementation proves the implementation agrees with itself. An invariant may be derived from
   another measurement rather than a literal - `the lane air exceeds the canvas gap` compares two
   probes (`verify-composition.mjs:84-89`) - because the derivation still reads the page, not the
   source.
3. **Transcription is manual and the record says so.** The verifier does not parse the spec. It
   reads no file:
   `grep -c readFileSync Documentation/Skill/Design-Verification/Reference/verify-composition.mjs`
   answers `0`, and the only mention of the document in the file is the header comment. The spec is
   the invariant's provenance, not its input. The consequence is stated rather than hidden: editing
   a number in `Design-Composition.md` does not fail the verifier, it orphans the invariant until
   somebody re-types it.
4. **A verifier drives the built page in a browser.** `no-js-audit.mjs:17-20` states why: "visible"
   is a layout fact, and a node inside a `display:none` wrapper, a closed `<template>` or a
   zero-height container is present in the markup and absent from the page. The audit therefore
   launches its own Chromium with `--remote-debugging-port=0` and a fresh profile
   (`no-js-audit.mjs:596-618`), rather than reading `Target/` as text.
5. **A verifier has three exit codes, and `2` is not a defect.** `0` every invariant held, `1` at
   least one broke, `2` a precondition was missing - no build, no browser. The three design
   verifiers agree on this (`verify-composition.mjs:288`, `verify-spread.mjs:149`,
   `verify-showcase.mjs:266`); the no-JS audit uses only `0` and `1` (`no-js-audit.mjs:1288-1295`),
   because it owns its browser and so has no external precondition.
6. **A probe tolerates an absent node, so a missing part fails rather than blocks.**
   `verify-showcase.mjs:60-63` optional-chains every reader and `:122` filters missing nodes, so a
   deleted rail yields `undefined` and a `FAIL`. `verify-composition.mjs:147-149` dereferences
   `getComputedStyle(document.querySelector(...))` unconditionally, so the same deletion throws
   inside `Runtime.evaluate`, the JSON parse at `:237` fails, and the run exits `2` - a page defect
   reported in the precondition class. The second shape is the defect this rule forbids.
7. **A count invariant guards every universal one.** `Array.prototype.every` over an empty array is
   `true`, so `boxes.every(...)` passes for a page that draws no boxes (`verify-showcase.mjs:67`,
   `:72`; `verify-spread.mjs:162`, `:167`). `verify-showcase.mjs:64` asserts `boxes.length === 3`
   and `verify-spread.mjs:152` asserts `six boxes`, and those two are what make the universal claims
   mean anything.
8. **An inequality states the inequality it asserts.** `verify-spread.mjs:160-164` asserts
   `gaps.every(Gap => Gap > 20)` - the canvas rhythm as a floor, not the design's own gap. That is a
   deliberate weaker claim and it is the claim the label makes. A verifier that asserts `> 20` under
   a label reading "the gap is 5.5rem" would be a verifier nobody can read.
9. **A verifier states what it does not measure.** `verify-composition.mjs:5` calls itself ad-hoc
   verification rather than a test suite, and `SKILL.md:20-21` repeats it. The boundary is part of
   the contract: one viewport, no interaction, no colour beyond one literal seam background, no
   accessibility beyond `aria-disabled` and the four status words.

## Context

Three verifiers and one audit exist and pass. Their counts are measured, not asserted:

| Verifier                                               | Invariants         | Command that counts them                                                                             |
| ------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `Design-Verification/Reference/verify-composition.mjs` | 22                 | `grep -c '^	\[' Documentation/Skill/Design-Verification/Reference/verify-composition.mjs`             |
| `Design-Verification/Reference/verify-spread.mjs`      | 7                  | `grep -c '^	Check(' Documentation/Skill/Design-Verification/Reference/verify-spread.mjs`              |
| `Design-Verification/Reference/verify-showcase.mjs`    | 11 × 5             | `grep -c '^	\[' Documentation/Skill/Design-Verification/Reference/verify-showcase.mjs`                |
| `Progressive-Enhancement/Reference/no-js-audit.mjs`    | 2 passes per route | `grep -n "scripts off and on" Documentation/Skill/Progressive-Enhancement/Reference/no-js-audit.mjs` |

Two counts circulate for the composition verifier, eighteen and twenty-two, and the `Frame` table at
`verify-composition.mjs:40-105` holds twenty-two. The count command above settles it, which is the
reason this record states a command beside every number.

The showcase verifier's eleven invariants run over five hardcoded routes (`verify-showcase.mjs:35`):
`/`, `/Bookmark`, `/List`, `/Voted`, `/Activity`. A sixth page added to the build is invisible to
it, and the no-JS audit's notion of "showcase" differs - it profiles `/Activity/` itself and treats
`/Showcase/` as generic (`no-js-audit.mjs:158-162`, `:934-936`). Two verifiers disagreeing about
which routes are showcase pages is the drift this record's rule 1 prevents: the route list belongs
to the spec, not to a literal in each script.

The three design verifiers each re-implement the same CDP client (`verify-composition.mjs:169-238`,
`verify-showcase.mjs:139-208`, `verify-spread.mjs:49-115`) with no shared module, and three of them
require an externally running browser on `CDP_URL` while the audit launches its own. That
duplication is why the exit-code vocabulary had to be written down as a rule rather than left to
each file.

The no-JS audit is the only verifier wired into `package.json` (`:15`, as `Audit`); the three design
verifiers are run by hand. No build step invokes any of them - the boundary RFC-0074 draws.

## Alternatives considered

| Option                                                           | Why not chosen                                                                                                                                |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Parse `Design-Composition.md` in the verifier and assert from it | the spec is prose with tables, not a data file; a parser for it would be a second spec nobody reviews, and rule 3 records the honest limit    |
| Assert the built CSS instead of the rendered page                | a rule in a stylesheet that is never imported does nothing (`SKILL.md:32-35`), so a CSS assertion passes on a page that renders as a column   |
| Read `Target/` as text and match markup                          | markup presence is not visibility - `no-js-audit.mjs:17-20` names the three ways a node is in the document and not on the page                |
| One shared CDP client module for all four                        | it would be the right shape, but the three design verifiers are workstation checks whose duplication is a smaller cost than their convergence |
| Treat exit `2` as a pass                                         | a missing browser is not the page's fault, but a missing rail reported as `2` would then be a pass - rule 6 is the distinction                |
| Count invariants per route instead of per assertion              | `verify-showcase.mjs:254` reports `34 invariant(s) broke` across routes, which is the number a reader can act on                              |

## Consequences

- A new surface needs a verifier before it needs a stylesheet, because the spec is written first and
  the verifier is what makes the spec checkable.
- Every number in the spec is typed twice, once in prose and once in the `Frame` table, and a wrong
  digit survives both hops - the verifier then proves the build agrees with the typo.
- The three design verifiers are workstation tools: they need a browser on `CDP_URL` and a `Target/`
  above the script, so they cannot run in CI without a headless browser provisioned first.
- The exit-code split means a red run has to be read, not just counted: `2` from
  `verify-composition.mjs` may be a precondition or may be a page that lost a part.
- An invariant can be weakened by editing one literal, and nothing fails when it is. The count
  invariants and the label text are the only pressure against that.
- A verifier that measures one viewport cannot notice a composition that holds at 1440 and collapses
  at 390.

## Verification

| Claim                                    | Test                                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The composition verifier passes          | `node Documentation/Skill/Design-Verification/Reference/verify-composition.mjs` → 22 `PASS`, `RESULT: the composition matches the spec`, exit 0    |
| It holds twenty-two invariants           | `grep -c '^	\[' Documentation/Skill/Design-Verification/Reference/verify-composition.mjs` → `22`                                                    |
| It reads no file                         | `grep -c readFileSync Documentation/Skill/Design-Verification/Reference/verify-composition.mjs` → `0`                                              |
| The spec names it                        | `grep -n "verify-composition" Documentation/Reference/Design-Composition.md` → one line, in the composition section                                |
| It names the spec                        | `grep -n "Design-Composition" Documentation/Skill/Design-Verification/Reference/verify-composition.mjs` → one line, the header comment             |
| The spread verifier passes               | `node Documentation/Skill/Design-Verification/Reference/verify-spread.mjs` → 7 `PASS`, `RESULT: the spread renders as designed`, exit 0            |
| The spread asserts an inequality         | `grep -n "Gap > 20" Documentation/Skill/Design-Verification/Reference/verify-spread.mjs` → the vertical-gap check                                  |
| The showcase verifier passes five routes | `node Documentation/Skill/Design-Verification/Reference/verify-showcase.mjs` → 55 `PASS`, `RESULT: every showcase page is the composition`, exit 0 |
| The showcase routes are a literal        | `grep -n 'const Routes' Documentation/Skill/Design-Verification/Reference/verify-showcase.mjs` → five paths at `:35`                               |
| The audit launches its own browser       | `grep -n "remote-debugging-port=0" Documentation/Skill/Progressive-Enhancement/Reference/no-js-audit.mjs` → the launch argument                    |
| The audit's thesis is one-directional    | `grep -n "content waits for hydration" Documentation/Skill/Progressive-Enhancement/Reference/no-js-audit.mjs` → the parity rule at `:943`          |
| A missing node fails rather than blocks  | `grep -cF 'Page.rail?.' Documentation/Skill/Design-Verification/Reference/verify-showcase.mjs` → `3`                                               |
| Only the audit is wired                  | `grep -n '"Audit"' package.json` → `Audit` is a script; no gate runs a verifier                                                                    |
| The audit passes on the built tree       | `pnpm run Audit` → `9 routes: 9 pass, 0 fail, 0 skipped`, exit 0                                                                                   |

## Open questions

- Whether the spec should carry the invariant table in a machine-readable block so the verifier can
  read it. That would close rule 3's transcription hop and cost the spec its prose shape - the two
  goals are in tension and this record does not resolve it.
- Whether the three design verifiers should share one CDP client. They duplicate about ninety lines
  each and the duplication is already drifting.
- Whether a verifier's boundary belongs in its header comment or in the spec. Today it is in both,
  and neither is enforced.
- UNKNOWN whether the audit's parity rule should be two-directional. It fails content that appears
  only after hydration (`no-js-audit.mjs:942-944`); content absent in both passes passes parity and
  is caught only by the text and selector minimums.

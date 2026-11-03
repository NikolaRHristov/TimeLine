# RFC-0074 - A green gate is not a green tree

**Status:** Proposed **Date:** 2026-11-03 **Owner:** operator **Applies to:** `pnpm run check`, the
six scripts it chains, and CI **Kind:** method **Subject:** operation **Horizon:** now
**Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0009 (build, release and
toolchain), RFC-0044 (toolchain upgrade policy - the record that defers a major), RFC-0045 (the
component contract), RFC-0049 (the component state model), RFC-0050 (the data states), RFC-0055 (the
provider position); implementing card to be created: "Derive the gate's check inventory from the
checks themselves"

## Decision

`pnpm run check` is a chain of six contracts - the interpreter floor, the tool layer's types and
tests, the state contract, the token contract, the position contract, the site's unit tests - and it
is neither a build nor a rendered check. A green gate means every contract held. It does not mean
the tree is correct, and the boundary is stated rather than implied.

1. **The chain is ordered so the most fundamental failure speaks first.** `package.json:15` runs
   `Check:Compatibility`, then the tool layer's `check`, then `Check:State`, `Check:Tokens`,
   `Check:Position`, then `Test`. A wrong interpreter makes every later step report a syntax error
   that names neither the version nor the file, so the floor is asserted before anything that would
   be confused by it (`Compatibility.mjs:11-14`).
2. **The floor is recorded once and read from the record.** `Scripts/Compatibility.mjs:104-126`
   reads `engines.node` out of `package.json` and compares the running version against the lowest
   version that range admits. The number is not restated in the guard, so the recorded floor and the
   enforced floor cannot drift; a missing `engines.node` is a `FAIL` with the file to fix
   (`:116-123`).
3. **A report degrades; a contract does not.** The dependency half of the guard reports and never
   changes the exit code: `pnpm outdated` missing from `PATH` prints `SKIP` (`:201-206`), a registry
   that does not answer prints `SKIP` (`:208-211`), a major available prints `INFO` (`:288`). Taking
   a major is a decision with its own record (RFC-0044), and a guard that reddened on every upstream
   release would force that decision on release day instead of review day. The token and state
   contracts have no such path: a missing module or a missing sheet is a violation, not a skip
   (`TokenContract.mjs:621-637`, `:698-704`).
4. **One contract owns one vocabulary.** Colours and their tokens belong to `TokenContract.mjs`;
   component and data states to `StateContract.mjs` and to `TokenContract.mjs`'s state check; brand,
   product vocabulary and record citation to `Position.mjs`. A rule enforced in two places drifts in
   one of them, which is why `TokenContract.mjs` scans for a second stage map and a redefined
   Material mixin (`:544-610`) rather than trusting the author to have only one.
5. **The gate does not build.** No step of `pnpm run check` invokes `astro build`. The token
   contract reads sheet text with regular expressions, so a stylesheet that does not compile passes
   it as long as it contains no offending token. Compilation is `pnpm run build`'s claim, and the
   two claims are different.
6. **The gate does not type-check the site.** The tool layer's check is
   `tsc --noEmit -p tsconfig.json` with `Maintain/tsconfig.json:18` reading `"include": ["Source"]`
   relative to `Maintain/` - the tool layer only. No `astro check` runs anywhere in this repository.
   The site's own `tsc` cannot stand in for it: `.astro` files are not TypeScript and the JSX
   namespace is wired by the editor, not by the project.
7. **The gate does not look at the rendered page.** Nothing in the chain reads `Target/`, HTML or
   computed CSS. The checks that do - the no-JS audit, the design verifiers, the session and store
   audits - are separate scripts (`package.json:21-23`) and are run by hand.
8. **A green gate is a claim about contracts, not about the tree.** The four things a reader is
   entitled to conclude from exit 0 are: the interpreter is supported, the tool layer type-checks
   and its tests pass, the token and state vocabularies are internally consistent, and the copy
   obeys the brand and vocabulary rules. Nothing about the composition, the rendered page, the
   shadow store, the SpacetimeDB module, or whether a route exists.
9. **A red gate is not a red tree either.** The gate fails at step one on an interpreter below the
   floor, and steps two to six never execute. The tree can be entirely healthy behind a red gate,
   and the message names the interpreter and the command that fixes it rather than implying a defect
   (`Compatibility.mjs:154-172`).
10. **The gate's inventory of checks is the checks themselves, not a summary beside them.**
    `TokenContract.mjs:86-95` is the list, and `:882` prints `CHECK_TITLES.length` as the count. A
    prose summary in the same directory describes five of the eight, which is what happens when a
    count is written down twice.

## Context

The gate is green when it is given a supported interpreter:

```
PATH=<a supported node>/bin:$PATH pnpm run check
RESULT compatible
token contract: clean - 27 sheet(s), 69 token(s), 592 read(s), 8 checks
RESULT positioned
exit 0
```

On the interpreter the agent harness ships, the same command fails at step one:

```
node Scripts/Compatibility.mjs
FAIL Node v22.23.0 is below the floor 22.23.4, recorded as ">=22.23.4".
```

Both runs are honest. The difference is the interpreter, and the guard is the only step in the chain
that can tell - `pnpm run Build` (esbuild) and the tool layer's type-check both exit 0 on the same
binary (`Compatibility.mjs:161-164`).

The token contract is the most substantial check in the gate and it lives in an archive directory:
`package.json:19` points at `Documentation/Skill/Tool-Archive/Reference/TokenContract.mjs`, not at
`Scripts/`. It reports eight checks (`TokenContract.mjs:86-95`):

| #   | Check                     | Enforces                                                                              |
| --- | ------------------------- | ------------------------------------------------------------------------------------- |
| 1   | `no stray colour literal` | every sheet except `Source/Stylesheet/Global.css` names a token, or mixes one         |
| 2   | `no orphan token`         | a declared token has at least one `var()` reader                                      |
| 3   | `no undefined token`      | a `var()` read resolves to a declaration, a source-side setter, or carries a fallback |
| 4   | `one stage map`           | stage accents live in `Source/Library/Stage.ts` and nowhere else                      |
| 5   | `one material`            | a mixin declared in `Material.scss` is not redefined elsewhere                        |
| 6   | `one state vocabulary`    | component and data states are the two closed sets, in the two sheets and two modules  |
| 7   | `one failure vocabulary`  | every site failure code appears in the CLI's failure vocabulary                       |
| 8   | `focus is never removed`  | a component sheet does not remove an outline without drawing one                      |

Two counts circulate for this contract, five and eight, and the runtime prints eight. The five are
the five the archive's own index describes (`Documentation/Skill/Tool-Archive/Reference/Index.md`,
the `TokenContract.mjs` row); checks six, seven and eight were added to the code and not to the
summary. `grep -n CHECK_TITLES` settles it.

`Documentation/Reference/Build.md:29` and `:144` describe `pnpm run check` as "the compatibility
guard, then the tool layer's type-check and tests", which is three steps of six. The manifest is the
authority; the prose is a description that fell behind it.

CI is narrower than the gate. `.github/workflows/Node.yml:98` runs `pnpm run Check:Compatibility`
and `:101` runs `pnpm run prepublishOnly`, which builds. The four contracts and the unit tests are
local-only, so a green workflow says nothing about them.

The state contract is the one check that asserts behaviour rather than text:
`Scripts/StateContract.mjs` imports the two state modules and asserts thirty-one properties over
them (`# pass 31`), including the precedence order, the requirement that `locked` carries a
non-blank reason, and that `Count` is a non-negative integer no greater than `Total`. A rule that
holds only in a comment fails there.

## Alternatives considered

| Option                                                  | Why not chosen                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Put `astro build` in the gate                           | a build is minutes and a gate is seconds; the epic-boundary build is the right place for it, and the two claims stay separate               |
| Put `astro check` in the gate                           | it is not installed, and `.astro` typing is a backlog item recorded as an open question in RFC-0044 rather than a settled rule              |
| Fail the gate on a dependency major                     | it would force the upgrade decision on the day of the release rather than on the day of the review (rule 3, RFC-0044)                       |
| Fail on a dependency the registry cannot be reached for | an unreachable registry is a network fact, not a defect in this tree; the guard says `SKIP` and names the reason                            |
| Run the design verifiers from the gate                  | they need a browser and a `Target/` build, so the gate would acquire both a browser dependency and a build dependency                       |
| One script that runs all checks                         | the chain in `package.json` is already the composition, and each step stays independently runnable, which is what makes a failure locatable |
| Trust the archive's index for the check count           | it says five and the code says eight; a count written in prose is a count that drifts                                                       |

## Consequences

- A contributor can run any one contract alone - `node Scripts/Position.mjs`,
  `node Documentation/Skill/Tool-Archive/Reference/TokenContract.mjs` - which is what makes a red
  gate locatable without reading the chain.
- The gate is fast enough to run before every commit, and it therefore gets run.
- Because the gate never builds, a green gate beside a red build is a normal state and not a
  contradiction: a sheet can satisfy every token rule and fail to compile.
- Because the gate never renders, a page can pass every contract and still not be the composition -
  that is RFC-0072's problem, and the two records exist so neither has to cover for the other.
- The floor check means a contributor on an old interpreter gets one clear message instead of six
  confusing ones, at the cost of the gate being red for a reason that is not about their change.
- A check count written in a summary beside the code will drift; the only durable count is the one
  the code prints about itself.

## Verification

| Claim                                | Test                                                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| The gate passes on a supported node  | `PATH=<a supported node>/bin:$PATH pnpm run check` → `RESULT compatible`, `8 checks`, `RESULT positioned`, exit 0                  |
| It fails on an old node              | `node Scripts/Compatibility.mjs` → `FAIL Node v22.23.0 is below the floor 22.23.4`, exit 1                                         |
| The chain is six steps               | `node -e 'console.log(require("./package.json").scripts.check.split("&&").length)'` → `6`                                          |
| The floor is read, not restated      | `grep -n "engines" Scripts/Compatibility.mjs` → the manifest read at `:114`                                                        |
| The token contract has eight checks  | `node Documentation/Skill/Tool-Archive/Reference/TokenContract.mjs` → `... 8 checks`                                               |
| The check list is the code           | `grep -n "CHECK_TITLES" Documentation/Skill/Tool-Archive/Reference/TokenContract.mjs` → the array at `:86` and the count at `:882` |
| The index says five                  | `grep -n "TokenContract" Documentation/Skill/Tool-Archive/Reference/Index.md` → one row naming five checks                         |
| The state contract asserts behaviour | `node Scripts/StateContract.mjs` → `# pass 31`, `# fail 0`                                                                         |
| The position contract passes         | `node Scripts/Position.mjs` → `RESULT positioned`                                                                                  |
| The gate never builds                | `grep -c "astro build" package.json` → `1`, and it is the `build` script, not part of `check`                                      |
| The gate never type-checks the site  | `grep -n "include" Maintain/tsconfig.json` → `"include": ["Source"]`, relative to `Maintain/`                                      |
| No `astro check` runs                | `grep -rn "astro check" .github package.json` → no match in a workflow or a script                                                 |
| CI runs one step of six              | `grep -n "pnpm run" .github/workflows/Node.yml` → `Check:Compatibility` at `:98`, `prepublishOnly` at `:101`                       |
| A major is reported, not failed      | `grep -n "RFC-0044" Scripts/Compatibility.mjs` → the `INFO` branch at `:288`                                                       |

## Open questions

- Whether `astro check` belongs in the gate. RFC-0044 records it as an open question and this record
  does not settle it; the cost is a type-check the project has never run.
- Whether CI should run the four contracts. It runs the guard and a build, so the vocabulary rules
  are enforced only on the machine that happens to run the gate.
- Whether the gate should report its own boundary when it exits 0, so a reader is not left to infer
  that a green gate means a green tree.
- UNKNOWN whether the token contract's regex reading is adequate for a Sass feature the code has not
  used yet. It has no parser, so a construct it does not anticipate is either a false violation or a
  silent pass, and which one depends on the construct.

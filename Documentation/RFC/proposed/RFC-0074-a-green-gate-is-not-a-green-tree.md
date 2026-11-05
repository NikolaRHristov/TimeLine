---
title: A green gate is not a green tree
rfc: 0074
category: Method/Operation
kind: rfc
date: 2026-11-03
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: "the gate chain, its contracts, and CI"
supersedes: none
superseded_by: none
depends:
    - RFC-0009 (build, release and toolchain)
    - RFC-0044 (toolchain upgrade policy - the record that defers a major)
    - RFC-0045 (the component contract)
    - RFC-0049 (the component state model)
    - RFC-0050 (the data states)
    - |-
        RFC-0055 (the provider position); implementing card to be created: "Derive the gate's check inventory from the checks themselves"
statuses:
    - name: The chain is ordered so the most fundamental failure speaks first
      state: open
      evidence: the rule names no file or command
    - name: The floor is recorded once and read from the record
      state: open
      evidence: the rule names no file or command
    - name: "A report degrades; a contract does not"
      state: open
      evidence: the rule names no file or command
    - name: One contract owns one vocabulary
      state: open
      evidence: the rule names no file or command
    - name: The gate does not build
      state: open
      evidence: the rule names no file or command
    - name: The gate does not type-check the site
      state: current
      evidence: Maintain/tsconfig.json
    - name: The gate does not look at the rendered page
      state: current
      evidence: "package.json:15-17"
    - name: A green gate is a claim about contracts, not about the tree
      state: open
      evidence: the rule names no file or command
    - name: A red gate is not a red tree either
      state: open
      evidence: the rule names no file or command
    - name: The gate's inventory of checks is the checks themselves, not a summary beside...
      state: open
      evidence: the rule names no file or command
---

## Decision

The gate was a chain of ten stages - the RFC frontmatter contract, the skill contract, the RFC
board's own tests, the interpreter floor, the tool layer's types and tests, the state contract, the
token contract, the position contract, the SpacetimeDB module contract, the site's unit tests - and
it was neither a build nor a rendered check. A green gate meant every contract held. It did not mean
the tree was correct, and the boundary was stated rather than implied. The chain and the scripts it
ran have been removed; the decision stands, because the boundary it drew is the boundary of anything
that replaces it.

1. **The chain is ordered so the most fundamental failure speaks first.** The chain ran the RFC
   frontmatter contract, the skill contract, the RFC board's tests and the interpreter floor first,
   then the tool layer's types and tests, then the state, token, position and SpacetimeDB contracts,
   and the site's unit tests last. A wrong interpreter makes every later step report a syntax error
   that names neither the version nor the file, so the floor was asserted before anything that would
   be confused by it.
2. **The floor is recorded once and read from the record.** The guard read `engines.node` out of
   `package.json` and compared the running version against the lowest version that range admits. The
   number was not restated in the guard, so the recorded floor and the enforced floor could not
   drift; a missing `engines.node` was a `FAIL` with the file to fix.
3. **A report degrades; a contract does not.** The dependency half of the guard reported and never
   changed the exit code: `pnpm outdated` missing from `PATH` printed `SKIP`, a registry that did
   not answer printed `SKIP`, a major available printed `INFO`. Taking a major is a decision with
   its own record (RFC-0044), and a guard that reddened on every upstream release would force that
   decision on release day instead of review day. The token and state contracts had no such path: a
   missing module or a missing sheet was a violation, not a skip.
4. **One contract owns one vocabulary.** Colours and their tokens belonged to the token contract;
   component and data states to the state contract and to the token contract's state check; brand,
   product vocabulary and record citation to the position contract. A rule enforced in two places
   drifts in one of them, which is why the token contract scanned for a second stage map and a
   redefined `Material` mixin rather than trusting the author to have only one.
5. **The gate does not build.** No step of the chain invoked `astro build`. The token contract read
   sheet text with regular expressions, so a stylesheet that did not compile passed it as long as it
   contained no offending token. Compilation is `pnpm run build`'s claim, and the two claims are
   different.
6. **The gate does not type-check the site.** The tool layer's check was
   `tsc --noEmit -p Maintain/tsconfig.json` with `Maintain/tsconfig.json:18` reading
   `"include": ["Source"]` relative to `Maintain/` - the tool layer only. No `astro check` runs
   anywhere in this repository. The site's own `tsc` cannot stand in for it: `.astro` files are not
   TypeScript and the JSX namespace is wired by the editor, not by the project.
7. **The gate does not look at the rendered page.** Nothing in the chain read `Target/`, HTML or
   computed CSS. The checks that do - the no-JS audit, the design verifiers, the session and store
   audits - are separate scripts (`package.json:15-17`) and are run by hand.
8. **A green gate is a claim about contracts, not about the tree.** The four things a reader was
   entitled to conclude from exit 0 are: the interpreter is supported, the tool layer type-checks
   and its tests pass, the token and state vocabularies are internally consistent, and the copy
   obeys the brand and vocabulary rules. Nothing about the composition, the rendered page, the
   shadow store, the SpacetimeDB module, or whether a route exists.
9. **A red gate is not a red tree either.** The gate failed at step one on an interpreter below the
   floor, and steps two to ten never executed. The tree could be entirely healthy behind a red gate,
   and the message named the interpreter and the command that fixes it rather than implying a
   defect.
10. **The gate's inventory of checks is the checks themselves, not a summary beside them.** The
    token contract's `CHECK_TITLES` array was the list, and the contract printed its length as the
    count. A prose summary in the same directory described five of the eight, which is what happens
    when a count is written down twice.

## Context

The gate was green when it was given a supported interpreter, and a run printed:

```
RESULT compatible
token contract: clean - 27 sheet(s), 69 token(s), 592 read(s), 8 checks
RESULT positioned
exit 0
```

On the interpreter the agent harness shipped, the same chain failed at step one:

```
FAIL Node v22.23.0 is below the floor 22.23.4, recorded as ">=22.23.4".
```

Both runs were honest. The difference was the interpreter, and the guard was the only step in the
chain that could tell - `pnpm run Build` (esbuild) and the tool layer's type-check both exited 0 on
the same binary.

The token contract was the most substantial check in the gate, and it lived in an archive directory
rather than beside the other scripts. It reported eight checks:

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

Two counts circulated for this contract, five and eight, and the contract printed eight. The five
were the five the archive's own index described; checks six, seven and eight were added to the code
and not to the summary. The array in the code settled it, which is the rule the tenth point above
states.

CI was narrower than the gate. `.github/workflows/Node.yml` runs `pnpm run prepublishOnly`, which
builds, and nothing else. The contracts and the unit tests were local-only, so a green workflow said
nothing about them.

The state contract was the one check that asserted behaviour rather than text: it imported the two
state modules and asserted thirty-one properties over them (`# pass 31`), including the precedence
order, the requirement that `locked` carries a non-blank reason, and that `Count` is a non-negative
integer no greater than `Total`. A rule that holds only in a comment failed there.

## Alternatives considered

| Option                                                  | Why not chosen                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Put `astro build` in the gate                           | a build is minutes and a gate is seconds; the epic-boundary build is the right place for it, and the two claims stay separate    |
| Put `astro check` in the gate                           | it is not installed, and `.astro` typing is a backlog item recorded as an open question in RFC-0044 rather than a settled rule   |
| Fail the gate on a dependency major                     | it would force the upgrade decision on the day of the release rather than on the day of the review (rule 3, RFC-0044)            |
| Fail on a dependency the registry cannot be reached for | an unreachable registry is a network fact, not a defect in this tree; the guard said `SKIP` and named the reason                 |
| Run the design verifiers from the gate                  | they need a browser and a `Target/` build, so the gate would acquire both a browser dependency and a build dependency            |
| One script that runs all checks                         | the chain in `package.json` was already the composition, and each step stayed independently runnable, so a failure was locatable |
| Trust the archive's index for the check count           | it said five and the code said eight; a count written in prose is a count that drifts                                            |

## Consequences

- A contributor could run any one contract alone, which is what made a red gate locatable without
  reading the chain.
- The gate was fast enough to run before every commit, and it therefore got run.
- Because the gate never built, a green gate beside a red build was a normal state and not a
  contradiction: a sheet can satisfy every token rule and fail to compile.
- Because the gate never rendered, a page could pass every contract and still not be the
  composition. That is RFC-0072's problem, and the two records exist so neither has to cover for the
  other.
- The floor check meant a contributor on an old interpreter got one clear message instead of ten
  confusing ones, at the cost of the gate being red for a reason that was not about their change.
- A check count written in a summary beside the code will drift; the only durable count is the one
  the code prints about itself.

## Verification

| Claim                                 | Test                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| The gate passed on a supported node   | a recorded run on a supported interpreter: `RESULT compatible`, `8 checks`, `RESULT positioned`, exit 0            |
| It failed on an old node              | the same chain on Node v22.23.0 printed `FAIL Node v22.23.0 is below the floor 22.23.4`, exit 1                    |
| The chain was ten steps               | `package.json` carries no `check` script; the ten steps are the first point of the Decision                        |
| The floor was read, not restated      | `node -p "require('./package.json').engines.node"` → `>=22.23.4`, and no script compares it to the running version |
| The token contract had eight checks   | the eight rows in the table above, and the contract's `CHECK_TITLES` array                                         |
| The check list was the code           | the array was `CHECK_TITLES` and the contract printed its length as the count                                      |
| The index said five                   | the archive index described five; the code carried eight                                                           |
| The state contract asserted behaviour | it imported the two state modules and printed `# pass 31`, `# fail 0`                                              |
| The position contract passed          | it printed `RESULT positioned`                                                                                     |
| The gate never built                  | `grep -c "astro build" package.json` → `1`, and it is the `build` script                                           |
| The gate never type-checked the site  | `grep -n "include" Maintain/tsconfig.json` → `"include": ["Source"]`, relative to `Maintain/`                      |
| No `astro check` runs                 | `grep -rn "astro check" .github package.json` → no match in a workflow or a script                                 |
| CI runs no contract                   | `grep -n "pnpm run" .github/workflows/Node.yml` → `prepublishOnly` only                                            |
| A major was reported, not failed      | `pnpm outdated --format json` → one entry, `tailwindcss` 3.4.19 against 4.3.3                                      |

## Open questions

- Whether `astro check` belongs in the build path. RFC-0044 records it as an open question and this
  record does not settle it; the cost is a type-check the project has never run.
- Whether CI should run any contract. It runs a build, so the vocabulary rules are enforced only on
  the machine that happens to run them by hand.
- Whether whatever replaces the gate should report its own boundary when it exits 0, so a reader is
  not left to infer that a green gate means a green tree.
- UNKNOWN whether the token contract's regex reading was adequate for a Sass feature the code has
  not used yet. It had no parser, so a construct it did not anticipate was either a false violation
  or a silent pass, and which one depended on the construct.

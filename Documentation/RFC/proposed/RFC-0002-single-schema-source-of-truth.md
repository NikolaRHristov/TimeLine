---
title: Single schema source of truth
rfc: 0002
category: Architecture/Data
kind: rfc
date: 2026-11-02
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: "`Maintain/Source/Model/`, `Source/content.config.ts`, the SpacetimeDB module"
supersedes: none
superseded_by: none
depends:
    - t_fe20eeee (implements)
statuses:
    - name: "The TypeScript model under `Maintain/Source/Model/` is the single declaration..."
      state: open
      evidence: the rule names no file or command
    - name: Until derivation exists, a conformance test asserts the three declarations...
      state: open
      evidence: the rule names no file or command
---

## Decision

The TypeScript model under `Maintain/Source/Model/` is the single declaration of shape. The site's
Zod schema and the module's table definitions are **derived** from it, not maintained beside it.
Reducers and pages stay hand-written: they encode behaviour, not shape.

Until derivation exists, a conformance test asserts the three declarations agree, so drift fails a
check instead of surfacing as a count mismatch later.

## Context

One entity is declared three times today, independently:

| Declaration      | Path                                          | Derived from |
| ---------------- | --------------------------------------------- | ------------ |
| TypeScript model | `Maintain/Source/Model/**`                    | nothing      |
| Site schema      | `Source/content.config.ts`                    | nothing      |
| Module schema    | `Maintain/Spacetime/spacetimedb/src/index.ts` | nothing      |

Nothing derives anything. The observable symptom is the projection gap in RFC-0001: a field can
exist in one declaration and be absent in another without any tool complaining.

## Alternatives considered

| Option                                     | Why not chosen                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| Keep three copies, review carefully        | review does not run on every commit; drift is the observed failure             |
| Derive everything from the database schema | ties the repository to a running service and inverts the authority in RFC-0001 |
| Derive from a JSON Schema document         | a fourth language to keep in sync with the TypeScript that consumes it         |

## Consequences

- A model change is one edit plus a regeneration step, not three edits.
- Generated files carry a header and a `--check` mode, so a stale generation fails the build rather
  than shipping silently.
- The model becomes the place where field names are decided, which raises the cost of a careless
  rename - correctly.

## Verification

| Claim                      | Test                                                      |
| -------------------------- | --------------------------------------------------------- |
| Declarations agree         | conformance test compares field-name sets per entity      |
| Drift fails                | delete a field from one declaration, the test names it    |
| Generation is current      | `--check` mode exits non-zero when output differs         |
| Reducers stay hand-written | the module's reducer bodies are not in the generated file |

## Open questions

- Whether the module's generated tables can express indexes and constraints, or whether those stay a
  hand-maintained fragment.
- Whether the site schema needs a runtime parse or only a build-time check.

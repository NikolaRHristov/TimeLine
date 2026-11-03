---
title: Storage and projection model
rfc: 0001
category: Architecture/Data
kind: rfc
date: 2026-11-02
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: "`Maintain/Storage/`, the SpacetimeDB module, `Source/Content/`"
supersedes: none
superseded_by: none
depends:
    - t_fe20eeee (implements)
    - t_e1a18798 (push bridge, done)
statuses:
    - name: "Authority - the shadow store at `Maintain/Storage/Shadow/`"
      state: current
      evidence: Index.json
    - name: Projection - the SpacetimeDB module
      state: open
      evidence: the rule names no file or command
    - name: "Publication - `Source/Content/`"
      state: open
      evidence: the rule names no file or command
---

## Decision

Three layers, one direction of flow, one authority.

1. **Authority - the shadow store** at `Maintain/Storage/Shadow/`: one JSON file per status id, an
   append-only `Observation.jsonl`, an `Event/` directory and an `Index.json`. Gitignored. It is the
   only place complete history lives.
2. **Projection - the SpacetimeDB module**: a queryable, live view built from the shadow store,
   rebuildable at any time, never the only copy.
3. **Publication - `Source/Content/`**: the subset explicitly published, read by the static site at
   build time and by nothing else.

The site build reads only layer 3. No build step, and no CI job, may read layer 2.

## Context

The layers exist already and have already diverged: the shadow store holds 209 posts and 344
observations, while the database holds 207 posts and 212 observations, with no error raised
anywhere. `store push --dry-run` reports 209 would be pushed, so the gap is staleness rather than a
filtering rule.

Measured with:

```sh
ls Maintain/Storage/Shadow/Post/*.json | wc -l
spacetime sql timeline -s http://127.0.0.1:3010 "select count(*) as n from post" --format json
node Maintain/Target/Index.js store push --dry-run --json
```

## Alternatives considered

| Option                                    | Why not chosen                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| Database as sole authority, files deleted | a local server is a running service; without an export a lost instance loses the archive |
| Files as sole authority, no projection    | loses live queries, subscriptions and in-database validation                             |
| Site reads the database at build time     | breaks the static guarantee and the deploy-on-push model                                 |

## Consequences

- A push that lags is invisible unless someone counts both layers, so `store status` must report the
  difference rather than a single total.
- Retirement of the shadow store is possible only after an export path exists and has been exercised
  at least once.
- The projection can be destroyed and rebuilt without data loss, which makes schema iteration cheap.

## Verification

| Claim                     | Test                                                       |
| ------------------------- | ---------------------------------------------------------- |
| Authority is complete     | post count in the store ≥ post count in the database       |
| Projection is rebuildable | delete the database, `store push`, counts match            |
| Site is independent       | `astro build` passes with the database stopped             |
| Export is lossless        | `store export`, wipe the store, `store push`, counts match |

## Open questions

- Where the export lives and how often it runs (see RFC-0008 for media).
- Whether observations need a retention policy once scraping is scheduled.

---
title: Hosting and tenancy
rfc: 0016
category: Policy/Operation
kind: rfc
date: 2026-11-02
status: proposed
horizon: next
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: the host, module rollouts, per-room health, the shutdown path
supersedes: none
superseded_by: none
depends:
    - RFC-0005 (a room is a database)
    - RFC-0009 (build and release)
    - RFC-0015 (the exit format)
    - "RFC-0020 (what the host may observe); t_17031e18 (build)"
    - |-
        t_1621cc5c (substrate research); implementing card to be created: "Room rollout, per-room health and the cost model"
statuses:
    - name: Cost is a published model, not a promise
      state: open
      evidence: the rule names no file or command
    - name: Upgrades are staged and reversible per room
      state: open
      evidence: the rule names no file or command
    - name: A bad publish cannot be silent
      state: open
      evidence: the rule names no file or command
    - name: What the host observes is enumerated
      state: open
      evidence: the rule names no file or command
    - name: The provider stopping is a planned event
      state: open
      evidence: the rule names no file or command
---

## Decision

PlayForm hosts rooms as a provider, and the tenancy unit is the room database (RFC-0005). Five
commitments follow, and each one is testable.

1. **Cost is a published model, not a promise.** A room's cost is measured as rows x row size, plus
   storage, plus monthly active identities, plus reducer invocations. The host publishes the unit
   prices. There is no free-tier claim without a number beside it.
2. **Upgrades are staged and reversible per room.** Every room records the module hash and version
   it runs. A publish goes to the host's own room, then to a named canary set, then to every room,
   with a compatibility window during which a room may still be served by the previous module. A bad
   publish is contained because it reaches one room at a time and stops on the first failed health
   check.
3. **A bad publish cannot be silent.** Every room exposes a health view: last successful reducer,
   row counts, module version, and the age of the newest observation. The rollout aborts on any room
   reporting a failure.
4. **What the host observes is enumerated.** Traffic volume, timing, connection identity, room
   membership, row counts, envelope sizes, module version. Never payload contents (RFC-0007). The
   enumeration is part of the contract, not a policy page that can change quietly.
5. **The provider stopping is a planned event.** On shutdown: a 90-day export window, the format of
   RFC-0015, the module source published under the repository's licence, and the static site
   continuing to serve published content from its own host. A room that exports inside the window
   loses nothing.

The host is not the moderator. Abuse response is limited to rate, volume and membership, because
content is unreadable. A room's authority, not the host, decides who is in it.

## Context

One database holds one archive today. `Maintain/Spacetime/spacetime.local.json` names a generated
database that never matches the published one, and the module has six tables and no version row, so
nothing in the tree records which module a database runs. The projection already lags its
authority - 207 posts and 212 observations in the database against 209 and 344 in the files
(RFC-0001) - which is the kind of drift a per-room health view would surface as a number instead of
a surprise.

The product shape is many small rooms. At even a hundred rooms, "publish and hope" is not a release
process: a module that fails to build, or builds and misbehaves, would be repeated a hundred times.
The cost question is the same shape - an unpriced room is a room the host cannot afford to keep.

## Alternatives considered

| Option                                 | Why not chosen                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| One shared database for every room     | cheapest to run, and the blast radius of one bad rule is every room (rejected in RFC-0005) |
| One database per person, rooms as rows | an invitation becomes a distributed transaction, and revocation touches two databases      |
| A managed third party as the only host | the exit guarantee would depend on a provider that has not agreed to it                    |
| Publish everywhere at once             | one bad module breaks every room, which is the failure this record exists to prevent       |
| Per-room cost by invoice               | a person cannot decide whether to start a room without knowing what it costs               |
| Host-side moderation                   | requires plaintext, which RFC-0007 forbids; the host can act on volume and membership only |

## Consequences

- Per-room module publishing makes every change a fleet operation, so a rollout command has to exist
  before the second room does.
- A compatibility window means two module versions are supported at once, so the schema must be
  forward-compatible inside a window, which constrains RFC-0002's freedom.
- Publishing unit prices binds the host to them, including the parts that turn out to cost more.
- A health view per room is a read surface the host must keep cheap; a health check that costs a
  query per room per minute is itself a cost line.
- The shutdown commitment is only credible if exports have been exercised before the day they are
  needed, which makes the round-trip check in RFC-0015 a standing obligation rather than a one-off.

## Verification

| Claim                                 | Test                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Every room reports its module version | `spacetime describe <room> --json \| jq -r .module.version` prints a version (intent - no version row exists yet)    |
| A canary publish touches one room     | `spacetime list \| wc -l` is unchanged and exactly one room's version differs after a canary publish (intent)        |
| Cost is measurable                    | `spacetime sql <room> "select count(*) as n from post"` gives the row term; row size comes from `spacetime describe` |
| The host sees no plaintext            | `spacetime sql <room> "select text from post limit 1"` returns ciphertext once RFC-0007 lands (intent)               |
| Export works with the host gone       | stop the local server, `maintain export --room <id> --out x` still writes (intent, shares RFC-0015's check)          |
| The shutdown path is written down     | `Documentation/Reference/Hosting.md` exists and names the 90-day window and the export format (intent)               |

## Open questions

- Whether the engine can roll a database back to a previous module version, or only forward. This
  decides whether "reversible" means rollback or restore-from-export. UNKNOWN; spike: publish v1,
  publish v2, republish v1, read the version row.
- Whether publishing many databases from one job is rate-limited. UNKNOWN; spike: publish 50 local
  databases in a loop and time it.
- Whether a room can move to another host without changing its identity, since the database identity
  is the address. UNKNOWN; spike: export from one local server, import to another, compare
  `rootHash`.
- Whether the 90-day window is the right number, and who enforces it if the provider disappears
  without notice. The commitment assumes a provider that intends to keep it.

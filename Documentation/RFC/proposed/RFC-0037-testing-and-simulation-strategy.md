---
title: Testing and simulation strategy
rfc: 0037
category: Method/Operation
kind: rfc
date: 2026-11-02
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: the pure layer, the module, the client, the federation
supersedes: none
superseded_by: none
depends:
    - RFC-0001 (the observation log is a recording)
    - RFC-0002 (one schema to test)
    - "RFC-0003 (`view` is a transport)"
    - |-
        RFC-0020 (the engine does not authorize for the module); implementing card to be created: "Fixture rooms and the replay harness"
statuses:
    - name: The pure layer needs no engine
      state: open
      evidence: the rule names no file or command
    - name: The module layer runs on an ephemeral local database
      state: open
      evidence: the rule names no file or command
    - name: The replay layer reproduces a projection from a recording
      state: open
      evidence: the rule names no file or command
    - name: "The client layer runs over the `view` transport"
      state: open
      evidence: the rule names no file or command
    - name: The federation layer needs two databases, and two databases are not two hosts
      state: open
      evidence: the rule names no file or command
    - name: The engine's authorization is never mocked
      state: open
      evidence: the rule names no file or command
    - name: A record's verification table is the test list
      state: open
      evidence: the rule names no file or command
---

## Decision

Four test layers with a fixed fixture each, and one class of behaviour that is not tested until a
second host exists - stated rather than approximated with a mock.

1. **The pure layer needs no engine.** Schema derivation (RFC-0002), envelope canonicalisation, hash
   ordering and the export `rootHash` (RFC-0015), the merge rules (RFC-0030) and the retention
   predicates (RFC-0028) are functions over data. A pure function that needs a database to test is a
   defect in its shape, and the fix is to split it, not to stand up a database.
2. **The module layer runs on an ephemeral local database.** `spacetime start` for the server,
   `spacetime publish --delete-data=always` per test for a clean database, `spacetime call` to act,
   `spacetime sql` to assert and `spacetime logs <db> -n 50` for the failure text. A fixture room is
   built by a seed reducer rather than by SQL inserts, so the fixture takes the same code path a
   person takes - and therefore tests the authorization it exercises.
3. **The replay layer reproduces a projection from a recording.**
   `Maintain/Storage/Shadow/Observation.jsonl` (RFC-0001) is the recording; replaying it into an
   empty projection must reproduce the same row count and the same set of `contentHash` values. This
   is the only way a projection bug is reproducible after the source post is gone, and it doubles as
   RFC-0028's retention test because the replay is where a pruned log shows its effect.
4. **The client layer runs over the `view` transport.** RFC-0003 already makes a read-only
   projection a transport, so every page and every read command has a test that needs no browser:
   `--transport view` against a fixture shadow store. A command that cannot answer from `view` is
   either mutating (correct, and must refuse) or wrongly coupled to CDP (a defect). The same seam
   gives a deterministic test for a page that would otherwise depend on a live tab.
5. **The federation layer needs two databases, and two databases are not two hosts.** Two databases
   on one local server test the asynchronous inter-database call (RFC-0005) and the egress allowlist
   (RFC-0022 §3). They do not test a network partition, a host that lies about what it holds, timing
   correlation between rooms (RFC-0022 §5), or the deletion receipt a migration depends on (RFC-0033
   §7). Those are UNKNOWN until a second host exists, and the test plan says so instead of
   substituting a stub.
6. **The engine's authorization is never mocked.** RFC-0020's second assumption is that the engine
   does not authorize for the module. A mock would encode that assumption as a fixture and then
   prove the fixture. Module authorization is tested by calling the reducer as a non-member and
   expecting the refusal, against a real engine, every time.
7. **A record's verification table is the test list.** Every row in every RFC's Verification table
   that is not marked intent names a command; the suite is the union of those commands. A row marked
   intent is a test that does not exist yet, and it is tracked as a gap rather than assumed to be
   covered. An RFC whose table has no runnable row is not ready, which is what the index already
   says.

## Context

The engine gives four primitives and no test framework. `spacetime dev` rebuilds and republishes on
change (`AGENTS.md:131`); `spacetime publish --delete-data=always` gives a clean database;
`spacetime sql` is a query interface; `spacetime subscribe --num-updates N` (`AGENTS.md:190`)
observes a live change stream. There is no documented replay, fixture loader or snapshot facility,
so the fixture and the recording are this repository's own artifacts - which is why RFC-0001's
append-only observation log matters twice: it is the archive and it is the test corpus.

The client layer has an unusual advantage. RFC-0003 made the transport a parameter and RFC-0026
added a third one, so the same command is exercisable against a browser, a static projection and a
carrier. Testing the `view` path is therefore not a mock of CDP - it is the real code over a
different transport, which is the only kind of double this record accepts.

## Alternatives considered

| Option                                 | Why not chosen                                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Mock the module for client tests       | a mock encodes the module's rules a second time; the `view` transport is the real client code over real data               |
| Snapshot the database between tests    | no snapshot facility is documented; `--delete-data=always` plus a seed reducer is the available and reproducible form      |
| Build fixtures with SQL inserts        | bypasses the reducer path, so authorization and validation are untested by every fixture that uses it                      |
| One integration test per feature       | an integration test that spans browser, module and host fails for three reasons at once and names none of them             |
| A second local host to test federation | two servers on one machine share a clock and a kernel, so they test the call path and not the failure modes rule 5 lists   |
| Treat intent rows as covered           | an intent row is a claim about a test nobody wrote; counting it as coverage is how a verification table becomes decoration |

## Consequences

- The observation log becomes load-bearing for testing, so a store that prunes aggressively
  (RFC-0028) loses its own regression corpus. The retention default has to be read with that in
  mind.
- Fixtures are code, so a fixture that stops compiling is a broken test rather than a stale file -
  which is the right failure, and it costs a module rebuild per fixture change.
- The intent rows accumulate as a visible backlog. That is the point: an RFC's table is a to-do list
  with a number beside each item, not a certificate.
- Federation stays the least-tested layer, and every document that depends on it (RFC-0012's push,
  RFC-0033's migration) inherits an explicit caveat rather than an implied guarantee.
- Two databases on one server are cheap enough to run per test, so the federation call path is
  covered even though its failure modes are not.

## Verification

| Claim                                      | Test                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A projection rebuilds from the log         | replay a fixture `Observation.jsonl` into an empty projection; row count and the set of `content_hash` values match the source (intent)     |
| A fixture is built by a reducer            | the seed reducer's call appears in `spacetime logs <db>` and the fixture rows carry `ctx.sender`-derived authorship (`AGENTS.md` identity)  |
| A non-member is refused                    | call a mutating reducer from an identity with no membership row; the refusal is `action-refused` and no row is written (RFC-0024 §7)        |
| A read command answers from `view`         | run each read command with `--transport view` against a fixture store; none requires CDP (RFC-0003)                                         |
| A mutating command refuses `view`          | run a mutating command with `--transport view`; it fails before any side effect with `view-read-only` (RFC-0003)                            |
| The suite is the union of tables           | `grep -c "^                                                                                                                                 | " Documentation/RFC/proposed/*.md` against the test files' names; every non-intent row has a test (intent) |
| Two databases exercise the federation call | publish two fixture rooms on one local server and propagate between them; the receiving room records the copy and the ack (RFC-0012 rule 3) |

## Open questions

- Whether the engine can snapshot and restore a database, which would replace the seed-reducer
  fixture with a captured one and make a large fixture cheap. No snapshot verb appears in the CLI
  reference read. UNKNOWN. Spike: publish a fixture, look for a dump or snapshot verb, then try to
  restore it under a new identity.
- Whether a replay can be made deterministic across module versions. A projection built by version N
  and replayed by version N+1 may legitimately differ (RFC-0034's additive changes), so the replay
  test needs a version pin and this record does not yet say where it lives.
- What a second host costs to run for one test. A container or a second local server process would
  close rule 5's gap; whether the engine tolerates two servers on one machine with distinct data
  directories is UNKNOWN, and it decides whether the federation failure modes are testable at all
  before a real second host exists.

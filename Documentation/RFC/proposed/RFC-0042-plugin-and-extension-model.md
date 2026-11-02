# RFC-0042 - Plugin and extension model

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** module composition,
the review record, revocation by republish **Decision class:** architecture **Supersedes:** none
**Superseded by:** none **Task dependencies:** RFC-0025 §3 (a module is composed from reviewed
libraries), RFC-0022 (egress is declared and the database is the isolation unit), RFC-0024 §1 (one
action entry point), RFC-0016 §2 (staged rollout); implementing card to be created: "Composition
manifest and the library review record"

## Decision

A room does not load code at runtime. Extension happens at composition time, and what a room runs is
fixed by the artifact hash it published.

1. **The unit of extension is the composed module, not a plugin.** RFC-0025 §3 already decides that
   a room's module is composed from reviewed libraries; this record decides that composition is the
   only extension point. There is no reducer that loads a module, no table of installed plugins, and
   no eval.
2. **Why there is no runtime plugin, stated once.** A plugin would run inside the room's module,
   with that module's authority over the room's tables and its declared egress (RFC-0022 §2). The
   engine's isolation unit is the database - one module per database (RFC-0022 §1) - so a second
   code unit inside it has no boundary of its own. A plugin model would therefore have to invent the
   isolation the engine does not provide, for code the host cannot review and the room cannot read.
3. **A library is admitted by a review that pins its hash.** Admission is a record
   `{library, version, hash, reviewer, scope, at}`. A room's artifact lists the library hashes it
   contains, so a room can say which reviewed code it runs, and a member can check that list against
   the review records. A library without a record is not composable.
4. **What a composed library can reach is enumerated, and the list is short.** The room's tables and
   reducers; `ctx.timestamp` and `ctx.random` (`AGENTS.md:526`, `AGENTS.md:529`); and
   `ctx.http.fetch` only inside a procedure the artifact declares (RFC-0022 §2). It cannot read a
   key (RFC-0013: keys are client-side), cannot read plaintext (RFC-0007), and cannot reach another
   room except through the federation allowlist (RFC-0022 §3).
5. **Revocation is a republish, not an uninstall.** A revoked library leaves the composition set,
   the artifact is rebuilt without it, and the room's authority republishes under RFC-0016 §2's
   staged rollout. Rows the library wrote stay - they are the room's rows - and the new artifact
   must either keep reading them or record a migration decision (RFC-0033). There is no un-migrate.
6. **A room may refuse an extension and stay interoperable.** Composition is per room, so a room
   running no optional library still speaks the same protocol (RFC-0034) and exchanges the same
   export (RFC-0015). An extension changes behaviour inside a room and never the wire, which is what
   keeps a minimal room and a maximal room in the same federation.
7. **A third-party reducer in the ordinary sense does not exist.** RFC-0024 §1 collapsed the action
   surface into `submit`; an extension that added a reducer would be adding an authority path beside
   the gateway, which that record forbids. An extension adds tables and behaviour behind `submit`,
   or it is not an extension.

## Context

The registry is real and its vocabulary is composition, not plugins. The index's research table
records `spacetimedb.com/modules` as a marketplace of composable module libraries - Crypto, History,
Rate Limit, Relations, Resend, Webhooks - where a module author composes libraries into their own
module before publishing. RFC-0025 §3 already reads that as code to build with rather than code to
load. What it does not decide is what admission costs, what a library can reach, and how one is
removed.

The engine's model answers the reach question by elimination. A module is one WebAssembly unit per
database; procedures are the only side-effecting path and they are declared (`AGENTS.md` procedures
section); reducers are deterministic and touch nothing outside the database (`AGENTS.md` critical
rule 2). There is no dynamic linking, no second module in a database, and no host function that
would let code arrive after publication. A runtime plugin would have to be simulated with a table of
bytecode, which is a virtual machine inside a module the host already cannot read - the worst of
both.

RFC-0025's own open question is the blocker this record inherits: the registry lists an author and a
description and no page read states a review, a signature or a version-pinning mechanism. So
admission is a human judgement recorded as a row, and this record says that plainly rather than
dressing it as a supply chain.

## Alternatives considered

| Option                                        | Why not chosen                                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| A runtime plugin table with bytecode          | a virtual machine inside the module, with the module's authority and no boundary of its own; the host cannot review it        |
| A second module per room for extensions       | the engine's isolation unit is the database, so a second module would be a second room with a second membership               |
| Dynamic linking against registry libraries    | not a capability the engine offers; composition happens before publish, which is what the registry's own vocabulary describes |
| Let a room's authority load unreviewed code   | the code would run with the room's authority over every member's rows, so one signature would reach everyone's content        |
| Revocation by deleting the library's rows     | the rows are the room's history; deleting them to remove code rewrites what happened (RFC-0031 §7's rule, applied to code)    |
| Trust the registry's author field as a review | an author string is a claim; RFC-0025's open question records that no review mechanism is documented                          |

## Consequences

- A room's capability set is frozen at publish, so adding a feature is a republish and a rollout
  rather than an install. That is slower for the operator and safer for every member.
- The review record becomes an institution: a library's admission is one person's judgement with a
  name and a date on it, and a bad admission is traceable to a reviewer rather than to a supply
  chain nobody owned.
- Composition means a room's schema is partly other people's tables (RFC-0002), so a library's
  version bump is a schema change for every room that composed it - a real cost that argues for
  composing less.
- Revocation leaves rows behind by design, so a revoked library's tables become legacy tables a
  future artifact must keep reading. The set has no vocabulary for a deprecated table, and this
  record does not invent one.
- A minimal room and a maximal room interoperate, which is the property that keeps the federation
  from fragmenting along feature lines.

## Verification

| Claim                                      | Test                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| No runtime loader exists                   | `grep -ri "load\|plugin\|eval" Maintain/Spacetime/src` returns no module-loading path (intent)                                               |
| An artifact lists its libraries            | `spacetime describe <room> --json` returns the artifact hash, and the composition manifest for that hash lists library hashes (intent)       |
| Every composed library has a review row    | for each hash in the manifest, a review record exists; a hash without one fails the publish check (intent)                                   |
| Egress is declared and absent by default   | publish a composition with no procedure; `grep -c "ctx.http.fetch"` on the built module is zero and the host records no egress (RFC-0022 §2) |
| Revocation republishes rather than deletes | revoke a library in a fixture composition; the new artifact omits it and every row it wrote still reads (intent)                             |
| A minimal room interoperates               | propagate between a room with no optional library and one with several; the export and the copy verify (RFC-0012, RFC-0015)                  |

## Open questions

- Whether a library's hash can be verified against a review at all. RFC-0025's open question records
  that the registry documents no signature and no version pinning, so today admission is a human
  judgement with no machine check. UNKNOWN, and it is the one question that decides whether
  "reviewed code" is a claim this system can make.
- Whether a republish can drop a table without destroying its rows.
  `spacetime publish --delete-data=always` destroys everything and a selective drop is not
  documented in anything read; UNKNOWN, and it decides whether rule 5's "keep reading them" is
  possible or merely desirable.
- Whether a room should be able to compose a library from its own authority rather than from a
  shared set - a private extension. It would be a per-room code path with per-room review, and
  whether that is an extension model or a fork is undecided.

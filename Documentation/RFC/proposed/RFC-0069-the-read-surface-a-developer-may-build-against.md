---
title: The read surface a developer may build against
rfc: 0069
category: Contract/Network
kind: rfc
date: 2026-11-02
status: proposed
horizon: next
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: |-
    the module's views and routes, the export format, the CLI's JSON output, every third-party client
supersedes: none
superseded_by: none
depends:
    - "RFC-0005 §Open questions (the per-member view this record makes the read path)"
    - RFC-0007 (no surface reaches plaintext)
    - RFC-0015 and RFC-0034 (the export as the stable contract)
    - "RFC-0022 §2 (a room's declared egress)"
    - |-
        RFC-0039 §1 and RFC-0032 §6 (a third party's load lands on the room's bill and cap); implementing card to be created: "The documented read surface and the CLI JSON schemas"
statuses:
    - name: The room's read surface is its views, and a view is per-user
      state: open
      evidence: the rule names no file or command
    - name: A room may expose an inbound route, and that is the room's decision
      state: open
      evidence: the rule names no file or command
    - name: There is no operator API
      state: open
      evidence: the rule names no file or command
    - name: The export format is the stable contract
      state: open
      evidence: the rule names no file or command
    - name: "The CLI's `--json` output is a contract too, and a narrower one"
      state: open
      evidence: the rule names no file or command
    - name: What stays private by default
      state: open
      evidence: the rule names no file or command
    - name: Rate and cost belong to the room, not to the developer
      state: open
      evidence: the rule names no file or command
    - name: An SDK is a client, and it is the member's
      state: open
      evidence: the rule names no file or command
---

## Decision

A developer builds against three surfaces - a room's per-user views, the export format, and the
CLI's JSON output - and everything else stays private by default. There is no general-purpose room
API and no operator API.

1. **The room's read surface is its views, and a view is per-user.** RFC-0005's per-member view is
   the only read path (`AGENTS.md:617`), and a client subscribing to it receives what that member
   may read and nothing else. A developer's client is a client: it holds the member's key,
   subscribes as the member, and the module's visibility rule applies to it unchanged.
2. **A room may expose an inbound route, and that is the room's decision.** The engine supports
   `httpHandler` with `httpRouter` and `SyncResponse` (`AGENTS.md:717`), and a handler has no
   `ctx.db` - it must open its own transaction (`AGENTS.md:738`). A room that publishes a route
   publishes a public surface whose contract is the room's, not the system's, and a route can serve
   only what a reducer or a view could serve.
3. **There is no operator API.** The host's control plane is a CLI and a dashboard, not a documented
   endpoint: a developer cannot enumerate rooms, read a bill, or query a member's activity. RFC-0066
   already refuses a member-facing host view, and this record refuses the same surface to a
   developer.
4. **The export format is the stable contract.** RFC-0015's five files are what a third party may
   depend on, with RFC-0034's versioning. It is versioned, documented and independent of the engine,
   so a tool built on it survives a host change - the only stability this system can honestly offer.
5. **The CLI's `--json` output is a contract too, and a narrower one.** Every command that emits
   JSON emits a stable shape, and a breaking change to it is a major version. The tool layer is
   local and single-member, so this contract is about scripts on one machine rather than a service.
6. **What stays private by default.** No room's membership, no member's key, no epoch, no
   observation log and no plaintext is reachable by any surface. A developer asking for one of these
   is asking for a reader, and RFC-0007 is the answer.
7. **Rate and cost belong to the room, not to the developer.** A route or a view that a third party
   hammers costs the room its invocations (RFC-0039 §1) and counts against the room's cap (RFC-0032
   §6). The room's authority can rate a route; the system does not meter a developer.
8. **An SDK is a client, and it is the member's.** A published library wrapping the module's views
   is useful and must hold the member's key to be useful, so it ships as a client artifact the
   member runs, not as a service the developer operates. The line is: a developer may build a client
   and may not build a middleman.

## Context

The topic decides whether a network has an ecosystem, and the answer here is constrained by the
property that makes the product what it is: the module cannot read content and the member holds the
key. Any third-party surface that reads content is a client; any surface that does not is an
aggregator of envelopes, and an aggregator of envelopes can do almost nothing a client could not do
better.

The engine's own surface lets this record be specific. A module can expose per-user and anonymous
views (`AGENTS.md:617`, `AGENTS.md:627`), client visibility filters (`AGENTS.md:681`), and inbound
HTTP routes (`AGENTS.md:717`); a procedure is the only outbound path (`AGENTS.md:704`). So a room's
API is something the room's module declares and the platform has none of its own - which is the
decision, not a limitation to work around.

Nothing of the kind exists yet.
`grep -cE "spacetimedb.(anonymousView|view)\(" Maintain/Spacetime/spacetimedb/src/index.ts` prints 0
and `grep -cE "httpHandler|httpRouter"` prints 0, so the current module exposes four reducers and
six public tables and no read surface beyond a raw subscription. The tool layer is a CLI with an
`Output` module that formats JSON and no server: `ls Maintain/Source/` lists Browser, CLI, Command,
Configuration, Content, Index.ts, Ingest, Model, Output, Spacetime, Store, Test, Transport and Vote.
RFC-0018's `--json` shapes are the de facto contract today.

## Alternatives considered

| Option                                           | Why not chosen                                                                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A general room REST API served by the host       | the host cannot read content (RFC-0007), so it could serve only envelopes, and a client that must decrypt anyway gains nothing                     |
| A GraphQL schema over the room                   | one more contract to version over the same envelope rows, with the same inability to read                                                          |
| An operator API for rooms, bills and stats       | the surfaces RFC-0041 and RFC-0066 both refuse, collected in one place                                                                             |
| Expose an anonymous view as the public API       | an anonymous view is the same for every client (`AGENTS.md:627`) and therefore cannot be per-audience; a room wanting one has chosen a public room |
| A service-side SDK that holds keys for its users | a middleman that can read every member's content, which is the provider the product exists not to be                                               |
| No contract at all, engine only                  | the export is already a contract, and pretending otherwise makes a stable format look unstable                                                     |
| Let a route bypass the reducer path              | a route that writes directly is an authority path beside RFC-0024's gateway, which that record forbids                                             |

## Consequences

- An ecosystem grows around the export and the client rather than around a server API: slower to
  start, impossible to lock in.
- A room's own routes are unversioned by the system, so a third party depending on one depends on
  that room's authority - the same trust it already places in the room's module (RFC-0042).
- The CLI's JSON shapes become a compatibility surface a refactor can break, so RFC-0018's run and
  span schema and every command's output need the review a format change gets.
- A developer's client must implement decryption, which is the barrier that keeps the ecosystem
  small and honest.
- A third party's load lands on a room's bill, so a popular client is a cost its users' rooms pay -
  a consequence the room's cap bounds and nobody likes.

## Verification

| Claim                       | Test                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Reads are per-member        | a client subscribing as identity A receives no row A's grants do not cover (RFC-0005, RFC-0014, intent)                |
| A route cannot read content | a fixture route's handler has no `ctx.db` (`AGENTS.md:738`) and the room's payload table is private (RFC-0022, intent) |
| No operator API exists      | `ls Maintain/Source/` lists no server module, and the host's control plane is the CLI (true today)                     |
| The export is versioned     | `jq -r .format Manifest.json` prints a version and RFC-0034 names the compatibility rule (RFC-0015)                    |
| JSON output is stable       | each command's `--json` output validates against a committed schema, and a change fails the check (intent)             |
| No key is reachable         | `grep -rl "privateKey" Maintain/Storage/ Source/Content/` prints nothing (RFC-0013's existing row)                     |
| A route costs the room      | call a fixture route a hundred times; the room's invocation meter increases (RFC-0039, intent)                         |

## Open questions

- Whether a room's route should be able to authenticate a non-member at all. RFC-0014's open
  question about calling a reducer with no membership row is the same question, and a route that
  answers without a membership is a public API by another name.
- Whether the export format should publish a JSON Schema beside it. It would make the contract
  machine-checkable and it is one more artifact to keep in step with RFC-0034.
- Whether the CLI's JSON contract should be versioned separately from the package. A local tool's
  output is consumed by scripts on one machine, and semver on the package may be enough.
- UNKNOWN whether a per-user view can be subscribed by a client presenting no identity, which
  decides whether a public client is possible at all. Spike: subscribe to a per-user view
  anonymously and count the rows.

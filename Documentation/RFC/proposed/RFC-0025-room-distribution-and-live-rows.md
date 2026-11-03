---
title: "Room distribution: the module as artifact, the room as a stream"
rfc: 0025
category: Architecture/Network
kind: rfc
date: 2026-11-02
status: proposed
horizon: next
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: module publishing, the room's version record, client-side WebAssembly, live rows
supersedes: none
superseded_by: none
depends:
    - RFC-0005 (a room is a database)
    - RFC-0016 (a room records the module it runs)
    - RFC-0013 (keys never travel in the artifact)
    - RFC-0022 (the artifact declares its egress)
    - |-
        RFC-0017 (the client surface a live room feeds); implementing card to be created: "Module artifact manifest and the live-row view"
statuses:
    - name: The module is an artifact
      state: open
      evidence: the rule names no file or command
    - name: A room is not a file
      state: open
      evidence: the rule names no file or command
    - name: Distribution is a registry, not a handout
      state: open
      evidence: the rule names no file or command
    - name: Client-side WebAssembly is a different pattern and stays where it belongs
      state: open
      evidence: the rule names no file or command
    - name: A live room is an event table plus a per-member view
      state: open
      evidence: the rule names no file or command
    - name: What a room never ships
      state: open
      evidence: the rule names no file or command
---

## Decision

Three things are separable and this record separates them: the module is a versioned artifact, the
database is the room's state, and a live room is rows delivered by a subscription - not a binary a
person downloads and not a media stream.

1. **The module is an artifact.** A room is opened by publishing a module to a host. The engine's
   lifecycle is write, compile, publish, hot-swap, where a republish replaces the module without
   disconnecting clients (`Maintain/Spacetime/AGENTS.md:99`). The artifact is content-addressed and
   signed, and the room records the hash and version it runs (RFC-0016 §2). The artifact declares
   its egress (RFC-0022 §2) and its schema version (RFC-0011), so a host can refuse a build before
   deploying it.
2. **A room is not a file.** "Download a WASM module to a host to open a room" is two operations -
   publish the artifact, create the database - and only the first is a file transfer. A module
   without a database has no authority, no membership and no state (RFC-0005), so a person who
   downloads a module has downloaded code, not a room. Opening a room is an action a host performs
   on a content-addressed artifact, which is what makes the rollout in RFC-0016 a fleet operation
   rather than a distribution problem.
3. **Distribution is a registry, not a handout.** `spacetimedb.com/modules` is a marketplace of
   composable module libraries - its own words are "Plug. Play. Ship. Skip the boilerplate. Plug in
   proven modules", across Crypto, History, Rate Limit, Relations, Resend and Webhooks - which a
   module author composes into their own module before publishing. The registry sells _code to build
   with_, and nothing in it is a room a person can open by downloading it. This system uses the
   registry the same way: a room's module is composed from reviewed libraries, and the composed
   artifact is what is published.
4. **Client-side WebAssembly is a different pattern and stays where it belongs.** The cited prior
   art, `Navigate-WASM` in the local inventory, is a Rhai engine compiled to WebAssembly for
   execution in the browser: `wasm-bindgen` bindings, a sandbox that prevents filesystem and network
   access, Ed25519 signature verification, AES-256-GCM decryption, and a bytecode compiler for logic
   distribution. That is logic travelling to a client, which is exactly the shape this system needs
   for verification and decryption in the browser (RFC-0013's keystore) - and it is not the room's
   module. The two never merge: a room's module runs on the host and decides visibility; a
   client-side module runs in the browser and holds keys the host must never see.
5. **A live room is an event table plus a per-member view.** An event table broadcasts a reducer's
   rows to clients and stores nothing in the client cache (`AGENTS.md:68`), and a per-user view
   delivers only the rows it returns, dropping them when the row it depends on is deleted
   (`AGENTS.md:617`). The registry demonstrates the pattern at its extreme: a voice module with no
   media server, where "Opus packets travel through an event table, and row-level security delivers
   each one only to its listeners". Decision: a room's live behaviour - presence, a feed, a voice
   call - is audience-scoped rows (RFC-0012) delivered by a per-member view, so a live room inherits
   content visibility instead of inventing a channel with its own rules.
6. **What a room never ships.** Not its keys (RFC-0013: epochs are wrapped per member and stay in
   the client) and not its data (RFC-0015: the export is the exit, not the artifact).

## Context

The specification cites `Inventory/Crate/Navigate-WASM` as prior art for a shippable room and no
record decides what that means. Reading the crate settles which pattern it is: its README describes
"Rhai scripting engine compiled to WebAssembly for client-side execution", with a security model of
sandboxed execution, browser memory limits, JavaScript-side timeouts, Ed25519 signature verification
and client-side decryption. It is a browser artifact. A room is not.

The registry page says what packaging means on the engine's own terms. Every entry is a library with
an author, a category and a description of the tables and reducers it adds - roles and grants with
row-level security, an audit log with point-in-time reads, rate limiting, foreign keys, scheduled
tasks with retry, transactional email, verified webhooks, and cross-database messaging through a
transactional outbox with exactly-once apply. Two of those are load-bearing here: the roles module
is the shape RFC-0014's grants take, and the outbox module is the asynchronous form of RFC-0005's
federation that RFC-0012 already assumes.

The live-room half has its own evidence. The voice module in that registry runs inside a module with
no media server, using an event table for packets and row-level security for delivery, which is a
demonstration that "a room that behaves like a live stream" is a table design and not a transport
decision. That is the claim this record makes general.

## Alternatives considered

| Option                                                 | Why not chosen                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Distribute rooms as downloadable WASM binaries         | a module without a database is code, not a room; and a binary a person runs is a host with no rollout and no health view |
| A room as a media stream with its own server           | a second service, a second identity model, and delivery rules that diverge from the content rules                        |
| Live rows in a public table with client-side filtering | a public table replicates to every subscriber and filtering happens after delivery, which is a leak, not a filter        |
| Compose the module from nothing, one monolith per room | reinvents roles, rate limiting, retry and audit that the registry already ships as reviewable libraries                  |
| Use the client-side WASM engine for the room's logic   | the logic would run where the keys are, so the module could read plaintext and the privacy claim collapses               |
| Ship the keys inside the artifact                      | one artifact copy opens every room it is published for; RFC-0013 forbids it                                              |

## Consequences

- A room's identity is a pair - artifact hash and database identity - and both must be recorded for
  a rollout to be reversible (RFC-0016's open question about rollback becomes a question about the
  pair).
- Hot-swap means a live room survives a module upgrade, so the client must tolerate two module
  versions during a compatibility window, which is the constraint RFC-0016 already accepts.
- Composing from registry libraries adds supply-chain review: a library's tables become the room's
  schema, so pinning a version is a security decision and not a convenience.
- Live rows cost a subscription per member rather than a broadcast, so a room of fifty members pays
  fifty deliveries for one message. That is the price of per-member visibility and it is not
  avoidable while visibility is per row.
- A client-side verification module is a second build artifact to sign, version and load, and it
  must fail closed when it cannot load.

## Verification

| Claim                             | Test                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| A room records its artifact       | `spacetime describe <room> --json \| jq -r '.module.hash'` prints the published artifact hash (intent - no hash row exists yet)                   |
| Hot-swap keeps clients connected  | republish a module with a client subscribed; the subscription continues and no reconnect is logged (engine behaviour, `AGENTS.md:99`)             |
| A live row is audience-scoped     | subscribe as a member without the grant; the event table's row never arrives (intent, per-user view)                                              |
| A live row dies with its grant    | delete the grant while subscribed; the rows it exposed drop from the client (engine behaviour, `AGENTS.md:617`)                                   |
| The artifact carries no key       | unpack the published module; no epoch, private key or member key appears in it (intent)                                                           |
| The registry pattern is a library | `spacetimedb.com/modules` lists composed libraries with authors and categories, and no entry is a downloadable room (page read, cited in Context) |
| The client module fails closed    | block the WASM fetch; the client refuses to decrypt rather than falling back to the host's plaintext path (intent)                                |

## Open questions

- Whether a room's artifact can be fetched back from the host, which is what makes a room restorable
  after its source is lost. The engine publishes a module to a database and the CLI can describe it;
  whether it can return the artifact bytes is UNKNOWN. Spike: publish a local room, then attempt a
  fetch of the module by hash.
- Whether the event-table-plus-view pattern scales to a feed a person scrolls rather than a call
  someone is in. Event tables deliver only to `onInsert` callbacks and keep no client-side cache
  (`AGENTS.md:68`), so a late joiner sees nothing of the past - which is correct for presence and
  wrong for a comment thread.
- Whether composing from registry libraries is auditable at all: the registry lists an author and a
  description, and no page read states a review, a signature or a version pinning mechanism.
  UNKNOWN, and it decides whether a room's module can be called reviewed code.
- Whether a room's live rows and its stored rows should share one audience field or two. One field
  is simpler and forces a live packet to be audience-scoped; two allow a call to be narrower than
  the conversation it happens in, which is what the voice module's proximity model implies.

# RFC index

Design records for this repository, in the house format used across the wider tree: one file per
decision, numbered, living under `proposed/` until the work lands and then moved to `implemented/`.
A card references its RFC by number; an RFC references the cards that implement it.

## Conventions

| Item         | Rule                                                   |
| ------------ | ------------------------------------------------------ |
| Filename     | `RFC-NNNN-kebab-case-title.md`                         |
| Location     | `proposed/` while open, `implemented/` once shipped    |
| Numbering    | assigned on creation, never reused                     |
| Supersession | a new RFC marks the old one `Superseded by`, both stay |
| Cards        | every RFC names the cards that implement it, by id     |

## Records

Forty-two are written; none is implemented. A record moves to `implemented/` only when its
verification table passes against the shipped code.

The table lists every file in `proposed/`, and the count above is the number of files there. A
record absent from the table, or a row with no file, is a defect: the change that writes a record
adds its row.

The first ten decide the mechanics. Records 0011 to 0020 decide the product: what an audience is,
who holds a key, how a room closes, what an export contains, what a host may observe, and what the
system refuses to defend. Records 0021 to 0027 are the residuals a second reading found. Records
0028 to 0042 are wave three - the operational and social layer that a room needs once it exists:
retention, search, sync, moderation, rate, migration, versions, attention, naming, testing, law,
billing, time, analytics and extension. Records beyond 0042 extend the set and state their own
dependencies.

| RFC      | Title                                                           | Decision class | Cards                  |
| -------- | --------------------------------------------------------------- | -------------- | ---------------------- |
| RFC-0001 | Storage and projection model                                    | architecture   | t_fe20eeee             |
| RFC-0002 | Single schema source of truth                                   | architecture   | t_fe20eeee             |
| RFC-0003 | Transport seam                                                  | architecture   | t_7936cc8e             |
| RFC-0004 | Ingress and job orchestration                                   | architecture   | -                      |
| RFC-0005 | Network substrate                                               | product        | t_1621cc5c             |
| RFC-0006 | Harvesting posture                                              | policy         | -                      |
| RFC-0007 | Privacy, encryption and validation                              | policy         | -                      |
| RFC-0008 | Media handling                                                  | architecture   | -                      |
| RFC-0009 | Build, release and toolchain                                    | methodology    | t_17031e18, t_6e510f8e |
| RFC-0010 | Documentation and template policy                               | governance     | t_34ee3d19, t_bceac9f5 |
| RFC-0011 | Configuration schema and extensibility                          | architecture   | -                      |
| RFC-0012 | Audience tiers and propagation                                  | product        | -                      |
| RFC-0013 | Identity, keys and certificate authorities                      | policy         | -                      |
| RFC-0014 | Room lifecycle and invitations                                  | product        | -                      |
| RFC-0015 | Portability and import                                          | architecture   | -                      |
| RFC-0016 | Hosting and tenancy                                             | product        | -                      |
| RFC-0017 | Client surface                                                  | product        | -                      |
| RFC-0018 | Observability and tracing                                       | architecture   | -                      |
| RFC-0019 | Vocabulary and terminology                                      | governance     | -                      |
| RFC-0020 | Trust and security model                                        | policy         | -                      |
| RFC-0021 | Fleet coordination and observation provenance                   | policy         | -                      |
| RFC-0022 | Room isolation on a host                                        | policy         | t_1621cc5c             |
| RFC-0023 | Delegation of custody                                           | product        | -                      |
| RFC-0024 | Action ingress gateway                                          | architecture   | -                      |
| RFC-0025 | Room distribution: the module as artifact, the room as a stream | architecture   | -                      |
| RFC-0026 | Peer-carried transport                                          | architecture   | -                      |
| RFC-0027 | Product surface and curation economics                          | product        | t_406cc8ab             |
| RFC-0028 | Data lifecycle and retention                                    | policy         | -                      |
| RFC-0029 | Search and indexing under encryption                            | architecture   | -                      |
| RFC-0030 | Offline-first sync and conflict resolution                      | architecture   | -                      |
| RFC-0031 | Moderation and community governance                             | governance     | -                      |
| RFC-0032 | Rate limiting and abuse resistance                              | policy         | -                      |
| RFC-0033 | Room migration between hosts                                    | architecture   | -                      |
| RFC-0034 | Versioning and protocol compatibility                           | architecture   | -                      |
| RFC-0035 | Notifications, presence and attention                           | product        | -                      |
| RFC-0036 | Naming, handles and namespace                                   | governance     | -                      |
| RFC-0037 | Testing and simulation strategy                                 | methodology    | -                      |
| RFC-0038 | Legal posture                                                   | policy         | -                      |
| RFC-0039 | Billing and metering                                            | product        | -                      |
| RFC-0040 | Time, ordering and causality                                    | architecture   | -                      |
| RFC-0041 | Analytics without reading content                               | policy         | -                      |
| RFC-0042 | Plugin and extension model                                      | architecture   | -                      |

The Cards column records the ids a record names. Those may be research cards or implementing cards -
each record's own `Task dependencies` line says which - and `-` means the record names no card yet.
Where a record names the card that would implement it by title only, the column stays `-` until that
card exists on the board. A record is not implemented by the card that preceded it, so a finished
prerequisite is not listed as an implementing card.

## Residuals: what the second pass added

A second reading of the product specification found eight items with no record and four that were
partially covered. Every one has a home, and the disposition says which.

| #   | Item                                               | Disposition                                                                                                                                                 |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Fleet coordination and provenance                  | new record, RFC-0021                                                                                                                                        |
| B   | Host isolation model                               | new record, RFC-0022                                                                                                                                        |
| C   | Encrypting auth and actions                        | folded into RFC-0007 as the section "Authentication and action records": the payload rule was already there and this is the same boundary, not a second one |
| D   | Delegation                                         | new record, RFC-0023                                                                                                                                        |
| E   | Ingress gateway for arbitrary actions              | new record, RFC-0024                                                                                                                                        |
| F   | Room as a shippable binary                         | new record, RFC-0025                                                                                                                                        |
| G   | Peer-to-peer transport                             | new record, RFC-0026                                                                                                                                        |
| H   | Product and curation economics                     | new record, RFC-0027                                                                                                                                        |
| I   | Everything configurable                            | covered already, no change: RFC-0011 names certificate authorities and future terms in its Decision and makes adding a term a schema-version change         |
| J   | Audiences: public, typed, internal, federated push | propagation is in scope (RFC-0012 rules 3 and 4); delegation is not, and lands in RFC-0023, because custody is a different question from who may read       |
| K   | Import from other platforms                        | covered already, no change: RFC-0015 imports foreign content through an adapter that emits the same five files with `origin` set and `signature: null`      |
| L   | Authoritative visibility for small networks        | extended RFC-0005: the five-member consequence is a bullet in its Consequences and a row in its Verification table                                          |

## Wave three: the operational and social layer

Records 0028 to 0042 extend the set past the product-level records. They decide what happens to a
record after it is written, and to a room after it is full. Numbering continues after the residuals
block: this wave took 0028 to 0042, and 0043 is the next free number.

Each record extends a decision already made rather than restating it, and the extension is named in
its own `Task dependencies` line. The dependencies inside the wave are these:

```
0040 time ---------+--> 0030 sync (a claim is not an order)
                   +--> 0033 migration (the seam between two clocks)
                   +--> 0034 versions (an additivity rule needs a clock to age a window)

0028 retention ----+--> 0031 moderation (a redaction writes a tombstone)
                   +--> 0033 migration (the export is the only complete copy)

0007 privacy ------+--> 0029 search (no plaintext projection)
                   +--> 0038 law (the controller/processor split)
                   +--> 0042 extension (a library cannot read plaintext)

0032 rate ---------+--> 0039 billing (an invitation is a metered row)
0021 provenance ---+--> 0028 retention (an observation is the observer's authorship)

0037 testing -------------------> every record (an intent row is an untested claim)
```

Two of the fifteen are boundaries rather than features. RFC-0038 states what the operator owes and
what it cannot owe, and RFC-0037 states what can be proven before a second host exists. Both exist
so that the other thirteen do not have to hedge in every paragraph.

## Research: the three pages the specification named

The changelog was already cited. Three pages were named and unread; all three were read on
2026-11-02 through the local Crawl4AI server on `127.0.0.1:11235`. Each needed `--scan-full-page`,
because all three are client-rendered and return an empty body without it. The bodies are stored
under `Maintain/Storage/Reference/spacetimedb/pages/`, which is gitignored.

| Page                         | What it actually says                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Where it settled something                                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spacetimedb.com/modules`    | A registry of composable module libraries - "Plug. Play. Ship. Skip the boilerplate." - across Crypto, History, Rate Limit, Relations, Resend and Webhooks, each entry naming an author and a category. One entry is voice chat with no media server: Opus packets through an event table, delivered to each listener only by row-level security.                                                                                                                                          | RFC-0025: distribution is a registry of code to compose, not a binary to download; and a live room is an event table plus a per-member view                                                                                      |
| `spacetimedb.com/features`   | A feature-request board, not a feature list. QUIC transport, ZSTD compression for websocket messages, LTS Maincloud and synchronous inter-database calls are all requests, and Maincloud deploys the latest release to every module. The repository's own engine reference documents asynchronous inter-database calls as available (`Maintain/Spacetime/AGENTS.md:143`), so the asynchronous form is the one RFC-0005 and RFC-0012 may rely on and the synchronous form is not available. | RFC-0026: the wire is the engine's own protocol today, so a carrier speaks it. RFC-0022: no page describes the module sandbox, which is why isolation rests on an allowlist rather than a sandbox claim                          |
| `spacetimedb.com/space-race` | A referral program: a permanent increase to a Maincloud account's monthly free energy, 2,500 TeV per referral and 22,500 more when a referee upgrades to Pro, with the rewards kept after a downgrade. It describes no consensus, sharding or space-race model.                                                                                                                                                                                                                            | Nothing. The "space-race model" the specification names is UNKNOWN: this page does not describe one and no other page read does. RFC-0022 leaves the corresponding isolation question open with a named spike instead of a guess |

## How records 0011 to 0020 depend on each other

That set is not a flat list; several records cannot be implemented out of order.

```
0011 configuration --+--> 0013 identity and keys --+--> 0014 rooms and invitations --> 0015 portability
                     |                             |
0005 rooms ----------+--> 0012 audiences ----------+
                     |
                     +--> 0016 hosting and tenancy
                     +--> 0017 client surface
                     +--> 0020 trust and security

0018 observability -------------------------> every record (a run is how a claim is checked)
0019 vocabulary ----------------------------> every record (a term is defined once)
```

## Settled already, by evidence rather than debate

These are not RFCs; they are facts the RFCs build on. Each has a test in the referenced document.

| Fact                                                          | Where it is proven                               |
| ------------------------------------------------------------- | ------------------------------------------------ |
| The site is static and deploys on push                        | `Documentation/Reference/Firebase.md`            |
| Firebase is backend only, no hosting block                    | `Documentation/Reference/Firebase.md`            |
| A scrape opens its own background tab                         | `Documentation/Plan/Bookmark-Pipeline.md`        |
| Redirects are generated, never hand-written                   | `Documentation/Reference/Redirect-Generation.md` |
| The projection lags the files today (207 vs 209)              | `Documentation/Reference/Spacetime.md`           |
| The module checks no caller (`ctx.sender` appears zero times) | RFC-0020, by `grep -c` on the module             |
| A wrong-typed config key falls back in silence                | RFC-0011, by `config show` on a probe map        |
| An unknown config key is dropped by any write                 | RFC-0011, by `config init --force`               |

## Writing an RFC

Copy `TEMPLATE.md`, assign the next number - 0043 is next - and keep the Decision section to what is
being decided; context and alternatives belong below it. An RFC that cannot name its verification is
not ready.

Three rules come from the set itself: a term used here is defined in RFC-0019's vocabulary; a
decision that depends on an engine capability nobody has measured says UNKNOWN and names the spike
that would settle it; and a verification row names a command a reader can run, or is marked as
intent.

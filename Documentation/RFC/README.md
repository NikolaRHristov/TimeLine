# RFC index

Design records for this repository, in the house format used across the wider tree: one file per
decision, numbered, living under `proposed/` until the work lands and then moved to `implemented/`.
A card references its RFC by number; an RFC references the cards that implement it.

---

## Conventions

- **Filename** - `RFC-NNNN-kebab-case-title.md`.
- **Location** - `proposed/` while open, `implemented/` once shipped.
- **Numbering** - assigned on creation, never reused. `0056` is the next free number.
- **Supersession** - a new record marks the old one `Superseded by`, and both stay.
- **Cards** - every record names the cards that implement it, by id.

---

## The records

Fifty-five are written; none is implemented. A record moves to `implemented/` only when its
verification table passes against the shipped code.

Every file in `proposed/` appears below, and the count above is the number of files there. A record
absent from the list, or an entry with no file, is a defect: the change that writes a record adds
its entry.

### Architecture

- **RFC-0001** - Storage and projection model. _Cards: `t_fe20eeee`._
- **RFC-0002** - Single schema source of truth. _Cards: `t_fe20eeee`._
- **RFC-0003** - Transport seam. _Cards: `t_7936cc8e`._
- **RFC-0004** - Ingress and job orchestration.
- **RFC-0008** - Media handling.
- **RFC-0011** - Configuration schema and extensibility.
- **RFC-0015** - Portability and import.
- **RFC-0018** - Observability and tracing.
- **RFC-0024** - Action ingress gateway.
- **RFC-0025** - Room distribution: the module as artifact, the room as a stream.
- **RFC-0026** - Peer-carried transport.
- **RFC-0029** - Search and indexing under encryption.
- **RFC-0030** - Offline-first sync and conflict resolution.
- **RFC-0033** - Room migration between hosts.
- **RFC-0034** - Versioning and protocol compatibility.
- **RFC-0040** - Time, ordering and causality.
- **RFC-0042** - Plugin and extension model.
- **RFC-0049** - The component state model.
- **RFC-0050** - The data states.
- **RFC-0052** - The material states.

### Product

- **RFC-0005** - Network substrate. _Cards: `t_1621cc5c`._
- **RFC-0012** - Audience tiers and propagation.
- **RFC-0014** - Room lifecycle and invitations.
- **RFC-0016** - Hosting and tenancy.
- **RFC-0017** - Client surface.
- **RFC-0023** - Delegation of custody.
- **RFC-0027** - Product surface and curation economics. _Cards: `t_406cc8ab`._
- **RFC-0035** - Notifications, presence and attention.
- **RFC-0039** - Billing and metering.
- **RFC-0043** - Local-first workspace: identity, network and publishing. _Cards: `t_ab85d9de`._
- **RFC-0046** - The capability spectrometer.
- **RFC-0047** - The trust swimlanes.
- **RFC-0048** - The status surfaces.
- **RFC-0053** - The showcase surface.
- **RFC-0054** - The anonymous workspace.
- **RFC-0055** - DELO and the provider position.

### Policy

- **RFC-0006** - Harvesting posture.
- **RFC-0007** - Privacy, encryption and validation.
- **RFC-0013** - Identity, keys and certificate authorities.
- **RFC-0020** - Trust and security model.
- **RFC-0021** - Fleet coordination and observation provenance.
- **RFC-0022** - Room isolation on a host. _Cards: `t_1621cc5c`._
- **RFC-0028** - Data lifecycle and retention.
- **RFC-0032** - Rate limiting and abuse resistance.
- **RFC-0038** - Legal posture.
- **RFC-0041** - Analytics without reading content.

### Governance

- **RFC-0010** - Documentation and template policy. _Cards: `t_34ee3d19`, `t_bceac9f5`._
- **RFC-0019** - Vocabulary and terminology.
- **RFC-0031** - Moderation and community governance.
- **RFC-0036** - Naming, handles and namespace.

### Methodology

- **RFC-0009** - Build, release and toolchain. _Cards: `t_17031e18`, `t_6e510f8e`._
- **RFC-0037** - Testing and simulation strategy.
- **RFC-0044** - Toolchain upgrade policy. _Cards: `t_344b78d0`._
- **RFC-0045** - The material, the tokens and the component contract. _Cards: `t_15d5d8fd`,
  `t_30030978`, `t_6b11bda7`, `t_bd4c07b0`, `t_e2a377d0`, `t_52a99949`._
- **RFC-0051** - The token lifecycle.

---

## How the waves relate

The first ten decide the mechanics. Records 0011 to 0020 decide the product: what an audience is,
who holds a key, how a room closes, what an export contains, what a host may observe, and what the
system refuses to defend. Records 0021 to 0027 are the residuals a second reading found. Records
0028 to 0042 are wave three - the operational and social layer a room needs once it exists:
retention, search, sync, moderation, rate, migration, versions, attention, naming, testing, law,
billing, time, analytics and extension. Records beyond 0042 extend the set and state their own
dependencies.

A card id above records what the record names. Those may be research cards or implementing cards -
each record's own `Task dependencies` line says which - and an entry with no card means the record
names none yet. Where a record names the card that would implement it by title only, the entry stays
bare until that card exists on the board. A record is not implemented by the card that preceded it,
so a finished prerequisite is not listed as an implementing card.

### The product set, 0011 to 0020

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

### Wave three, 0028 to 0042

Each record extends a decision already made rather than restating it, and the extension is named in
its own `Task dependencies` line.

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

---

## Residuals: what the second pass added

A second reading of the product specification found eight items with no record and four that were
partially covered. Every one has a home, and the disposition says which.

- **A - Fleet coordination and provenance.** A new record: RFC-0021.
- **B - Host isolation model.** A new record: RFC-0022.
- **C - Encrypting auth and actions.** Folded into RFC-0007 as the section _Authentication and
  action records_: the payload rule was already there and this is the same boundary, not a second
  one.
- **D - Delegation.** A new record: RFC-0023.
- **E - Ingress gateway for arbitrary actions.** A new record: RFC-0024.
- **F - Room as a shippable binary.** A new record: RFC-0025.
- **G - Peer-to-peer transport.** A new record: RFC-0026.
- **H - Product and curation economics.** A new record: RFC-0027.
- **I - Everything configurable.** Covered already, no change: RFC-0011 names certificate
  authorities and future terms in its Decision, and makes adding a term a schema-version change.
- **J - Audiences: public, typed, internal, federated push.** Propagation is in scope (RFC-0012
  rules 3 and 4). Delegation is not, and lands in RFC-0023, because custody is a different question
  from who may read.
- **K - Import from other platforms.** Covered already, no change: RFC-0015 imports foreign content
  through an adapter that emits the same five files with `origin` set and `signature: null`.
- **L - Authoritative visibility for small networks.** Extended RFC-0005: the five-member
  consequence is a bullet in its Consequences and a row in its Verification table.

---

## Research: the three pages the specification named

The changelog was already cited. Three pages were named and unread; all three were read through the
local Crawl4AI server on `127.0.0.1:11235`. Each needed `--scan-full-page`, because all three are
client-rendered and return an empty body without it. The bodies are stored under
`Maintain/Storage/Reference/spacetimedb/pages/`, which is gitignored.

**`spacetimedb.com/modules`** - a registry of composable module libraries across Crypto, History,
Rate Limit, Relations, Resend and Webhooks, each entry naming an author and a category. One entry is
voice chat with no media server: Opus packets through an event table, delivered to each listener
only by row-level security. It settled RFC-0025: distribution is a registry of code to compose, not
a binary to download, and a live room is an event table plus a per-member view.

**`spacetimedb.com/features`** - a feature-request board, not a feature list. QUIC transport, ZSTD
compression for websocket messages, LTS Maincloud and synchronous inter-database calls are all
requests, and Maincloud deploys the latest release to every module. The repository's own engine
reference documents asynchronous inter-database calls as available
(`Maintain/Spacetime/AGENTS.md:143`), so the asynchronous form is the one RFC-0005 and RFC-0012 may
rely on and the synchronous form is not available. It settled RFC-0026 (the wire is the engine's own
protocol today, so a carrier speaks it) and RFC-0022 (no page describes the module sandbox, which is
why isolation rests on an allowlist rather than a sandbox claim).

**`spacetimedb.com/space-race`** - a referral program: a permanent increase to a Maincloud account's
monthly free energy, 2,500 TeV per referral and 22,500 more when a referee upgrades to Pro, with the
rewards kept after a downgrade. It describes no consensus, sharding or space-race model, so it
settled nothing. The "space-race model" the specification names is UNKNOWN: this page does not
describe one and no other page read does. RFC-0022 leaves the corresponding isolation question open
with a named spike instead of a guess.

---

## Settled already, by evidence rather than debate

These are not RFCs. They are facts the records build on, and each has a test in the document that
names it.

- **The site is static and deploys on push** - `Documentation/Reference/Firebase.md`.
- **Firebase is backend only, with no hosting block** - `Documentation/Reference/Firebase.md`.
- **A scrape opens its own background tab** - `Documentation/Plan/Bookmark-Pipeline.md`.
- **Redirects are generated, never hand-written** -
  `Documentation/Reference/Redirect-Generation.md`.
- **The projection lags the files today (207 against 209)** -
  `Documentation/Reference/Spacetime.md`.
- **The module checks no caller** (`ctx.sender` appears zero times) - RFC-0020, by `grep -c` on the
  module.
- **A wrong-typed config key falls back in silence** - RFC-0011, by `config show` on a probe map.
- **An unknown config key is dropped by any write** - RFC-0011, by `config init --force`.

---

## Writing an RFC

Copy `TEMPLATE.md`, assign the next number, and keep the Decision section to what is being decided.
Context and alternatives belong below it. A record that cannot name its verification is not ready.

Three rules come from the set itself. A term used here is defined in RFC-0019's vocabulary. A
decision that depends on an engine capability nobody has measured says UNKNOWN and names the spike
that would settle it. And a verification row names a command a reader can run, or is marked as
intent.

# RFC index

Design records for this repository, in the house format used across the wider tree: one file per
decision, numbered, living under `proposed/` until the work lands and then moved to `implemented/`.
A card references its RFC by number; an RFC references the cards that implement it.

---

## The board

The records are also published as issues on a public project linked to this repository:
[the project](https://github.com/orgs/<owner>/projects/1).

- **One issue per record.** The title repeats the number and the title. The body carries the
  record's Decision section verbatim, its classification, its task dependencies, a link back to the
  file, and the verification table. An issue is never a summary of its record.
- **Six fields.** `RFC` is the number. `Kind`, `Subject` and `Horizon` are the record's own
  frontmatter fields, each a closed vocabulary defined below; the board copies them and never infers
  one. `Status` is `Proposed` until the verification table passes against shipped code, then
  `Implemented`. `Cards` holds the card ids a record names, and is empty for the records that name
  none.
- **Three views over one item set.** A table by kind, a board by status and a roadmap by kind. Each
  view's grouping is set once in the interface: the API accepts a view's name, layout, filter and
  visible fields, and no group-by on any input object.
- **A template.** The project is marked as a template, and its own README carries the field scheme
  and the command that copies it to another owner.

`Class` and `Area` are retired. Each was five values with no written definition, `governance` was a
value on both, and the audit in `Documentation/Reference/RFC-Classification.md` measured what that
produced: of seventy-one records, twenty-two carried a label that contradicted their own Decision on
at least one axis, and the largest values were where a record landed when it fitted nowhere else.
The board now carries the three axes below and no other taxonomy.

The project is generated from `proposed/` and the files remain the authority. An issue with no
record, or a record with no issue, is a defect of the same kind as an unlisted file.

The procedure that builds and re-syncs the board is `Documentation/Skill/RFC-Board/SKILL.md`, and
the tool it wraps is `Documentation/Skill/RFC-Board/Reference/rfc_board.py`:

```sh
pnpm run RFC:Board                        # read: compare the committed records with the board, write nothing
pnpm run RFC:Board:Verify                 # read: the project back, non-zero on the first disagreement
pnpm run RFC:Board:Sync --reason "<why>"  # write: create, refresh, attach, set fields, update the README
```

The first two read and the third writes. `sync` refuses a board that already holds items unless
`--reason` names why the write is justified, so a habit cannot rewrite what other people see; an
empty board is the initial sync and needs no reason, because there is nothing of anyone else's to
lose.

Only committed records are published. A record still untracked is somebody's work in progress, so it
is reported as skipped and never published half-written; commit it, run the command again, and the
delta lands. The procedure states the one step no API can take, which is each view's grouping.

---

## Classification

Three axes, each a closed vocabulary. No value appears on two axes, and every value is one word, so
a value names one question and cannot be read as the answer to another.

### Kind - what the record decides

- **architecture** - how the parts fit: which component owns a thing, and what flows between two of
  them.
- **contract** - an interface another party may build against, including the rule that keeps it
  stable across a change.
- **policy** - a permission, a refusal or an obligation that binds an actor, independent of any
  interface's shape.
- **specification** - a definition: a term, a name, a closed vocabulary, or a fixed set of values.
- **method** - how the work of building and verifying is done, from a command a person runs to a
  rule a worker follows.

### Subject - what the record is about

- **data** - what is stored: its shape, its authority, its integrity, its retention and its
  projection.
- **transport** - how bytes move between a client and the authority that serves it.
- **identity** - keys, names, custody, attribution, reputation and recovery.
- **surface** - what a reader sees and operates: pages, components, states, copy and accessibility.
- **network** - how actors relate: a room and its members, two rooms, a host and a room, a person
  and another network.
- **operation** - running the thing: build, release, configuration, observation, test and gate.
- **economy** - money: what is metered, what a bill states, what the provider sells.
- **text** - the project's own words and names: tracked prose, terminology and identifiers.

### Horizon - what the record presupposes

- **now** - the Decision presupposes something that already exists in the tree, so the code that
  ships today must conform to it.
- **next** - the Decision presupposes a room, a key or a host that does not exist yet, and binds
  before the first of them does.
- **later** - the Decision presupposes a second network or a third party outside this one, so
  nothing here is owed.

### The rules that make a record assignable

1. **Kind before Subject.** Decide what the record does to the reader before deciding what it is
   about. A record that fixes a shape and also forbids something is `policy` when the prohibition is
   the point (RFC-0022, isolation by egress allowlist) and `contract` when the shape is.
2. **The subject is the noun the rules operate on, not the file they land in.** This is the rule
   that makes the storage record `data` and the workspace record `surface`, although both are built
   by the tool layer.
3. **A contract is what a change must not break for someone who is not making the change.** A
   command author, an importer, a third-party client. Architecture is the arrangement itself, and
   nobody outside it is broken by changing it.
4. **Transport is one connection between a client and the authority that serves it; network is a
   relation between two authorities.** A peer relay is transport. A room migration is network.
5. **Operation is a thing that runs; data is a thing that is stored.** A meter is operation; a
   retention window is data.
6. **Economy only when money, price or a bill appears in the Decision.** Hosting without a price is
   operation.
7. **Horizon reads the presupposition, not the card.** A record that names a card is not thereby
   `now`, and a record with no card is not thereby `later`.

A record states `Kind` and `Subject` as one `category` in its frontmatter, and `Horizon` beside it.
`Documentation/Skill/RFC-Board/Reference/rfc_board.py` refuses a record that is missing either,
whose `category` is not `<Kind>/<Subject>`, or that carries a value outside the three vocabularies:

```sh
pnpm run RFC:Board    # read: a record the parser refuses is reported as FAIL, not published
```

What no command settles is whether the assignment agrees with the record's own Decision. A
classification nothing reads is a classification that ships empty, so that comparison belongs to a
reviewer, and the board copies the value it is given.

The audit that produced the taxonomy - the reading of each record's previous labels, the three
values it changed after testing them against all seventy-six records, and the argument for there
being no fourth axis - is `Documentation/Reference/RFC-Classification.md`.

---

## Conventions

- **Filename** - `RFC-NNNN-kebab-case-title.md`.
- **Location** - `proposed/` while open, `implemented/` once shipped.
- **Numbering** - assigned on creation, never reused. `0077` is the next free number.
- **Supersession** - a new record marks the old one `superseded_by`, and both stay.
- **Cards** - every record names the cards that implement it, in `depends`.
- **Header** - a YAML block between two `---` lines, and the body starts at `## Decision`. The
  fields are `title`, `rfc`, `category`, `kind`, `date`, `status`, `horizon`, `registry`, `index`,
  `owner`, `applies_to`, `supersedes`, `superseded_by`, `depends` and `statuses`, in that order.
  There is no `# RFC-NNNN - Title` heading above the block: the title and the number are fields, and
  a heading that repeats them is a second copy that can disagree with the first.
- **Status** - `proposed`, `settled` or `superseded`, lowercase. `settled` is the record's word for
  what the board calls Implemented, and `superseded` has no option on the board yet, so a record
  that carries it renders its own word in the issue and leaves the field alone.
- **Statuses** - one entry per rule in the Decision section: the rule in a few words, the state of
  the tree, and the evidence. `current` means the file or command the rule names is in the tree
  today; `open` means the rule names none, or names something that is not there. Nothing derives the
  pair from the record, so a reader holding the block against the tree is what keeps it honest.
- **Classification** - `category` is `<Kind>/<Subject>` from the vocabularies above, and `horizon`
  is the third axis. A new record chooses its three values before it is written, and the board's
  parser refuses one that is not in them.

---

## The records

Seventy-six are written; none is implemented. A record moves to `implemented/` only when its
verification table passes against the shipped code.

Each record states its rules in `statuses`, with the file or command each rule names as the
evidence. Read against the tree, most of them name nothing, or name something that is not there: no
record has passed its verification table, and the few that name something the tree keeps are rules
about the shape of the build itself.

Every file in `proposed/` appears below once under its `Kind`, and again in the two short indexes
that follow, which list every record by `Subject` and by `Horizon`. A record absent from any of the
three is a defect, as is an entry with no file: the change that writes a record adds its entry.

Grouped by `Kind`, the axis that answers what a record decides:

### Architecture (23)

- **RFC-0001** - Storage and projection model. _Cards: `t_e1a18798`, `t_fe20eeee`._
- **RFC-0002** - Single schema source of truth. _Cards: `t_fe20eeee`._
- **RFC-0004** - Ingress and job orchestration.
- **RFC-0005** - Network substrate. _Cards: `t_1621cc5c`._
- **RFC-0008** - Media handling.
- **RFC-0011** - Configuration schema and extensibility. _Cards: `t_5ca276be`, `t_c65afc0c`._
- **RFC-0014** - Room lifecycle and invitations. _Cards: `t_1621cc5c`._
- **RFC-0017** - Client surface. _Cards: `t_406cc8ab`, `t_6e510f8e`, `t_7936cc8e`._
- **RFC-0018** - Observability and tracing. _Cards: `t_7936cc8e`, `t_92e48af0`._
- **RFC-0025** - Room distribution: the module as artifact, the room as a stream.
- **RFC-0026** - Peer-carried transport.
- **RFC-0029** - Search and indexing under encryption.
- **RFC-0030** - Offline-first sync and conflict resolution.
- **RFC-0033** - Room migration between hosts.
- **RFC-0035** - Notifications, presence and attention.
- **RFC-0040** - Time, ordering and causality.
- **RFC-0043** - Local-first workspace: identity, network and publishing. _Cards: `t_1621cc5c`,
  `t_ab85d9de`._
- **RFC-0053** - The showcase surface.
- **RFC-0054** - The anonymous workspace.
- **RFC-0059** - One record, many references.
- **RFC-0062** - An import is an archive, not an account.
- **RFC-0065** - A digest chain, and a drill that runs.
- **RFC-0070** - A room starts from a template the module ships.

### Contract (13)

- **RFC-0003** - Transport seam. _Cards: `t_7936cc8e`._
- **RFC-0012** - Audience tiers and propagation. _Cards: `t_1621cc5c`._
- **RFC-0015** - Portability and import. _Cards: `t_b9e11f0c`, `t_fe20eeee`._
- **RFC-0023** - Delegation of custody.
- **RFC-0024** - Action ingress gateway.
- **RFC-0034** - Versioning and protocol compatibility.
- **RFC-0045** - The material, the tokens and the component contract. _Cards: `t_15d5d8fd`,
  `t_30030978`, `t_52a99949`, `t_6b11bda7`, `t_bd4c07b0`, `t_e2a377d0`._
- **RFC-0058** - A room's public face, and no member directory.
- **RFC-0060** - Attribution survives re-encryption because it signs plaintext.
- **RFC-0064** - A list is a signed, versioned object.
- **RFC-0066** - What a person can see about their own data.
- **RFC-0068** - Language is content; accessibility is a contract.
- **RFC-0069** - The read surface a developer may build against.

### Policy (23)

- **RFC-0006** - Harvesting posture.
- **RFC-0007** - Privacy, encryption and the validation boundary.
- **RFC-0010** - Documentation and template policy. _Cards: `t_34ee3d19`, `t_bceac9f5`._
- **RFC-0013** - Identity, keys and certificate authorities.
- **RFC-0016** - Hosting and tenancy. _Cards: `t_1621cc5c`, `t_17031e18`._
- **RFC-0020** - Trust and security model. _Cards: `t_1621cc5c`._
- **RFC-0021** - Fleet coordination and observation provenance.
- **RFC-0022** - Room isolation on a host. _Cards: `t_1621cc5c`._
- **RFC-0027** - Product surface and curation economics. _Cards: `t_406cc8ab`._
- **RFC-0028** - Data lifecycle and retention.
- **RFC-0031** - Moderation and community governance.
- **RFC-0032** - Rate limiting and abuse resistance.
- **RFC-0038** - Legal posture.
- **RFC-0039** - Billing and metering.
- **RFC-0041** - Analytics without reading content.
- **RFC-0042** - Plugin and extension model.
- **RFC-0051** - The token lifecycle.
- **RFC-0055** - DELO and the provider position.
- **RFC-0056** - Identity carried by others.
- **RFC-0057** - Recovery restores the name, not the archive.
- **RFC-0061** - Bridges are out of scope; the export is the interface.
- **RFC-0067** - Keep everything, compress, and name the cost.
- **RFC-0071** - Who may publish a library, and what revocation can reach.

### Specification (9)

- **RFC-0019** - Vocabulary and terminology. _Cards: `t_23dc5d47`, `t_bceac9f5`._
- **RFC-0036** - Naming, handles and namespace.
- **RFC-0046** - The capability spectrometer. _Cards: `t_ab85d9de`._
- **RFC-0047** - The trust swimlanes.
- **RFC-0048** - The status surfaces.
- **RFC-0049** - The component state model.
- **RFC-0050** - The data states.
- **RFC-0052** - The material states.
- **RFC-0063** - Reputation of people, never of posts.

### Method (8)

- **RFC-0009** - Build, release and toolchain. _Cards: `t_17031e18`, `t_6e510f8e`._
- **RFC-0037** - Testing and simulation strategy.
- **RFC-0044** - Toolchain upgrade policy. _Cards: `t_344b78d0`._
- **RFC-0072** - A verifier asserts the spec, not the implementation.
- **RFC-0073** - A tool that ran belongs to a skill.
- **RFC-0074** - A green gate is not a green tree.
- **RFC-0075** - The layer tree is the authority, the picture is a likeness.
- **RFC-0076** - A worker that cannot hold both cards stops.

### By subject

- **data - 15.** RFC-0001, RFC-0002, RFC-0007, RFC-0008, RFC-0012, RFC-0015, RFC-0028, RFC-0029,
  RFC-0040, RFC-0059, RFC-0062, RFC-0064, RFC-0065, RFC-0066, RFC-0067
- **transport - 7.** RFC-0003, RFC-0024, RFC-0026, RFC-0030, RFC-0032, RFC-0034, RFC-0035
- **identity - 9.** RFC-0013, RFC-0020, RFC-0021, RFC-0023, RFC-0036, RFC-0056, RFC-0057, RFC-0060,
  RFC-0063
- **surface - 13.** RFC-0017, RFC-0043, RFC-0045, RFC-0046, RFC-0047, RFC-0048, RFC-0049, RFC-0050,
  RFC-0051, RFC-0052, RFC-0053, RFC-0054, RFC-0068
- **network - 12.** RFC-0005, RFC-0014, RFC-0022, RFC-0025, RFC-0031, RFC-0033, RFC-0042, RFC-0058,
  RFC-0061, RFC-0069, RFC-0070, RFC-0071
- **operation - 15.** RFC-0004, RFC-0006, RFC-0009, RFC-0011, RFC-0016, RFC-0018, RFC-0037,
  RFC-0038, RFC-0041, RFC-0044, RFC-0072, RFC-0073, RFC-0074, RFC-0075, RFC-0076
- **economy - 3.** RFC-0027, RFC-0039, RFC-0055
- **text - 2.** RFC-0010, RFC-0019

### By horizon

- **now - 35.** RFC-0001, RFC-0002, RFC-0003, RFC-0004, RFC-0006, RFC-0008, RFC-0009, RFC-0010,
  RFC-0011, RFC-0017, RFC-0018, RFC-0019, RFC-0027, RFC-0037, RFC-0043, RFC-0044, RFC-0045,
  RFC-0046, RFC-0047, RFC-0048, RFC-0049, RFC-0050, RFC-0051, RFC-0052, RFC-0053, RFC-0054,
  RFC-0055, RFC-0065, RFC-0067, RFC-0068, RFC-0072, RFC-0073, RFC-0074, RFC-0075, RFC-0076
- **next - 39.** RFC-0005, RFC-0007, RFC-0012, RFC-0013, RFC-0014, RFC-0015, RFC-0016, RFC-0020,
  RFC-0021, RFC-0022, RFC-0023, RFC-0024, RFC-0025, RFC-0026, RFC-0028, RFC-0029, RFC-0030,
  RFC-0031, RFC-0032, RFC-0033, RFC-0034, RFC-0035, RFC-0036, RFC-0038, RFC-0039, RFC-0040,
  RFC-0041, RFC-0042, RFC-0057, RFC-0058, RFC-0059, RFC-0060, RFC-0062, RFC-0063, RFC-0064,
  RFC-0066, RFC-0069, RFC-0070, RFC-0071
- **later - 2.** RFC-0056, RFC-0061

The horizon split is the measurement, not a fault in the axis. Thirty-five records presuppose
something that exists today, thirty-nine presuppose a room, a key or a host that does not exist yet,
and two presuppose a party outside this network. Crossed against the card ids above, twenty-one of
the thirty-five bind the tree that ships today and name no card - that is the backlog, and it is a
different set from the fifty-five records that name no card at all.

---

## How the waves relate

The first ten decide the mechanics. Records 0011 to 0020 decide the product: what an audience is,
who holds a key, how a room closes, what an export contains, what a host may observe, and what the
system refuses to defend. Records 0021 to 0027 are the residuals a second reading found. Records
0028 to 0042 are wave three - the operational and social layer a room needs once it exists:
retention, search, sync, moderation, rate, migration, versions, attention, naming, testing, law,
billing, time, analytics and extension. Records 0043 to 0056 are the surface records the site work
added - workspace, toolchain, tokens, components, states, showcase, anonymous workspace, provider
position and identity carried by others. Records 0057 to 0071 are wave four: the long tail of
recovery, discovery, provenance, interop and governance. Records 0072 to 0076 are wave five: the
method itself - how a claim is verified, how a tool is kept, what the gate does and does not prove,
where a design's numbers come from, and what a worker does when two cards cannot both hold. Records
beyond 0076 extend the set and state their own dependencies.

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

### Wave four, 0057 to 0071

The long tail: what happens to a person's keys, how a room is found, how the same post behaves in
five rooms, what a bridge can and cannot carry, what a person can see about their own data, and who
governs the code a room runs. Sixteen topics became fifteen records, because the digest and the
drill are one property.

```
0013 keys + 0056 guardianship --+--> 0057 recovery: the archive, not the name
                                +--> 0058 discovery: a face names no member
                                +--> 0063 reputation: statements, not a score

0059 duplicates --+--> 0060 attribution: a signature over plaintext
                  +--> 0067 economics: dedupe inside one store

0015 export --+--> 0061 interop: a bridge is a publication
              +--> 0062 import: an archive, not an account
              +--> 0064 lists: a list is a line type

0001 store --+--> 0065 integrity and drills
             +--> 0066 what a member sees
             +--> 0067 what it costs to keep everything

0025 module --+--> 0070 templates: structure, no content
              +--> 0071 registry: admission, and the limit of revocation

0017 client --+--> 0068 accessibility and language
              +--> 0069 the read surface
```

| Topic the wave named               | Record                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Identity recovery                  | RFC-0057, extending RFC-0013's recovery clause and RFC-0056 §4 rather than restating either |
| Room discovery                     | RFC-0058                                                                                    |
| Cross-room duplicates              | RFC-0059                                                                                    |
| Content provenance and attribution | RFC-0060                                                                                    |
| Interop with existing protocols    | RFC-0061                                                                                    |
| Import from platform exports       | RFC-0062, extending RFC-0015's adapter                                                      |
| Reputation of people, not posts    | RFC-0063                                                                                    |
| Curation as data                   | RFC-0064                                                                                    |
| Archive integrity                  | RFC-0065, which also covers disaster recovery drills                                        |
| Disaster recovery drills           | RFC-0065 - one record, because a digest nobody restores proves the wrong thing              |
| Member-facing observability        | RFC-0066, extending RFC-0018's operational half                                             |
| Storage growth economics           | RFC-0067                                                                                    |
| Accessibility and localisation     | RFC-0068                                                                                    |
| Third-party API and SDK surface    | RFC-0069                                                                                    |
| Room templates and seeding         | RFC-0070                                                                                    |
| Module registry governance         | RFC-0071, extending RFC-0042's admission and revocation                                     |

Three of the fifteen are boundary records, and they exist for the same reason RFC-0038 and RFC-0037
do: RFC-0061 states that no protocol bridge is in scope, RFC-0058 states that discovery publishes a
room and never a membership, and RFC-0071 states the exact limit of a revocation. Each of the other
twelve would otherwise hedge in every paragraph it touches.

None of the fifteen names a card id. Each names its implementing card by title marked "to be
created", so its entry above stays bare until that card exists on the board - the convention stated
below.

### Wave five, 0072 to 0076

The other four waves decide what the system is. This one decides how it is built, and it exists
because the tree already contained the practice: four verifiers, an archive with an audit, a
six-step gate and an intake path were all running before anything wrote down what they promise. Each
of the five states a contract, the command that proves it, and the boundary - what the tool cannot
see.

```
0075 design intake --> the spec's numbers --> 0072 the verifier that asserts them
0073 the tool that ran --> belongs to a skill --> the verifier's home
0074 the gate --> runs the contracts, never the verifier and never the build
0076 the worker --> stops when two cards claim one surface, and records the decision
```

Two of the five correct a count that was circulating. `verify-composition.mjs` holds twenty-two
invariants and the token contract held eight checks; eighteen and five were both in circulation, and
each record names what settles the number rather than repeating it. That is the rule RFC-0072 exists
to state, applied to the record that states it.

None of the five names a card id either. Each names its implementing card by title marked "to be
created", so the entries above stay bare until those cards exist.

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

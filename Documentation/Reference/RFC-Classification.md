# RFC Classification - the audit, and the axes that replace it

Seventy-six records live in `Documentation/RFC/proposed/`; seventy-one of them are published to
project 1. This page audits the classification those records carry, proposes the one that should
replace it, assigns every record under the proposal, and answers the `Status` question. It reports.
It does not re-tag: the re-tag is a separate card, and it reads this page as its input.

The board carries two axes, `Class` and `Area`, five values each, and neither has a definition
anywhere in the repository. `Documentation/RFC/README.md` says only that `Class` repeats the
record's own `Decision class:` line and that `Area` is "the record's dominant subject". A value that
is never defined cannot be wrong, so the audit below states the reading it tests against before it
calls anything misclassified: a label is **ok** when it is the one a reader of the Decision section
alone would choose, **weak** when a second label fits as well, and **wrong** when it contradicts the
Decision.

---

## What the current model gets wrong

### `governance` is two values wearing one name

`governance` is a `Class` and an `Area`, and four records carry both: RFC-0010, RFC-0019, RFC-0031
and RFC-0071. For those four the two axes carry one fact between them, so a table sorted by class
and a board filtered by area return the same rows, and nothing is learned from the second.

The collision is the symptom. The measurement is worse: of the sixteen records in
`Area: governance`, **thirteen are wrong** and three are defensible - RFC-0010, RFC-0031 and
RFC-0071, which are exactly the three whose `Class` is also governance. The other thirteen have no
authority relation in them at all: harvesting posture, privacy and encryption, audience tiers, the
trust model, retention, rate limiting, legal posture, billing, analytics, the provider position,
member observability, curation economics and vocabulary. `Area: governance` is therefore not a
subject. It is where a record lands when its Decision mentions an authority.

### `Area` has no value for the largest subject in the corpus

There is no storage value. The shadow store, the projection, the export, retention, deduplication,
integrity, search and the store's cost are filed under `tooling` (RFC-0001, 0008, 0015, 0029, 0062,
0064, 0065, 0067) or under `network` (RFC-0030, 0040). `tooling` names the command layer, and a
store is not a command: of the eighteen records in `tooling`, four are wrong and six are weak.

There is no economy value. RFC-0039 decides a meter, a bill and a cap; RFC-0027 decides curation
pricing and the operator's three powers; RFC-0055 decides the provider's commercial position. All
three are filed under `governance`. A bill classified as governance is the clearest single proof
that the area axis has no subject meaning.

And `site` is doing the work of "anything the client renders", which is why RFC-0043 - the largest
surface record in the corpus, and the one that defines the drawer, the canvas and the seam - is
filed under `tooling` while eleven component records are `site`.

### The numbers

| Axis  | Value        | Items | ok  | weak | wrong |
| ----- | ------------ | ----- | --- | ---- | ----- |
| Class | architecture | 23    | 17  | 6    | 0     |
| Class | product      | 22    | 9   | 11   | 2     |
| Class | policy       | 15    | 13  | 1    | 1     |
| Class | governance   | 6     | 2   | 2    | 2     |
| Class | methodology  | 5     | 3   | 1    | 1     |
| Area  | tooling      | 18    | 8   | 6    | 4     |
| Area  | network      | 17    | 12  | 5    | 0     |
| Area  | governance   | 16    | 3   | 0    | 13    |
| Area  | site         | 11    | 11  | 0    | 0     |
| Area  | identity     | 9     | 8   | 1    | 0     |

Class totals: **44 ok, 21 weak, 6 wrong**. Area totals: **42 ok, 12 weak, 17 wrong**. Twenty-four of
the seventy-one are defensible on both axes; twenty-two carry a label that contradicts the Decision
on at least one.

The pattern is not subtle. The two values that fail are the two largest after `architecture`:
`product` is defensible nine times out of twenty-two, and `governance` three times out of sixteen.
The two values that pass cleanly are the two that name a place in the tree - `architecture` and
`site`. A value that names a place cannot be argued with; a value that names nothing absorbs
everything. `product` absorbed billing, the showcase, the read surface and the network substrate,
and `governance` absorbed every record that mentions an authority. Neither was ever a
classification. Both were a remainder.

---

## The audit, record by record

The filed values are the board's; the verdicts apply the rule stated at the top of this page.

| RFC  | Class filed  | Class | Area filed | Area  |
| ---- | ------------ | ----- | ---------- | ----- |
| 0001 | architecture | ok    | tooling    | wrong |
| 0002 | architecture | ok    | tooling    | weak  |
| 0003 | architecture | ok    | tooling    | ok    |
| 0004 | architecture | ok    | tooling    | ok    |
| 0005 | product      | wrong | network    | ok    |
| 0006 | policy       | ok    | governance | wrong |
| 0007 | policy       | ok    | governance | wrong |
| 0008 | architecture | ok    | tooling    | weak  |
| 0009 | methodology  | ok    | tooling    | ok    |
| 0010 | governance   | weak  | governance | ok    |
| 0011 | architecture | ok    | tooling    | ok    |
| 0012 | product      | weak  | governance | wrong |
| 0013 | policy       | weak  | identity   | ok    |
| 0014 | product      | ok    | network    | ok    |
| 0015 | architecture | weak  | tooling    | weak  |
| 0016 | product      | ok    | network    | weak  |
| 0017 | product      | ok    | site       | ok    |
| 0018 | architecture | ok    | tooling    | ok    |
| 0019 | governance   | wrong | governance | wrong |
| 0020 | policy       | ok    | governance | wrong |
| 0021 | policy       | ok    | identity   | ok    |
| 0022 | policy       | ok    | network    | ok    |
| 0023 | product      | weak  | identity   | ok    |
| 0024 | architecture | ok    | network    | weak  |
| 0025 | architecture | ok    | network    | ok    |
| 0026 | architecture | ok    | network    | ok    |
| 0027 | product      | ok    | governance | wrong |
| 0028 | policy       | ok    | governance | wrong |
| 0029 | architecture | ok    | tooling    | weak  |
| 0030 | architecture | ok    | network    | ok    |
| 0031 | governance   | ok    | governance | ok    |
| 0032 | policy       | ok    | governance | wrong |
| 0033 | architecture | ok    | network    | ok    |
| 0034 | architecture | weak  | network    | weak  |
| 0035 | product      | ok    | network    | weak  |
| 0036 | governance   | wrong | identity   | ok    |
| 0037 | methodology  | ok    | tooling    | ok    |
| 0038 | policy       | ok    | governance | wrong |
| 0039 | product      | weak  | governance | wrong |
| 0040 | architecture | ok    | network    | weak  |
| 0041 | policy       | ok    | governance | wrong |
| 0042 | architecture | weak  | tooling    | weak  |
| 0043 | product      | ok    | tooling    | wrong |
| 0044 | methodology  | ok    | tooling    | ok    |
| 0045 | methodology  | wrong | site       | ok    |
| 0046 | product      | weak  | site       | ok    |
| 0047 | product      | weak  | site       | ok    |
| 0048 | product      | weak  | site       | ok    |
| 0049 | architecture | weak  | site       | ok    |
| 0050 | architecture | weak  | site       | ok    |
| 0051 | methodology  | weak  | site       | ok    |
| 0052 | architecture | weak  | site       | ok    |
| 0053 | product      | ok    | site       | ok    |
| 0054 | product      | ok    | identity   | weak  |
| 0055 | product      | weak  | governance | wrong |
| 0056 | policy       | ok    | identity   | ok    |
| 0057 | policy       | ok    | identity   | ok    |
| 0058 | product      | ok    | network    | ok    |
| 0059 | architecture | ok    | network    | ok    |
| 0060 | policy       | wrong | identity   | ok    |
| 0061 | product      | weak  | network    | ok    |
| 0062 | architecture | ok    | tooling    | ok    |
| 0063 | governance   | weak  | identity   | ok    |
| 0064 | product      | weak  | tooling    | wrong |
| 0065 | architecture | ok    | tooling    | weak  |
| 0066 | product      | weak  | governance | wrong |
| 0067 | policy       | ok    | tooling    | wrong |
| 0068 | policy       | ok    | site       | ok    |
| 0069 | product      | wrong | network    | ok    |
| 0070 | product      | weak  | network    | ok    |
| 0071 | governance   | ok    | governance | ok    |

### The six `Class` errors

- **RFC-0005 Network substrate** - filed `product`, is `architecture`. The Decision is one database
  per room, federation by reducer call, and an export that needs the room's cooperation. Nothing in
  it describes a capability a user has.
- **RFC-0019 Vocabulary and terminology** - filed `governance`, is `specification`. The record fixes
  what a word means. The authority it names belongs to a document, and no person is granted a
  decision by it.
- **RFC-0036 Naming, handles and namespace** - filed `governance`, is `specification`. A room-scoped
  label with a derived disambiguator is a naming rule; nobody is given authority over a name.
- **RFC-0045 The material, the tokens and the component contract** - filed `methodology`, is
  `contract`. Four artifacts that every other file reads is a contract, and no method is described.
- **RFC-0060 Attribution survives re-encryption** - filed `policy`, is `contract`. A canonical
  plaintext signature and a chain of copiers is what a verifier checks; nothing is permitted or
  refused.
- **RFC-0069 The read surface a developer may build against** - filed `product`, is `contract`. The
  record says it twice: "the export format is the stable contract" and "the CLI's `--json` output is
  a contract too".

### The seventeen `Area` errors

Each is filed under a value that is not its subject; the value named after the dash is the one the
proposal gives it.

- **RFC-0001 Storage and projection** - `tooling`, is data. The three layers are data and authority,
  not commands.
- **RFC-0006 Harvesting posture** - `governance`, is operation. A rule about what a scrape may do;
  nobody governs anything.
- **RFC-0007 Privacy, encryption and validation** - `governance`, is data. The boundary around a
  payload is not a governance question.
- **RFC-0012 Audience tiers and propagation** - `governance`, is data. The audience field is the
  enforcement input for visibility, and visibility is a property of a row.
- **RFC-0019 Vocabulary and terminology** - `governance`, is text. Definitions, not authority.
- **RFC-0020 Trust and security model** - `governance`, is identity. The threat table is forged
  authorship, impersonation and key theft.
- **RFC-0027 Product surface and curation economics** - `governance`, is economy. The subject is
  placement and price.
- **RFC-0028 Data lifecycle and retention** - `governance`, is data. Windows and tombstones over
  rows.
- **RFC-0032 Rate limiting and abuse resistance** - `governance`, is transport. Rate and quota are
  checks at the gateway, which is a transport boundary.
- **RFC-0038 Legal posture** - `governance`, is operation. The controller/processor split is an
  obligation on the host.
- **RFC-0039 Billing and metering** - `governance`, is economy. A bill is not a governance act, and
  no area value could hold it.
- **RFC-0041 Analytics without reading content** - `governance`, is operation. The countable set is
  a measurement of the running system.
- **RFC-0043 Local-first workspace** - `tooling`, is surface. The drawer, the canvas and the seam
  are the workspace page.
- **RFC-0055 DELO and the provider position** - `governance`, is economy. The record decides what
  the company may claim and what it sells.
- **RFC-0064 A list is a signed, versioned object** - `tooling`, is data. A list is a content object
  with an identity.
- **RFC-0066 What a person can see about their own data** - `governance`, is data. Four views over
  logs is observability of the member's own rows.
- **RFC-0067 Keep everything, compress, and name the cost** - `tooling`, is data. The store's codec,
  layout and growth.

### What the audit cannot settle

The `Class` axis has no written definition, so "wrong" above is judged against the reading the
corpus itself uses consistently: `architecture` for how parts fit, `policy` for what is permitted,
`governance` for who decides, `methodology` for how the work is done, `product` for everything else.
The last of those is the problem stated as a definition. Where a label is arguably right but not
forced - twenty-one records on `Class`, twelve on `Area` - the verdict is `weak`, and the weak cases
are listed in the table rather than argued individually.

RFC-0072 to RFC-0076 are not on the board and carry no `Area`, so they are outside the audit. Their
`Decision class:` is `methodology` in all five, and it is defensible in all five: each states how a
claim is verified, how a tool is kept, what the gate does not prove, where a number comes from, or
what a worker does when two cards collide.

---

## The proposed taxonomy

Three axes, each a closed vocabulary, no value on two axes, every value one word.

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
   that moves RFC-0001 from `tooling` to `data` and RFC-0043 from `tooling` to `surface`.
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

### What testing the candidate changed

The candidate was tested against all seventy-six records and three of its parts did not survive
unchanged.

- **Subject gained an eighth value, `text`.** The seven proposed values have no home for a record
  about the project's own words. RFC-0010 (documentation and template policy) and RFC-0019
  (vocabulary) would have been forced into `surface`, where they would be the only two records a
  reader cannot see rendered, or into `operation`, which is about running the system rather than
  writing it. Two records is a thin bucket, and it is a place a reader can look; without it those
  two are a place a reader cannot.
- **Horizon's definition was rewritten.** "Binds the current site" is not assignable from a Decision
  section: whether a decision binds today is a fact about the tree, not about the text, so two
  readers would disagree. What a Decision _presupposes_ is in the text - RFC-0005 says "a room is a
  database" and a room does not exist, so it is `next`; RFC-0001 names `Maintain/Storage/Shadow/`,
  which does, so it is `now`.
- **Kind's `policy` was widened from "what an operator may or must do" to any actor.** Ten of the
  twenty-three `policy` records bind a member or a room authority and name no operator: RFC-0013
  (the key never leaves the client), RFC-0021 (a harvester's own identity), RFC-0028 (a room's
  retention terms), RFC-0031 (three removal powers with three holders), RFC-0032 (the gateway's
  checks), RFC-0042 (a room loads no code), RFC-0051 (the token set), RFC-0056 and RFC-0057 (a
  member's keys and recovery), RFC-0067 (a member's archive). A definition naming only the operator
  would have been wrong for two fifths of the records it governs.

### Classifying a record you have not seen

RFC-0056, _Identity carried by others_, from its Decision section alone. Its first sentence is "A
person's identity is a key pair they hold", and its first rule is "Nobody else ever holds the
private key". A refusal that binds what a third party may not do is `policy`, not `contract` - the
record does define a credential shape, and the shape is not the point. The subject is keys,
attestations, guardianship and recovery, which is `identity`. And the Decision says "a third network
that trusts the issuer can accept it", so it presupposes a party outside this network: `later`. The
table above agrees: `policy` / `identity` / `later`.

### Why there is no fourth axis

Measured: the largest two-axis cell holds eight records (`architecture` + `data`, and `method` +
`operation`), the largest three-axis cell also holds eight (`method` + `operation` + `now`), and
twenty-two of the forty possible two-axis cells are occupied. A filter on two axes never returns
more than eight rows, which is a screenful rather than a list, so the axes are doing the narrowing
they exist for.

One ambiguity survives, and it is the axis a reader might reach for next. `policy` + `data` + `next`
returns RFC-0007, which binds the system and the host, and RFC-0028, which binds a room - two
different actors, no axis to tell them apart. That is the whole case for a fourth axis, and it is
not enough: both records name their actor in the Decision's first sentence, so the reader who has
already narrowed seventy-six records to two settles it by reading. An `actor` axis would buy nothing
that reading does not already give, and it would be a fourth axis this corpus does not need.

---

## Every record assigned

| RFC  | Kind          | Subject   | Horizon | What the Decision presupposes                                           |
| ---- | ------------- | --------- | ------- | ----------------------------------------------------------------------- |
| 0001 | architecture  | data      | now     | the three layers that exist today, and the authority among them         |
| 0002 | architecture  | data      | now     | `Maintain/Source/Model/`, `content.config.ts` and the module's tables   |
| 0003 | contract      | transport | now     | every command's transport argument, and the closed set `cdp` and `view` |
| 0004 | architecture  | operation | now     | the job tables, the scheduled reducer and the worker                    |
| 0005 | architecture  | network   | next    | a room, which does not exist yet                                        |
| 0006 | policy        | operation | now     | `store scrape` and every mutating command                               |
| 0007 | policy        | data      | next    | the module and the host, neither of which reads a payload yet           |
| 0008 | architecture  | data      | now     | a post's `media` reference and the fetch command                        |
| 0009 | method        | operation | now     | the workspace, turbo and both pipelines                                 |
| 0010 | policy        | text      | now     | every tracked file and `Documentation/`                                 |
| 0011 | architecture  | operation | now     | `Maintain/Source/Configuration/` and `config show`                      |
| 0012 | contract      | data      | next    | the envelope's audience field, which nothing writes yet                 |
| 0013 | policy        | identity  | next    | a client keystore and a room's key tables                               |
| 0014 | architecture  | network   | next    | a room's lifecycle rows and an invitation                               |
| 0015 | contract      | data      | next    | the five export files and the import adapter                            |
| 0016 | policy        | operation | next    | a host, which does not exist yet                                        |
| 0017 | architecture  | surface   | now     | `Source/pages/`, the service worker and the vote subsystem              |
| 0018 | architecture  | operation | now     | every command under `Maintain/Source/Command/`                          |
| 0019 | specification | text      | now     | every identifier, table and command name                                |
| 0020 | policy        | identity  | next    | a module that authorizes its own caller                                 |
| 0021 | policy        | identity  | next    | the observation log's `observer` column                                 |
| 0022 | policy        | network   | next    | a host's egress surface and cross-room calls                            |
| 0023 | contract      | identity  | next    | a delegation record and the client's custody screen                     |
| 0024 | contract      | transport | next    | `submit(action)`, the only reducer that would write                     |
| 0025 | architecture  | network   | next    | module publication and the room's version record                        |
| 0026 | architecture  | transport | next    | the transport seam's third value, `peer`                                |
| 0027 | policy        | economy   | now     | the curated index, the vote subsystem and the operator's powers         |
| 0028 | policy        | data      | next    | a room's retention terms and the tombstone                              |
| 0029 | architecture  | data      | next    | the client index and the module's envelope indexes                      |
| 0030 | architecture  | transport | next    | the offline queue and a queued write                                    |
| 0031 | policy        | network   | next    | a room's redaction, removal and appeal                                  |
| 0032 | policy        | transport | next    | the gateway's rate and quota checks                                     |
| 0033 | architecture  | network   | next    | a room's move between two hosts                                         |
| 0034 | contract      | transport | next    | `schemaVersion`, the protocol range and the artifact hash               |
| 0035 | architecture  | transport | next    | presence rows and the client's attention layer                          |
| 0036 | specification | identity  | next    | a display name and its disambiguator                                    |
| 0037 | method        | operation | now     | the pure layer's tests and the replay fixture                           |
| 0038 | policy        | operation | next    | a host that holds metadata for strangers                                |
| 0039 | policy        | economy   | next    | a meter, a bill and a cap                                               |
| 0040 | architecture  | data      | next    | `acceptedAt` on every row and the replay window                         |
| 0041 | policy        | operation | next    | the countable set and the published aggregate                           |
| 0042 | policy        | network   | next    | a module composed from reviewed libraries                               |
| 0043 | architecture  | surface   | now     | `/Workspace` and the drawer/canvas seam                                 |
| 0044 | method        | operation | now     | `engines.node`, `Compatibility.mjs` and `pnpm run check`                |
| 0045 | contract      | surface   | now     | `Source/Stylesheet/`, `Source/Component/` and the token check           |
| 0046 | specification | surface   | now     | the band beneath the canvas and its capability vocabulary               |
| 0047 | specification | surface   | now     | the lane band and its actor vocabulary                                  |
| 0048 | specification | surface   | now     | the footer, the rail's cluster and their state names                    |
| 0049 | specification | surface   | now     | the seven component states and every component                          |
| 0050 | specification | surface   | now     | the six data states on every surface that reads a collection            |
| 0051 | policy        | surface   | now     | `Global.css`, the token check and every component's props               |
| 0052 | specification | surface   | now     | the two materials and the four names they both provide                  |
| 0053 | architecture  | surface   | now     | every route that is not `/Workspace`                                    |
| 0054 | architecture  | surface   | now     | `/Workspace` before a session exists                                    |
| 0055 | policy        | economy   | now     | `Content/String/Brand/`, `Position.mjs` and the copy                    |
| 0056 | policy        | identity  | later   | an attestation issued by a third network                                |
| 0057 | policy        | identity  | next    | the recovery secret and the epoch wrap                                  |
| 0058 | contract      | network   | next    | a room's signed face document                                           |
| 0059 | architecture  | data      | next    | `postKey` and the row each room keeps                                   |
| 0060 | contract      | identity  | next    | the signature a verifier checks over plaintext                          |
| 0061 | policy        | network   | later   | a bridge to another network's protocol                                  |
| 0062 | architecture  | data      | next    | the adapter and the manifest's `fidelity` object                        |
| 0063 | specification | identity  | next    | a reputation statement's shape and its scope                            |
| 0064 | contract      | data      | next    | a list object and its line type in the export                           |
| 0065 | architecture  | data      | now     | the shadow store's file format and `store verify`                       |
| 0066 | contract      | data      | next    | a member's four views over the logs                                     |
| 0067 | policy        | data      | now     | the store's layout, codec and cost statement                            |
| 0068 | contract      | surface   | now     | the site shell and every emitted page                                   |
| 0069 | contract      | network   | next    | a room's views, the export and the CLI's `--json`                       |
| 0070 | architecture  | network   | next    | room creation and the module's initial rows                             |
| 0071 | policy        | network   | next    | library publication and the review record                               |
| 0072 | method        | operation | now     | every verifier under `Documentation/Skill/*/Reference/` and `Scripts/`  |
| 0073 | method        | operation | now     | `Documentation/Skill/**/Reference/` and its audit                       |
| 0074 | method        | operation | now     | `pnpm run check` and the six scripts it chains                          |
| 0075 | method        | operation | now     | design intake into `Documentation/Reference/`                           |
| 0076 | method        | operation | now     | every card worked on the shared board                                   |

### The bucket counts

| Kind          | Items |
| ------------- | ----- |
| architecture  | 23    |
| policy        | 23    |
| contract      | 13    |
| specification | 9     |
| method        | 8     |

| Subject   | Items |
| --------- | ----- |
| data      | 15    |
| operation | 15    |
| surface   | 13    |
| network   | 12    |
| identity  | 9     |
| transport | 7     |
| economy   | 3     |
| text      | 2     |

| Horizon | Items |
| ------- | ----- |
| next    | 39    |
| now     | 35    |
| later   | 2     |

No kind holds more than a third of the corpus, no subject more than a fifth, and the two thinnest
values - `economy` and `text` - are values a reader will look for and would not find if they were
merged away. `next` is the one value a reader should argue with, and the next section is the
argument.

---

## The horizon measurement, and the number it replaces

The card this report answers says sixty of seventy-six records name no implementing card. Measured
by matching `t_[0-9a-f]{8}` in each record's `Task dependencies` line, the number is **fifty-five**:
twenty-one records name a card id and fifty-five do not.

Horizon does not simply restate that. Crossed against it:

| Horizon | Records | With a card | Without |
| ------- | ------- | ----------- | ------- |
| now     | 35      | 14          | 21      |
| next    | 39      | 7           | 32      |
| later   | 2       | 0           | 2       |

The useful number is the top-right cell: **twenty-one records bind the tree that ships today and no
card claims them**. That is the backlog, and it is a different set from "fifty-five records have no
card", which reads as fifty-five failures and is not.

The `next` bucket is large and it is not a remainder. Each of the thirty-nine names a room, a key or
a host in its own Decision, and that presupposition is what a reader checks; the bucket is half the
corpus because the corpus was written for a network and the tree ships one static site. A horizon
axis over design written ahead of the build will always be skewed toward the second value, and that
skew is the measurement, not a fault in the axis. What the axis buys is the ordering: twenty-one
records are owed now, thirty-two are owed in sequence before a second host, and two are not owed at
all.

---

## The `Status` question

`Status` reads `Proposed` on all seventy-one published items and on all seventy-six files. The
README states its successor: `Proposed` "until the verification table passes against shipped code,
then `Implemented`", and a record "moves to `implemented/` only when its verification table passes
against the shipped code".

Three facts make that a defect rather than a slow start.

- **The successor is unreachable for most of the corpus.** Fifty-five records name no card, so no
  card can ever ship them, so `Implemented` can never be set. A field whose only transition cannot
  fire on three quarters of its rows is not a field.
- **It is already false for five records.** RFC-0072 to RFC-0076 describe practice that runs today.
  `package.json:15` chains `Check:Compatibility`, the tool layer's check, `Check:State`,
  `Check:Tokens`, `Check:Position` and `Test`, which is RFC-0074's claim, and the verifiers and the
  archive script RFC-0072 and RFC-0073 name are in the tree. Those five read `Proposed`, and that is
  wrong now.
- **It conflates two independent facts.** Whether a decision is accepted is a fact about the design.
  Whether code exists is a fact about delivery. One field cannot carry both, and the board needs
  both: a reader asks "is this settled?" and "is it built?" separately, and the second answer
  already has a home in `Cards` and in the folder a record lives in.

**Recommendation: `Status` becomes a lifecycle, and implementation leaves it.**

| Status       | Means                                                                        |
| ------------ | ---------------------------------------------------------------------------- |
| `Proposed`   | Written and open. It binds nothing, and a reader may argue with it.          |
| `Settled`    | Accepted. It binds future work whether or not any of it exists yet.          |
| `Superseded` | A later record replaces it. Both stay; `Superseded by:` names the successor. |

Four consequences follow, and each is deliberate.

- **The folder follows the status, not the code.** `proposed/` becomes `settled/` when a record is
  accepted. The README's `implemented/` folder does not exist yet, so the rename costs one word in
  the README rather than a migration of files.
- **`Settled` does not mean built, and `now` does not mean built either.** A record can be `Settled`
  and `now` with no card - that is the twenty-one-record debt above - and the two facts stay in two
  fields.
- **`Superseded` stays in `Status` although the header already carries `Superseded by:`.** A view
  needs one field to filter on; deriving the state would mean reading two header lines per row and
  joining them.
- **No `Implemented` value and no second boolean.** `Cards` already names the implementing card and
  a card has its own status, so a boolean would be a copy of a fact that can disagree with its
  source - the duplication RFC-0018 refuses for runs and RFC-0066 refuses for dashboards.

The cost is one honest admission: marking a record `Settled` is a claim that the design is accepted,
and the corpus has never made that claim about anything. Every one of the seventy-six would have to
be either settled or argued with, and the ones that cannot be settled are the ones worth knowing
about.

---

## Open questions

- Whether `later` earns its place at two records. It is kept because the distinction is the whole
  point of the axis - those two are the only records the board must not claim as owed - but a third
  value that appears twice is a value to revisit when the corpus doubles.
- Whether RFC-0034 (schema version, protocol version, artifact version, three owners) should be
  split into three records. It is the one record whose Decision genuinely spans three subjects, and
  it is assigned `transport` because the protocol is the boundary a client breaks on.
- Whether `text` should absorb the copy half of `surface`. RFC-0055 is filed `economy` because its
  Decision is a commercial position, but half of it is vocabulary, and a future record about copy
  alone would have to choose between the two.
- Whether a `Settled` record that no check enforces should be distinguishable from one that a check
  does enforce. Today both would read `Settled`, and the difference is exactly the one RFC-0072
  argues about.

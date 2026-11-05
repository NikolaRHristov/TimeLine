# Generation and Capability

The implementation input for the `bind` reducer and the coherence helper. Every column below is
quoted from the generated schema; nothing here invents a field.

The executable statement of the model is `Agentic/Crate/SpacetimeCatalog/` (rules, catalog and
tests), and the prose that says what it states is `Agentic/Documentation/Spacetime-Catalog.md`. This
file exists for one reason: those two describe a seven-column `generation`, while the module in this
repository declares a four-column one, and a worker implementing `bind` has to know which is in
front of it.

## 1. The two tables, as declared

Both are rendered from `Maintain/Source/Model/Schema/Entities.ts` into
`Maintain/Spacetime/spacetimedb/src/Schema.ts`, and both are `public: false`. The row types are
`GenerationRecord` and `CapabilityRecord` in `Maintain/Source/Model/Generated/Types.ts`.

`generation` - `table({ name: "generation", public: false }, {...})`, append-only, never updated:

- **`id`** - `t.string().primaryKey()`. The sequence number as a decimal string: `1`, `2`, ... Dense
  by construction, because `bind` computes a successor's id from its parent's.
- **`boundAt`** - `t.string()`. `T_ingest`: when the bind reducer accepted it, from the reducer
  context. Never a caller argument.
- **`manifestDigest`** - `t.string()`. The composition root's digest of the manifest it bound.
- **`policyChanged`** - `t.bool()`. Whether this generation's admission policy differs from its
  parent's.

That is the whole table. There is no `sequence`, `parent`, `capabilities`, `boundBy` or `latest`
column, and no index beyond the primary key.

`capability` - `table({ name: "capability", public: false }, {...})`, append-only, one row per
declared version:

- **`id`** - `t.string().primaryKey()`. `<name>@<version>` - the identifier a manifest names.
- **`name`** - `t.string().index()`. The stable capability name, without a version.
- **`version`** - `t.string()`. The version this declaration pins.
- **`stateClass`** - `t.string()`. The model narrows it to `stateless`, `holds-transport`,
  `holds-identity`, `holds-workspace`; the column is a plain string.
- **`contractDigest`** - `t.string()`. A digest of the port's contract, never of its code.
- **`declaredAt`** - `t.string()`. `T_ingest` at declaration, which is the module's `init`.

A column is added by editing `Entities.ts` and running
`pnpm --filter @timeline/maintain run Schema`. `Schema.ts` is rendered from that declaration, so a
hand edit is overwritten by the next run.

## 2. What a manifest digest is, and what it does not carry

A digest is the composition root's own name for the manifest it bound. It is opaque text to this
model: the crate states that recomputing one over an unspecified canonical form would be a second
convention to keep, so no reducer parses, derives or verifies it.

**The digest carries no mapping to capability rows.** A digest cannot name a capability, because it
is a name for the whole manifest rather than a document the module can read. The mapping is the
manifest's capability id list, and it is stored beside the digest - the crate's `generation` carries
a `capabilities` column holding that list sorted and deduplicated, as a JSON array.

The module's `generation` has no such column, so `bind` cannot recover the list from the row it is
about to write. It takes the ids as an argument - `t.array(t.string())`, or a JSON string the way
`observe` takes `lists` - and validates each one before it writes:

- one key lookup per id: `ctx.db.capability.id.find(id)`; absent is a refusal.
- the lookup is by the full `<name>@<version>` id. A manifest naming `browser-cdp` when the row is
  `browser-cdp@1` names an undeclared capability.
- the list is sorted and deduplicated first, and a list whose length changes under that treatment is
  refused rather than silently collapsed.
- `contractDigest` is not compared. `bind` requires that a named capability is declared; comparing a
  contract digest is a reader's question, and the crate does not ask it either.

Where the validated list goes is a decision the implementing card has to make: recording it in a
`trace` payload under kind `generation.bound` needs no schema change, while a `capabilities` column
is an `Entities.ts` edit plus a regeneration and belongs in its own card. Until one of them lands, a
generation row says what was bound and when, and not which capabilities it named.

## 3. Invariant 1 - Coherence

The statement: the generation the runtime reports is the one it was bound with, and a row cannot be
written under a generation that is not the latest bound one.

`Documentation/Reference/Spacetime-Model.md` does not state this invariant - it establishes only
that no reducer executes DDL. The statement is in the card that specified these tables and in
`Agentic/Documentation/Spacetime-Catalog.md` under "Coherence", and the second is the one to
implement against.

**Operationally, there is no pointer.** No column records the latest generation, and none may be
added: the table is append-only, and a pointer row would be a second authority that a mutable write
could disagree with. The latest generation is derived from the rows themselves.

`bind` writes dense decimal ids, so the latest is the highest decimal id present. `Catalog.ts`
implements that as `latestGeneration`, one pass over the table. A row counts only when its id is
canonical - `/^\d+$/`, at least `1`, and the text of its own value, so `01`, `007` and `0` are not
generations - and an unreadable row is skipped rather than thrown on, because one corrupt row must
not wedge every write in the module. Canonicality is what keeps the answer single-valued: `1` and
`01` name the same number, and accepting both would leave "latest" to iteration order.

The crate's `Latest` asks the successor question instead - `n` is latest when no row exists at
`n + 1` - which needs a density this table cannot prove and calls every row above a gap latest. The
two agree while the ids are dense; the highest-id form stays single-valued when they are not.

`bind` uses the same property to compute its successor: the first generation is `"1"`, refused when
a row at `"1"` already exists; a bind that names a predecessor requires that predecessor to be the
latest one and writes `String(parent + 1)`. Two binds naming the same parent are therefore a
compare-and-swap rather than a fork - the database serialises them and the second finds the first
one's successor.

The helper the other reducers call is one function, exported from `Catalog.ts`:

```
requireCoherentGeneration(ctx, generation?): string | null
latestGeneration(ctx): string | null
```

`requireCoherentGeneration` reads, compares and throws; it writes nothing, and it returns the latest
id so the caller stamps the row with the generation it actually wrote under. A supplied id that is
not the latest throws `stale-generation` naming both ids; a supplied id with nothing bound throws
`unbound-generation`. A call naming no generation returns the latest and is not refused: a reducer
is one transaction, so a write that names nothing is under the latest by construction, and only an
assertion can be stale.

It lives in `Catalog.ts` rather than `index.ts` because the entry file's named exports are reserved
for values SpacetimeDB registers - reducers, lifecycle hooks, views, procedures - and the runtime
refuses anything else at registration. `claim` and `renew` reach it through `writeGrant`;
`recordTrace` and `reveal` - the reducer the brief called `probe` - call it directly. No reducer
compares generation ids itself, and no second name for this check exists.

`reveal` takes the generation as a guard and keeps the helper's answer as a stamp: the caller's
string is the claim, checked before the private value is read, and the id the helper returns is what
the `probe` row carries. `probe` is therefore stamped like `trace` and unlike `lease` - the two
catalog rows whose generation is recorded rather than merely checked - and the two are stamped from
the same answer, so a receipt and the trace of the act it records cannot disagree about which
interpreter allowed it. A module with nothing bound writes no receipt at all: `reveal` refuses with
`unbound-generation`, the refusal `recordTrace` already makes, because a receipt that names a policy
cannot be written under none.

`belief` is the third position: it neither stamps a generation nor guards one, and that is a
decision rather than an omission. `lease` is guard-only because a grant's fact is its fence and its
holder - the generation is checked when the claim is made, and it is not part of what the grant
means. `belief` is guard-free for a stronger reason: a derivation admits nothing. `recomputeBelief`
opens `capability` to refuse an undeclared id and `probe` to read the receipts, computes a copy and
a ratio, and writes one row; no policy permits or refuses any part of that, so there is no
generation for the row to name.

The receipts are where that fact lives, and they are immutable. A belief folds one audience's
receipts for one capability: `value` is copied from the receipt `compareReceipts` puts first and
`confidence` is `n / (n + 1)` over all of them - so a single column could name only one receipt's
generation and would then be false about the rest. The generation the recompute itself ran under is
not the row's fact either: it is the latest bound generation at that instant by construction, which
makes it a fact about when the row was written rather than about what it says, and the
replace-on-recompute rule would overwrite it on the next pass anyway. A derivation history, if one
is ever wanted, belongs in `trace` - append-only, already carrying the generation, with
`belief.derived` already a declared kind - and adding it is its own decision, because a trace write
is a stamped write and would make the recompute refuse in a module with nothing bound.

That refusal is the answer a stamp would force, and it is not wanted. In a module with nothing
bound, `reveal` writes no receipt, so there is nothing to fold: the scope is empty, any stale row is
deleted and the reducer returns. A recompute in an unbound module therefore writes nothing without
refusing - the no-receipts outcome it already has, and one refusal fewer for a row that is
disposable anyway.

Because no column lands, there is no migration to state: `belief` keeps its six columns and a
database that already holds beliefs publishes the unchanged schema. Had the column landed, the price
would have been the one `probe` paid - SpacetimeDB 2.14 refuses any added column on an existing
table without a default annotation, optional or not, and a fabricated default is not available for a
fact this table does not have. `--delete-data` is free here, which is the one thing a derived table
can say that a receipt cannot: the rows are rebuildable. That the price would have been low is not a
reason to pay it.

## 4. No reducer executes DDL

SpacetimeDB compiles the schema into the published module: tables, columns and reducers are fixed at
publish time. A row in a table-definition table is data, not a table, and no reducer can create one.
So the catalog is data and the interpreter is fixed.

For `bind` that has one consequence and it is the whole of the design: **validate, never create.** A
missing capability is a refusal, not an insertion. A reducer that could declare a capability would
let a caller widen the set its own manifest is checked against, which is why the crate has no
`declare` and no `register` rule.

Capability rows arrive from `init`, seeded from the package manifests the repository already has - a
declaration is a deployment. A card that adds `bind` must not add a writer for `capability`, and a
manifest naming something absent is the signal that a deployment is missing, not that a write is
due.

## 5. Refusal style

`SenderError` from `spacetimedb/server` is the refusal: it carries a reason and aborts the
transaction, so no partial row survives. `Catalog.ts` throws it for a stale generation, a stale
fence, an unreadable deadline and a non-positive extension; `index.ts` throws it for an unheld
lease, an invalid claim and a trace collision.

The archive reducers keep the idempotent early return, which is right for a replay:

- `record` - `if (ctx.db.event.id.find(id) !== null) return;`
- `observe` - the observation is appended only when its content-derived id is absent.

Both are silent no-ops, which is right for a replay and wrong for a caller that sent an undeclared
capability: it would report success and change nothing. A `bind` that refuses must throw.

Match the crate's vocabulary in the message so the module and its manifest agree:
`admission-refused` for a malformed manifest or an ended authority, `lease-held` for a live or
quarantined lease, `budget-exhausted` for a second reveal at the same property version.

The rest of the house style the new reducers should follow: a doc comment stating the rule above
each reducer, content-derived ids, one write path per table, a `const row = {...}` built before
insert-or-update, and no wall clock - `ctx.timestamp`, rendered to the string the column takes.

## 6. Where the code and the brief disagree

1. `Spacetime-Model.md` states no invariant and defines no digest. It argues one thing - no reducer
   executes DDL - and the invariant and the digest definition come from elsewhere.
2. The crate's `generation` has seven columns (`id`, `sequence`, `parent`, `manifestDigest`,
   `capabilities`, `boundAt`, `boundBy`); this module's has four. The reduced form is what a `bind`
   here has to work with, and the two missing ones change how the rule is written: the sequence is
   read out of the id string, and the capability list is an argument.
3. `SenderError` is already the module's refusal type in both `index.ts` and `Catalog.ts`, so "match
   the existing error style" resolves to that one convention rather than to a new import.
4. `Agentic/Crate/SpacetimeCatalog/Test/Rules.rs` already holds twenty cases for these rules,
   including the four bind cases and the superseded-generation case. Restate them, do not invent new
   ones.
5. The card that specified these tables was blocked once on scope: the catalogue is being built in
   `Agentic`, and the module here is the consumer. Confirm which tree the `bind` card should land in
   before editing `index.ts`.

## 7. What a test has to cover

The module test harness is `createModuleTestHarness(schema, moduleExports)` from
`spacetimedb/server/test-utils` (spacetimedb 2.14.0, also exported as `.../vitest` and `.../wasm`),
with `TestClock` for the timestamps. The cases that matter:

- a bind naming an undeclared capability is refused and leaves `generation` unchanged.
- a bind with a declared list appends exactly one row, and `boundAt` is the harness clock.
- a second bind naming the first as its predecessor appends `"2"` and leaves `"1"` byte-identical.
- a bind naming a superseded predecessor is refused.
- `requireCoherentGeneration` throws for `"1"` once `"2"` exists and returns `"2"` for `"2"`.
- a write carrying a generation id that was never bound is refused.
- a reveal writes a receipt whose `generation` is the helper's answer - the same id whether the
  caller named the latest generation or named none.
- a reveal in a module with nothing bound writes no receipt and is refused `unbound-generation`.
- a `belief` row declares six columns and no `generation` among them.
- a recompute in a module with nothing bound writes no row and is not refused.
- receipts written under different generations fold into one belief that names none of them.
- a recompute writes no `trace` row: a derivation history is a separate decision, not a side effect.

The package carries no test tree, so these are the cases a test would have to cover rather than a
record of one that ran.

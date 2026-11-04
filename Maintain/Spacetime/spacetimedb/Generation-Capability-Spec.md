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
`pnpm --filter @nikolarhristov/timeline-maintain run Schema`. `Schema.ts` is compared byte for byte
by `Maintain/Source/Test/Schema.test.ts`, so hand-editing it fails the maintain check.

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
could disagree with. The latest generation is derived, and it is derived by one key lookup.

A generation `n` is the latest when no row exists at `n + 1`. The crate's `Latest` is the reference
implementation, and translated onto this table - which has no `sequence` column - it is four steps:

1. `ctx.db.generation.id.find(id)`; absent means it was never bound, so not latest.
2. read the sequence from the id itself, and fail closed on a non-canonical one: `Number(id)` must
   be a safe integer, at least `1`, and `String(n) === id`. A key of `01`, `1.0`, `-1` or ` 1` is
   treated as no generation rather than as one, which is what makes the density assumption fail
   closed.
3. `ctx.db.generation.id.find(String(n + 1))`; present means superseded, so not latest.
4. otherwise it is the latest.

`bind` uses the same property to compute its successor: the first generation is `"1"`, refused when
a row at `"1"` already exists; a bind that names a predecessor requires that predecessor to be
latest and writes `String(parent + 1)`. Two binds naming the same parent are therefore a
compare-and-swap rather than a fork - the database serialises them and the second finds the first
one's successor.

The helper the other reducers call is one function in this file, not a reducer:

```
function assertLatestBoundGeneration(ctx: Ctx, generationId: string): void
```

It reads, compares and throws; it writes nothing. Keep it unexported. SpacetimeDB reserves named
module exports for values it registers - reducers, lifecycle hooks, views, procedures - and a plain
helper is a module-level function that `claim`, `renew`, `probe` and `recordTrace` call directly
because they live in the same file. Exporting it would invite the bundler to read it as a runtime
export.

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

## 5. Refusal style: what exists in `index.ts`

There is no throwing helper in the module today.
`grep -rn "throw\|SenderError" Maintain/Spacetime/spacetimedb/src/` returns nothing, and `index.ts`
imports only `t` and the schema.

The only refusal pattern the file has is an idempotent early return:

- `record` - `if (ctx.db.event.id.find(id) !== null) return;`
- `observe` - the observation is appended only when its content-derived id is absent.

Both are silent no-ops, which is right for a replay and wrong for a caller that sent an undeclared
capability: it would report success and change nothing. The SDK idiom for a refusal that carries a
reason is `throw new SenderError("...")` from `spacetimedb/server`, which aborts the transaction so
no partial row survives. It is not imported yet; adding it is the first such import in this file:
`import { SenderError, t } from "spacetimedb/server";`.

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
3. `index.ts` has no error helper, so "match the existing error style" resolves to "there is none" -
   `SenderError` is a new import, not an existing convention.
4. `Agentic/Crate/SpacetimeCatalog/Test/Rules.rs` already holds twenty cases for these rules,
   including the four bind cases and the superseded-generation case. Restate them, do not invent new
   ones.
5. The card that specified these tables was blocked once on scope: the catalogue is being built in
   `Agentic`, and the module here is the consumer. Confirm which tree the `bind` card should land in
   before editing `index.ts`.

## 7. What a test has to prove

The module test harness is `createModuleTestHarness(schema, moduleExports)` from
`spacetimedb/server/test-utils` (spacetimedb 2.14.0, also exported as `.../vitest` and `.../wasm`),
with `TestClock` for the timestamps. The cases that matter:

- a bind naming an undeclared capability is refused and leaves `generation` unchanged.
- a bind with a declared list appends exactly one row, and `boundAt` is the harness clock.
- a second bind naming the first as its predecessor appends `"2"` and leaves `"1"` byte-identical.
- a bind naming a superseded predecessor is refused.
- `assertLatestBoundGeneration` throws for `"1"` once `"2"` exists and returns for `"2"`.
- a write carrying a generation id that was never bound is refused.

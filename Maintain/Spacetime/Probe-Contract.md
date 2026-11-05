# Probe Contract

What a reveal may write, and what it must never touch. This pins the parts of
`Documentation/Reference/Hidden-Properties.md` that two reducers have to agree on, so the
implementation is a transcription rather than an interpretation.

It is a design note, not a change. `Maintain/Spacetime/spacetimedb/src/index.ts` is untouched, and
`Schema.ts` is generated from `Maintain/Source/Model/Schema/Entities.ts` - never hand-edited.

**The two tables already exist.** `probe` and `belief` were declared with the other four catalog
tables and rendered into `Schema.ts`. The work is the reducers, not the columns.

**One table does not exist.** The private truth has no home: `property` is the single declaration
this contract needs and the epic does not have. Its shape is in "The private truth" below.

Everything here was exercised on a throwaway database against a local server - `spacetime build`,
`spacetime publish`, `spacetime call`, `spacetime sql`, `spacetime describe` - so the type names,
the index names and the refusal strings below are what the engine actually produced, not what the
SDK documentation promises.

---

## Three frames, one writer each

- **Private truth** - the property as it actually is. A private table; no subscriber reads it, no
  reducer returns it.
- **Receipt** - `probe`. One immutable row per reveal, scoped to the audience that was told and to
  the property version it was told at.
- **Belief** - `belief`. Derived from that audience's own receipts, replaceable, disposable.

The three are separate tables because each has exactly one writer. A second write path to one of
them is a second set of rules waiting to disagree with the first - the reason `index.ts` already
keeps a single reducer per table for the archive.

---

## The `probe` table

Declared private. Columns, as `spacetime describe … tables probe` reports them:

- **`id`** - `String`, primary key. `<capability>:<property>:<propertyVersion>:<audience>`. The key
  carries no time on purpose: a replay at a later `at` must find this row, not append a second one.
- **`capability`** - `String`, indexed (`probe_capability_idx_btree`). The capability's **id**
  (`<name>@<version>`), not its bare name - it pins the declaration the disclosure came from.
- **`property`** - `String`, indexed (`probe_property_idx_btree`). The property's name, without a
  version.
- **`propertyVersion`** - `U32`, not indexed. The property's own version, not the capability's. A
  version is part of the fact because seeing the current truth is a separate entitlement.
- **`audience`** - `String`, indexed (`probe_audience_idx_btree`). The authenticated identity, in
  hex. See "The audience" below.
- **`value`** - `String`. The disclosure: what the audience was told, as it would read it. Never the
  row the private value was read from.
- **`at`** - `String`. `T_event` - when the reading was taken, as the caller states it.
- **`ingestedAt`** - `String`. `T_ingest` - `ctx.timestamp.toISOString()`. The card that
  commissioned this note listed seven columns; the declared table has eight, and the eighth is the
  receipt for the caller's own clock claim. Its difference from `at` is the ingestion lag.

There is no `cost` column, no `price` column and no `grant` column. Nothing about who paid or why
they were allowed belongs on a receipt.

---

## The `belief` table

Declared private. Columns:

- **`id`** - `String`, primary key. `<audience>:<capability>`. One current belief per pair, which is
  what makes it replaceable.
- **`audience`** - `String`, indexed (`belief_audience_idx_btree`). The only actor the belief is
  about.
- **`capability`** - `String`, indexed (`belief_capability_idx_btree`).
- **`value`** - `String`. The audience's own reading of its receipts - already disclosure-safe,
  because it is copied from a `probe.value` and never from the private table.
- **`confidence`** - `F32`, 0 to 1.
- **`at`** - `String`. `T_ingest`: an inference has no `T_event`, because nothing happened in the
  world - a row was computed.

Two single-column indexes, not a composite one. The recompute scope is one audience at a time, so
`ctx.db.belief.audience.filter(audience)` is an exact single-column scan and a composite index would
buy nothing.

---

## The audience

**`audience` is a string holding the identity, not a role, and not an enum.**

- **It is `ctx.sender.toHexString()`.** Not a handle, not a role name, not a caller's argument.
- **Not a role, because a receipt states who was told.** `probe.id` is keyed on the audience, so a
  role-keyed receipt would collapse every sender sharing that role onto one row: the second sender
  would either be refused having paid nothing, or be handed a value disclosed to someone else. Both
  are the same defect - a role is a permission, and a permission is not a recipient.
- **Not an enum, because the column is an identity.** `t.enum` builds a sum type over payloads; an
  identity is a 64-character string and the key format is string composition. The role set itself is
  a closed set of two names in code, never a column.

The role is computed per call and never stored: `none`, or `prober`. It decides one thing - whether
a disclosure may be computed - and it is not written to `probe`, `belief` or anywhere else.

**A caller-supplied audience must be absent from the signature, not ignored.** An argument is a
claim; `ctx.sender` is the only authenticated fact. A reducer that accepted an `audience` argument
would let any caller write a receipt in another identity's name - and that identity would then read
the injected disclosure through the view, i.e. a stranger could write into someone's belief. An
ignored argument is worse than absent: it still travels in every client's call and reads like a
supported feature.

---

## The entitlement check

There is no identity-to-role table, and none is needed. The module's one identity-to-standing map is
**`lease`**: `holder` is the sender string, `resource` is what is held, `fence` is how strongly, and
`expiresAt` is until when. A reveal is a read, so the standing it requires is a live lease - the
same map the fenced-write path uses. A second authorization table beside `lease` would be a second
answer to "may this sender act", and the two would drift.

Liveness is a comparison against the reducer's clock, never a stored state:

- `state === "held"`, and
- `expiresAt > ctx.timestamp.toISOString()`.

Both sides of that comparison must be produced by `Timestamp.toISOString()`. A stamp built from a
`Date` drops the microsecond field, and `"…:00Z"` sorts **after** `"…:00.500000Z"` - so a
`Date`-derived deadline would read as later than a `Timestamp` one within the same second.

The capability-to-resource binding is declared, not supplied: a probe names a capability and a
property, and the property row says which resource a reveal of it requires. A caller that named its
own resource could present a lease on anything it holds and read a property it was never granted.

**The check lives in an unexported helper in `index.ts`**, called before any private value is
computed. It reads three things and nothing else:

- the `capability` row, by primary key - the declaration must exist;
- the `property` row, by primary key - the binding columns (`resource`, `version`) only;
- `lease` rows filtered by `resource`, keeping those whose `holder` equals the audience and that are
  live.

It never reads `probe.value`, `property.value`, `property.evidence`, or any other table. Reading a
row to learn which resource it needs is not reading the secret: the `value` and `evidence` columns
are read only after the check passes, and only into the disclosure function.

---

## The charge

**The receipt is the charge.** One reveal, one unit, and the unit is the row.

- **No meter table.** A counter row beside the receipt would be a second write that can disagree
  with the first, and it would need its own key to stay idempotent - a key that already exists as
  `probe.id`. The doc's own rule is one click per reveal, so the price is one and there is nothing
  to store it in.
- **The insert is the charge.** There is no separate "charge" step to forget: a transaction that
  writes the receipt has charged, and one that does not has not.
- **Atomicity is the reducer, not a discipline.** SpacetimeDB runs a reducer as one transaction. The
  insert is the only write on the success path, so there is nothing to partially commit, and any
  throw rolls back the whole call. "Pay and reveal is all-or-nothing" is therefore structural.
- **Two racing probes cannot both spend it.** The primary key serialises them: one insert wins, the
  other's transaction aborts. The pre-insert `find` is what turns that abort into a clean
  `budget-exhausted` message; the key, not the check, is the guarantee.
- **A new property version is a new reveal and a new charge.** The version is in the key, so
  "continuing to see the current truth" is exactly what the doc says it is - a separate entitlement,
  priced separately.

---

## The private truth

`property` is the one table this contract needs that is not declared. It belongs in
`Maintain/Source/Model/Schema/Entities.ts` with the other catalog tables, and reaches `Schema.ts` by
regeneration - never by editing the generated file.

- **`id`** - `String`, primary key. `<capability>:<property>`, where `<capability>` is the
  capability id.
- **`capability`** - `String`, indexed.
- **`name`** - `String`.
- **`version`** - `U32`. The property's own monotone version; `probe.propertyVersion` pins one of
  these. A capability version bump re-declares its properties from version 1, and the old receipts
  keep naming the old rows, so a receipt is never ambiguous.
- **`resource`** - `String`, indexed. The lease resource a reveal of this property requires. This is
  the entitlement binding.
- **`value`** - `String`. The private truth.
- **`evidence`** - `String`. Why the value is believed. Never disclosed - it exists so that "compute
  only the permitted disclosure" has something it must not disclose.
- **`updatedAt`** - `String`.

Private, like the other catalog tables: no subscriber reads it, no reducer returns it, and no view
projects it.

---

## The reducers

**The reducer cannot be called `probe`.** The table already owns that name: publishing a module with
both failed with `name 'Probe' is used for multiple types`, because the argument object of a reducer
named `probe` is itself a type named `Probe`. The reducer is **`reveal`** - the doc's own word for
the act ("a reveal is a reducer, not a view").

Reducer export names are camelCase in TypeScript and snake_case on the wire: an export named
`recomputeBelief` is called as `recompute_belief`. A single-word export needs no conversion.

`reveal(capability, property, propertyVersion, at)`, in this order and no other:

1. **Reject a malformed request** - empty capability, empty property, or `propertyVersion < 1`.
2. **Resolve the audience** - `ctx.sender.toHexString()`. Never from an argument.
3. **Require the declaration** - the `capability` row exists.
4. **Load the property row** - `<capability>:<property>` exists and its `version` equals
   `propertyVersion`.
5. **Check the standing** - a live lease on `property.resource` held by the audience. Refuse here.
6. **Check the receipt** - `<capability>:<property>:<propertyVersion>:<audience>` does not exist.
   Refuse here. This is before the private value is computed, so a replay touches nothing private.
7. **Compute the disclosure** - from `property.value`, plus the property's name and version. Not
   `evidence`.
8. **Insert** - one `probe` row, keyed as above, `at` from the argument, `ingestedAt` from
   `ctx.timestamp.toISOString()`.

Steps 5 and 6 are both refusals and neither writes. Steps 7 and 8 are the only part that must be
atomic with each other, and they are one transaction.

**The read path is a view, not a return value.** A reducer returns nothing, and `probe` is private,
so the caller learns what it was told through a per-sender view over its own rows - `my_probe`,
declared public, returning a `t.object("ProbeDisclosure", …)` array filtered by
`ctx.db.probe.audience.filter(ctx.sender.toHexString())`. The view is what makes "no reducer returns
a private value" checkable: there is no return value to inspect.

`recomputeBelief(capability)` derives the caller's own belief and takes no audience argument, for
the same reason `reveal` takes none. It reads only `probe` rows for `ctx.sender.toHexString()`,
deletes the single `belief` row for `<audience>:<capability>`, and inserts the derived one - `value`
from the highest `propertyVersion` among those receipts, `confidence` = `n / (n + 1)` for `n`
receipts, `at` from `ctx.timestamp.toISOString()`. One row in scope, so delete-and-rebuild cannot
expose a half-rebuilt set, and a replay on unchanged receipts rewrites identical bytes.

`reveal` does not touch `belief`. Two writers for one derived row is the drift the single-writer
rule exists to prevent; freshness is the recompute's job.

---

## What lands in `index.ts`

The whole surface, so nothing is left to be invented:

- **Imports** - `SenderError`, `type InferSchema`, `type ReducerCtx` from `spacetimedb/server`;
  `Timestamp` from `spacetimedb` (only for the `Live` signature).
- **`type Ctx`** - `ReducerCtx<InferSchema<typeof spacetimedb>>`. Helpers take this, never `any`: an
  `any` context erases the row types and makes a `bigint` fence infer as `number`.
- **`AudienceOf(ctx): string`** - `ctx.sender.toHexString()`.
- **`Live(row, now): boolean`** - `state === "held"` and `expiresAt` later than `now`.
- **`StandingOf(ctx, audience, resource): bigint | null`** - the highest fence among the live leases
  on `resource` held by `audience`, or `null`.
- **`Disclose(row): string`** - the permitted projection of a property row: name, version, value.
- **`export const reveal = spacetimedb.reducer({ capability, property, propertyVersion, at }, …)`**
- **`const ProbeDisclosure = t.object("ProbeDisclosure", { … })`** - the view's row type. It must
  not be named after the view's own accessor.
- **`export const myProbe = spacetimedb.view({ name: "my_probe", public: true }, …)`**
- **`export const recomputeBelief = spacetimedb.reducer({ capability }, …)`** - wire name
  `recompute_belief`.

Tables read: `capability` by primary key, `property` by primary key, `lease` by its `resource`
index. Tables written: `probe` (one insert), `belief` (find, delete, insert). Nothing else in the
module is opened.

---

## What the archive keeps

**The `observation` table is not reused and not modified.** It keeps its own meaning - one channel
showing one post - its own key `<postId>:<source>:<at>:<action>`, its own five columns (`at`,
`source`, `postId`, `action`, `id`), and its own single writer, `observe`.
`Maintain/Source/Test/Schema.test.ts` already asserts both column sets and the full table order, so
a `probe` column appearing in `observation`, or a rename in either direction, fails the gate rather
than passing silently.

`reveal` reads no archive table. It does not read `observation`, `post`, `author`, `media`, `event`
or `membership`, and it writes none of them. The archive and the catalog meet at exactly one place -
the generated `Schema.ts` - and nowhere else.

`trace` is not written by this contract either. The kind `probe.recorded` is declared and a future
card may record one; if it does, it is a second insert in the same transaction and its payload names
ids only, never a `value`.

---

## Failure semantics

A closed set, and every one of them writes nothing and charges nothing:

- **`admission-refused`** - no capability declaration, no property row at that version, or no live
  lease held by the audience on the property's resource. Thrown as a `SenderError`; the caller sees
  `Error: Response text: admission-refused` (HTTP 530) and `probe` is unchanged.
- **`budget-exhausted`** - a receipt already exists for this capability, property, version and
  audience. The allowance is spent; the caller reads what it was told from `my_probe`.
- **A primary-key abort** - two probes raced; the loser's transaction rolls back. No partial row, no
  partial charge.
- **Every other throw** - the whole reducer rolls back. There is no state in which a receipt exists
  and the charge does not, because they are the same insert.

No refusal varies with the private value. Each is decided from a declaration, a lease and the
existence of a receipt, so two worlds differing only in a protected property produce the same
transcript for an actor that is not entitled - the non-leakage target in the doc, as a property of
the code rather than a hope about it.

---

## Claim → test

Exercised on a local server (`spacetime start --listen-addr 127.0.0.1:3010`) against a throwaway
database, with declarations inserted by `spacetime sql` - which does write private tables - and
against the module test harness (`node --import ./Test/Support/Register.mjs --test Test/*.test.ts`
in `Maintain/Spacetime/spacetimedb`), which runs the real reducer in a real transaction over an
in-memory datastore with a controllable clock.

| Claim                                             | Test                                                                                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The module compiles                               | `spacetime build` in `Maintain/Spacetime/spacetimedb` → `Build finished successfully.`                                                                                                                 |
| A table and a reducer cannot share a name         | name the reducer `probe` and publish → `name 'Probe' is used for multiple types`                                                                                                                       |
| The receipt's columns and indexes are as declared | `spacetime describe <db> tables probe` → 8 columns, four `_idx_btree` indexes                                                                                                                          |
| An unentitled sender is refused, writes nothing   | `spacetime call <db> reveal '"demo@1"' '"latency"' 1 '"…"'` → `admission-refused`; `select count(*) from probe` → `0`                                                                                  |
| An entitled sender writes exactly one row         | insert a live `lease` for the caller, call again; `select * from probe` → 1 row, `value` = the disclosure                                                                                              |
| The audience cannot be spoofed                    | the same call with `--anonymous` → `admission-refused`, and the anonymous `my_probe` view returns `0` rows                                                                                             |
| A replay charges nothing                          | call again at a later `at` → `budget-exhausted`; `select count(*) from probe` → still `1`                                                                                                              |
| Raw evidence never crosses                        | put a canary in `property.evidence`; grep every `probe`, `belief` and `my_probe` row → no match                                                                                                        |
| Belief is derived and replaceable                 | `spacetime call <db> recompute_belief '"demo@1"'` twice → one row, `confidence` `0.5` for one receipt                                                                                                  |
| A replay on unchanged receipts rewrites nothing   | `Test/Belief.test.ts` → "criterion 5a: two back-to-back passes over three scopes leave a byte-identical dump"                                                                                          |
| A failure partway through leaves beliefs intact   | `Test/Belief.test.ts` → "criterion 5b: a throw after the first belief write leaves every prior row intact" and "criterion 5c: a throw between the delete and the insert leaves every prior row intact" |
| The archive is untouched                          | `namesFor(entity("observation"), "module")` in `Maintain/Source/Test/Schema.test.ts` → `["at","source","postId","action","id"]`                                                                        |
| One entitled reveal writes exactly one row        | `Test/Reveal.test.ts` → "an entitled sender writes exactly one probe row, scoped to its server-resolved audience"                                                                                      |
| A failure after the read charges nothing          | `Test/Reveal.test.ts` → "a failure after the private read and before the insert leaves no receipt and no charge"                                                                                       |
| An unentitled reveal charges nothing              | `Test/Reveal.test.ts` → "an unentitled sender is refused, writes no probe row and deducts no charge"                                                                                                   |

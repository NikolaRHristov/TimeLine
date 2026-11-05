# Bind Contract

The implementation input for the `bind` reducer. `Generation-Capability-Spec.md` states what the
`generation` and `capability` tables are; this states what the reducer must do, in the order it must
do it, and names the file and symbol behind every claim.

The code in §1 is not a sketch: it was applied to a copy of the package and passed the type check,
the module build and the cases in §6 (§7).

---

## 1. The reducer

Exported from `Maintain/Spacetime/spacetimedb/src/index.ts`:

```ts
export const bind = spacetimedb.reducer(
	{
		previous: t.string().optional(),
		manifestDigest: t.string(),
		capabilities: t.array(t.string()),
		policyChanged: t.bool(),
	},
	(ctx, args) => {
		if (args.manifestDigest.length === 0) {
			throw new SenderError("admission-refused: a bind needs a manifest digest");
		}

		const named = [...args.capabilities].sort();
		const declared = [...new Set(named)];

		if (declared.length !== named.length) {
			throw new SenderError(
				"admission-refused: the manifest names a capability more than once",
			);
		}

		for (const id of declared) {
			if (ctx.db.capability.id.find(id) === null) {
				throw new SenderError(
					`admission-refused: the manifest names ${id}, which is not a declared capability`,
				);
			}
		}

		let parent: string | null = null;

		if (args.previous !== undefined && args.previous !== null) {
			parent = requireCoherentGeneration(ctx, args.previous);
		} else {
			parent = latestGeneration(ctx);

			if (parent !== null) {
				throw new SenderError(
					`admission-refused: generation ${parent} is already bound, so a bind naming no predecessor cannot open a second history`,
				);
			}
		}

		const id = parent === null ? "1" : String(BigInt(parent) + 1n);

		if (ctx.db.generation.id.find(id) !== null) {
			throw new SenderError(`admission-refused: generation ${id} is already bound`);
		}

		ctx.db.generation.insert({
			id,
			boundAt: nowOf(ctx),
			manifestDigest: args.manifestDigest,
			policyChanged: args.policyChanged,
		});

		requireCoherentGeneration(ctx, id);
	},
);
```

- **Name** - `bind`, built with `spacetimedb.reducer(...)` like every other reducer in the file
  (`observe` at `src/index.ts:67`, `claim` at `src/index.ts:427`). The export name is the reducer
  name the host exposes.
- **Placement** - in the catalog section that begins at `src/index.ts:229`, ahead of `traceContent`
  (`src/index.ts:253`): `bind` is the reducer that creates a generation, and every other catalog
  reducer stamps one.
- **`previous`** - optional, the same builder the file already uses for an absent instant or an
  unnamed generation (`src/index.ts:75`, `src/index.ts:332`). Absent means "open the history".
- **`capabilities`** - `t.array(t.string())`, not a JSON string. The SDK takes arrays for structured
  arguments (`node_modules/spacetimedb/dist/lib/type_builders.d.ts:1101`); a JSON string would be a
  second encoding of a list the module can already carry.
- **Imports** - `src/index.ts:3-17` already imports `requireCoherentGeneration`; add
  `latestGeneration` to that list. Both come from `./Catalog` with no extension, because the module
  bundler resolves that way (`src/index.ts:18-21`). `SenderError` is already imported at
  `src/index.ts:2`.
- **Clock** - `nowOf(ctx)` (`src/Catalog.ts:64`), the module's one stamp format, not
  `ctx.timestamp.toISOString()` spelled a second time.

The order is the whole of the design:

1. Refuse an empty `manifestDigest`.
2. Sort and deduplicate `capabilities`; refuse when the length changed.
3. Look every id up in `ctx.db.capability`; refuse on the first absence, naming it.
4. Resolve the predecessor, and with it the invariant (§3).
5. Compute the id; refuse a collision.
6. Insert exactly one `generation` row.
7. Re-assert coherence against the row just written.

Nothing is written before step 6, so a refusal at 1-5 leaves `generation` untouched. A `SenderError`
aborts the transaction, so a refusal at 7 rolls the insert back as well: no path leaves a row that
another reducer would refuse to stamp.

---

## 2. The digest, and the capability list

- **The digest is opaque.** It is the composition root's own name for the manifest it bound. The
  module never parses, recomputes, normalises or compares it (`Generation-Capability-Spec.md` §2;
  `Agentic/Crate/SpacetimeCatalog/Source/Struct/Bind.rs` documents `Digest` as opaque for the same
  reason: a canonical form would be a second convention to keep).
- **It carries no mapping to capability rows.** A digest names a manifest, not its parts, so
  `capabilities` is an argument. A reducer that "resolved which capabilities the digest names" would
  be inventing a format for a value the caller defined; there is no such resolver in this module and
  none may be added.
- **Format** - any non-empty string. The reference fixtures use `sha256:<name>`
  (`Agentic/Crate/SpacetimeCatalog/Test/Rules.rs:137`), and nothing in this module depends on that
  shape. Only emptiness is refused.
- **The lookup key is the full id, `<name>@<version>`** (`src/Schema.ts:139-144`). A manifest naming
  `browser-cdp` when the row is `browser-cdp@1` names an undeclared capability; the bare name is not
  a key.
- **`contractDigest` is not compared** (`src/Schema.ts:147-148`). `bind` requires that a named
  capability is declared, which is a lookup; comparing a port's contract digest is a reader's
  question (`Generation-Capability-Spec.md` §2).
- **Duplicates are refused, not collapsed.** Sorting and deduplicating first and refusing when the
  length changed is the reference rule (`Agentic/Crate/SpacetimeCatalog/Source/Fn/Bind.rs:30-36`): a
  manifest that names one capability twice is not a manifest this module can read, and silently
  collapsing it would hide that.
- **The validated list is not stored.** `generation` has four columns and no `capabilities`
  (`src/Schema.ts:155-167`). Writing a `trace` row under kind `generation.bound` is the option that
  needs no schema change, and it is deliberately not taken: this reducer's contract is one insert,
  and a second write would make "appends exactly one row" untrue. A `capabilities` column is an
  `Maintain/Source/Model/Schema/Entities.ts` edit plus a regeneration, and belongs in its own
  change.

---

## 3. The coherence helper

Two exports, both from `Maintain/Spacetime/spacetimedb/src/Catalog.ts`:

```ts
export function latestGeneration(ctx: Context): string | null;
export function requireCoherentGeneration(ctx: Context, generation?: string | null): string | null;
```

- **Declarations** - `src/Catalog.ts:280` and `src/Catalog.ts:325`.
- **Return** - the latest bound generation id, or `null` when nothing is bound.
- **Throws** - `stale-generation: the write names generation X, the latest bound generation is Y`
  (`src/Catalog.ts:336-340`), and
  `unbound-generation: nothing has been bound, so X cannot be the latest generation`
  (`src/Catalog.ts:330-334`).
- **Read-only** - `latestGeneration` only iterates `generation` (`src/Catalog.ts:284-295`); the
  check performs no insert, update, delete or DDL.
- **Not in `index.ts`** - the entry file's named exports are reserved for values SpacetimeDB
  registers, and the runtime refuses anything else at registration (`src/Catalog.ts:303-309`).
  Import it; never re-implement the comparison.

`bind` calls it twice, for two different questions:

- **Before the insert, on the predecessor.** A named predecessor must be the latest bound
  generation, or the bind is a fork of a history that has already moved on. That call is what makes
  two binds naming the same predecessor a compare-and-swap rather than a fork: the database
  serialises them and the second finds the first one's successor (`Generation-Capability-Spec.md`
  §3; `Source/Fn/Bind.rs:42-66`).
- **After the insert, on the id just written.** `requireCoherentGeneration(ctx, id)` must answer
  `id`. It cannot fail in a correct reducer, and it is kept because it asserts the row this reducer
  appended is the generation every other reducer will now accept; a throw here rolls the insert back
  instead of leaving a row nothing else would stamp.

**Naming no predecessor is not "under the latest" here.** The helper reads an absent generation as
"under the latest by construction" (`src/Catalog.ts:311-315`), which is right for a write that
stamps a row and wrong for the one reducer that moves the pointer. A bind with no predecessor opens
the history, so it is refused whenever `latestGeneration(ctx)` is not `null`. That refusal is
`bind`'s own, and its message says what it is.

---

## 4. The latest-generation pointer

- **There is no pointer.** No column records it, and none may be added: `generation` is append-only,
  and a pointer row would be a second authority a mutable write could disagree with
  (`Generation-Capability-Spec.md` §3).
- **It is derived** by `latestGeneration` (`src/Catalog.ts:280-298`): one pass over the table,
  answering with the highest id whose text is its own canonical decimal value and at least `1`. A
  row whose id is `01`, `007`, `0` or `gen-2` is skipped rather than treated as a generation
  (`src/Catalog.ts:285-289`), so the answer stays single-valued when the ids are not dense.
- **How other code reads it** - `claim` and `renew` reach it through `writeGrant`'s guard
  (`src/Catalog.ts:377-407`); `recordTrace` calls it directly (`src/index.ts:342`).
- **`bind` moves it by appending.** The successor id is `String(BigInt(parent) + 1n)` and the first
  is `"1"`, which is what makes the ids dense by construction (`src/Schema.ts:158`).
- **The successor question is not used.** The reference `Latest` asks whether a successor row exists
  (`Agentic/Crate/SpacetimeCatalog/Source/Fn/Latest.rs:20-35`); this module asks for the highest id,
  and the two agree while the ids are dense. `bind` must not grow a second definition of "latest".

---

## 5. Four statements in the surrounding briefs that cannot be implemented

Each is a fact about the code above, and each changes what the implementing change does.

- **"Parse the digest and resolve which capabilities it names."** Not possible - §2. The list is an
  argument, and the digest is only checked for emptiness.
- **"Generate `id` with whatever id convention the schema uses (auto-increment, `ctx.newId`)."**
  There is no auto-increment: `id` is `t.string().primaryKey()` with no `.autoInc()`
  (`src/Schema.ts:159`), and the id is computed from the predecessor (`src/Schema.ts:158`).
- **"Compute `policyChanged` by comparing against the previous generation."** There is nothing to
  compare against: the table carries no policy column, and
  `Maintain/Source/Model/Schema/Entities.ts:599-601` states that the column is carried rather than
  derived by diffing two manifests, because "the successor is the only place that knows whether the
  admission policy moved". It is an argument (`policyChanged: t.bool()`) and the reducer stores it
  verbatim.
- **"Refuse with a silent early return."** The archive reducers return early on a replay
  (`src/index.ts:150`, `src/index.ts:172`), which is right for a replay and wrong here: a caller
  that sent an undeclared capability would be told it succeeded. Every refusal in `bind` is a
  `throw`, and the prefix is `admission-refused`, the vocabulary the reference rules use
  (`Generation-Capability-Spec.md` §5).

One gap decides whether any bind can succeed at all:

- **`capability` has no writer.** `src/index.ts` contains no insert, update or delete against
  `capability`, and `init` seeds nothing (`src/index.ts:49-51`). On a fresh database every bind is
  refused at step 3 of §1. Tests must seed capability rows through the harness (§6); a production
  seed in `init` is a separate change. `bind` must never create a capability, because a reducer that
  could declare one would let a caller widen the set its own manifest is checked against
  (`Generation-Capability-Spec.md` §4).

---

## 6. What a test has to prove

Harness: `createModuleTestHarness(schema, moduleExports)` and `TestAuth.internal()` from
`spacetimedb/server/test-utils`, `Timestamp` from `spacetimedb` (`Test/Lease.test.ts:20-22`,
`Test/Lease.test.ts:57`, `Test/Lease.test.ts:61`).

- **Call a reducer the way the host does** -
  `harness.withReducerTx(Caller, (ctx) => Catalog.bind(ctx, args))` (`Test/Lease.test.ts:72-74`).
- **Seed capability rows the same way** - through a reducer transaction, exactly as
  `Test/Coherence.test.ts:44-59` seeds `generation` rows.
- **Move time only with `harness.clock.set(new Timestamp(...))`**, and assert `boundAt` against it
  (`Test/Lease.test.ts:66-69`).
- **Read rows outside the transaction** - `[...harness.db.generation.iter()]`; the harness's backend
  traps a read taken inside one (`Test/Lease.test.ts:84-89`).
- **Assert refusals unanchored** - `assert.throws` matches `String(error)`, which begins with
  `SenderError: `, so a pattern anchored at `^stale-generation` never matches
  (`Test/Coherence.test.ts:98-101`).

Cases, restated from `Agentic/Crate/SpacetimeCatalog/Test/Rules.rs`:

- A first bind appends `"1"` at the module's clock: one row, the digest recorded, `policyChanged` as
  sent (`Rules.rs:129-155`).
- A manifest naming an undeclared capability is refused, the message names the capability, and
  `generation` is deep-equal before and after (`Rules.rs:158-176`).
- A successor appends `"2"` and leaves `"1"` byte-identical (`Rules.rs:179-222`).
- A superseded predecessor and a never-bound one are both refused, with nothing written
  (`Rules.rs:225-258`).
- After a bind, `latestGeneration` answers the new id.
- Two binds naming one predecessor: the second is refused, so the pair is a compare-and-swap.
- An empty digest, a duplicated capability and a bare capability name are each refused.

---

## 7. How this note was verified

- The reducer in §1 was applied to a copy of the package outside the tree (`.hermes/tmp/bind-probe`,
  gitignored) and the cases above were run there as `Test/Bind.test.ts`.
- `tsc --noEmit -p tsconfig.json` - exit 0.
- `node --import ./Test/Support/Register.mjs --test Test/*.test.ts` - 57 pass, 0 fail (49 existing
  cases plus 8 bind cases).
- `spacetime build --module-path .` - `Build finished successfully`, which is the gate that proves
  `bind` registers as a reducer rather than as an ordinary export.
- The probe is not part of the module: the real `src/index.ts` is unchanged, and the change that
  implements `bind` owns that edit.

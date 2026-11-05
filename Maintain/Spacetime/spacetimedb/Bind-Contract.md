# Bind Contract

The implementation input for the `bind` reducer. `Generation-Capability-Spec.md` states what the
`generation` and `capability` tables are; this states what the reducer must do, in the order it must
do it, and names the file and symbol behind every claim.

The code in §1 is not a sketch: it was applied to a copy of the package and passed the type check,
the module build and the cases in §6 (§7).

---

## 1. The reducer

Exported from `Maintain/Spacetime/spacetimedb/src/index.ts`; the one write it performs goes through
`appendGeneration` in `src/Catalog.ts`.

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

		// Sorting before deduplicating makes the refusal independent of the
		// order the caller happened to list the ids in.
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

		const opens = args.previous === undefined || args.previous === null;

		const parent = requireCoherentGeneration(ctx, opens ? null : args.previous);

		if (opens && parent !== null) {
			throw new SenderError(
				`admission-refused: generation ${parent} is already bound, so a bind naming no predecessor cannot open a second history`,
			);
		}

		const id = parent === null ? "1" : String(BigInt(parent) + 1n);

		appendGeneration(ctx, {
			id,
			boundAt: nowOf(ctx),
			manifestDigest: args.manifestDigest,
			policyChanged: args.policyChanged,
		});

		requireCoherentGeneration(ctx, id);
	},
);
```

The write itself, from `src/Catalog.ts` - the only path a `generation` row is written through:

```ts
export function appendGeneration(ctx: Context, row: Generation): Generation {
	if (ctx.db.generation.id.find(row.id) !== null) {
		throw new SenderError(`admission-refused: generation ${row.id} is already bound`);
	}

	ctx.db.generation.insert(row);

	return row;
}
```

- **Name** - `bind`, built with `spacetimedb.reducer(...)` like every other reducer in the file
  (`observe`, `recordTrace`, `claim`, `reveal`). The export name is the reducer name the host
  exposes.
- **Placement** - in the catalog section, ahead of `traceContent`: `bind` is the reducer that
  creates a generation, and every other catalog reducer stamps one.
- **`previous`** - optional, the same builder the file already uses for an absent instant or an
  unnamed generation. Absent means "open the history".
- **`capabilities`** - `t.array(t.string())`, not a JSON string. The SDK takes arrays for structured
  arguments (`node_modules/spacetimedb/dist/lib/type_builders.d.ts:1101`); a JSON string would be a
  second encoding of a list the module can already carry.
- **Imports** - `requireCoherentGeneration` and `nowOf` are already imported by the entry file; the
  one addition is `appendGeneration`, from `./Catalog` with no extension, because the module bundler
  resolves that way. `SenderError` is already imported.
- **Where the write lives** - `appendGeneration` is in `Catalog.ts`, not inline, because
  `Test/Coherence.test.ts:236` scans every file in `src/` and fails when `ctx.db.generation` appears
  anywhere but `Catalog.ts`. That scan is a string match, so it also fires on a comment: the entry
  file may not even name the derivation in prose. The same rule keeps the coherence check imported
  rather than re-derived (§3), and it is what makes "one write path" mechanical instead of a
  convention.
- **No predecessor, and no `latestGeneration` call** - a bind that names no predecessor needs the
  latest generation only to refuse when one exists, and `requireCoherentGeneration(ctx, null)`
  answers it without refusing (the helper reads an absent generation as "under the latest by
  construction"). Calling the derivation directly would be the scan violation above, and asking the
  helper is the same answer through the one implementation.
- **Clock** - `nowOf(ctx)` (`src/Catalog.ts:64`), the module's one stamp format, not
  `ctx.timestamp.toISOString()` spelled a second time.

The order is the whole of the design:

1. Refuse an empty `manifestDigest`.
2. Sort and deduplicate `capabilities`; refuse when the length changed.
3. Look every id up in `ctx.db.capability`; refuse on the first absence, naming it.
4. Resolve the predecessor, and with it the invariant (§3).
5. Compute the id and append exactly one row through `appendGeneration`, which refuses a collision.
6. Re-assert coherence against the row just written.

Nothing is written before step 5, so a refusal at 1-4 leaves `generation` untouched. A `SenderError`
aborts the transaction, so a refusal at 6 rolls the insert back as well: no path leaves a row that
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

Two corrections the probe could not make, because it ran before the scan in §1 landed:

- The probe's copy deleted `Test/Coherence.test.ts`'s `ctx.db.generation` scan, which had appeared
  after the copy was taken. In the tree the scan is live, so the write moved to `appendGeneration`
  in `Catalog.ts` and the reducer calls the coherence helper with `null` instead of naming the
  derivation. The landed shape is the one in §1.
- The landed reducer was verified in place: `tsc --noEmit` exit 0, the module suite 84/84
  (`Test/*.test.ts`, including the scan), and 11 bind cases run against the real sources from
  `.hermes/tmp/bind-write` - first bind at the module clock, `boundAt` following the clock,
  `policyChanged` stored verbatim both ways, undeclared and bare capability names refused with
  `generation` byte-identical, successor appending `2` over an untouched `1`, superseded and
  never-bound predecessors refused, no-predecessor-after-bound refused, empty digest and duplicate
  capability refused, two binds on one predecessor as a compare-and-swap, and no `update`/`delete`
  of a `generation` row anywhere in `src/`.
- `spacetime build` on a clean copy of the tree (`git archive HEAD` plus the two landed source
  files) finishes successfully. The same build in the working tree fails on
  `Test/Reveal.test.ts(412,9)` (`TS2352`, a `ctx` cast), which belongs to the concurrent reveal
  change and not to `bind`: dropping that one working-tree test file into the clean copy turns the
  build red with the same error.

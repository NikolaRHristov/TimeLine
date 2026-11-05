# Verification Report - Probe and Belief

The five acceptance criteria for the disclosure path (`reveal`, its `probe` receipt, and the
`belief` derivation) plus the archive's `observation` table, each stated as a verdict with the
command that produced it. The evidence is the module's own test harness, run from
`Maintain/Spacetime/spacetimedb`.

Pinned revision: `src/index.ts` sha256
`03868332ef692251ed06617fae96b24a91c480e3b492704e73c6ac3e85003625`, commit `d612d547` on `Current`,
working tree clean.

Whole-suite result at that revision:

```
$ node --import ./Test/Support/Register.mjs --test Test/*.test.ts
# tests 121
# pass 121
# fail 0
# cancelled 0
```

```
$ ./node_modules/.bin/tsc --noEmit -p tsconfig.json
(no output, exit 0)
```

## Verdicts

Criterion 1 (entitled sender): **PASS** - test
`an entitled sender writes exactly one probe row, scoped to its server-resolved audience`
(`Test/Reveal.test.ts`, run with
`node --import ./Test/Support/Register.mjs --test --test-name-pattern="exactly one probe row" Test/Reveal.test.ts`) -
the `probe` table goes from 0 to 1 row, every other table's row count is unchanged, and `audience`
equals `ctx.sender.toHexString()` read back through a reducer context.

Criterion 1 (atomic charge): **PASS** - test
`a failure after the private read and before the insert leaves no receipt and no charge`
(`Test/Reveal.test.ts`, `--test-name-pattern="failure after the private read"`) - the insert is
stubbed to throw through the harness context, so the fault lands after the value was computed and
before it was stored; the attempted row is captured (its `value` is
`{"name":"latency","version":1,"value":"120ms"}` and carries no `evidence`), the `probe` and
`belief` tables stay empty, every row count is unchanged, and the same reveal afterwards still
succeeds - so the aborted call consumed no allowance. The receipt insert is the charge; there is no
second write for a fault to separate from it.

Criterion 2 (unentitled sender): **PASS** - test
`an unentitled sender is refused, writes no probe row and deducts no charge` (`Test/Reveal.test.ts`,
`--test-name-pattern="unentitled sender is refused"`) - the call throws
`admission-refused: <64 hex> holds no live lease on the resource latency requires`, which contains
neither the private value nor the evidence canary; `probe` and `belief` stay empty and every row
count is unchanged; the same sender's reveal succeeds once a live lease exists, which is only
possible because the refusal charged nothing.

Criterion 3 (audience spoofing): **PASS** - 14 tests named `criterion 3: …`
(`Test/Audience.test.ts`, `--test-name-pattern="criterion 3"`, 14/14) - no registered reducer
declares an audience-like parameter, read from the module's published definition; eleven spoofing
attempts (extra `audience`, `role`, `holder`, `sender`, `identity` and `actor` fields, all of them
at once, an audience on the prototype chain, a `__proto__` payload, a second identity presenting the
first identity's hex, `claim` with a holder, `recomputeBelief` with an audience) each leave the
stored `audience` equal to `ctx.sender`'s hex; and a scan of every table after a call through every
client-callable reducer finds the spoofed value nowhere.

Criterion 4 (disclosure): **PASS** - 8 tests named `criterion 4: …` (`Test/Audience.test.ts`,
`--test-name-pattern="criterion 4"`, 8/8) - all 13 registered functions declare a unit return type
in `schema.moduleDef` and return `undefined` when called, the source scan finds no value-returning
`return` inside any registration, the seven catalog tables are `Private`, `my_probe` is the only
view and is sender-scoped and not anonymous, no procedure/HTTP/outbox/RLS read path is registered,
and a receipt carries exactly its eight columns - no `evidence`, no `resource`. This criterion
failed before the fix recorded below and passes after it.

Criterion 5 (belief recompute): **PASS** - tests
`criterion 5a: two back-to-back passes over three scopes leave a byte-identical dump`,
`criterion 5b: a throw after the first belief write leaves every prior row intact` and
`criterion 5c: a throw between the delete and the insert leaves every prior row intact`
(`Test/Belief.test.ts`, `--test-name-pattern="criterion 5"`, 3/3), with the independent dump
comparison in Appendix B - two recomputes over unchanged receipts produce one sha256 across both
dumps, and an injected failure leaves the prior rows byte-identical.

Archive `observation` table: **PASS** -
`git show d0b2a63e:Maintain/Spacetime/spacetimedb/src/Schema.ts | awk '/^const observation = table\(/,/^\);$/' | shasum -a 256`
and the same command over the working tree both print
`145e668d339b7321219dccafb290a6f5d2b4b56cd8928cc5af3ce0917ceb5eaf`, and
`git log -S "const observation = table" -- src/Schema.ts` reports one commit, `d0b2a63e`, which is
the pre-change baseline itself - the declaration, its five columns (`at`, `source`, `postId`,
`action`, `id`), its primary key, its two inline indexes and `public: true` are unchanged, and
`grep -rnE "observation\.(insert|update|delete)" src/` finds one mutation site, `src/index.ts:153`
inside `observe`, with no update or delete path anywhere.
`node --test "Maintain/Source/Test/Schema.test.ts"` → 11/11, including
`the catalog tables are declared, and the archive keeps its own names`, which asserts
`observation`'s exact column list and that `observation` and `probe` are distinct tables. The two
harness assertions `a reveal touches no archive table` and
`a recompute touches no archive table and no receipt` also pass (`--test-name-pattern="archive"`,
2/2).

## The one failure found, and its fix

Criterion 4 failed on its first audit. `reveal`'s entitlement refusal interpolated `row.resource`:

```
admission-refused: ${audience} holds no live lease on ${row.resource}, which ${args.property} requires
```

`property.resource` is a column of a private table, and the caller reaching that line is by
definition not entitled to it - worse, it is the one value `claim` accepts from any sender to make
itself entitled, so the refusal printed the instruction for passing the gate it was refusing.

Fix, `Maintain/Spacetime/spacetimedb/src/index.ts` in `reveal`: the message names the property and
never the resource the row declares.

```
admission-refused: ${audience} holds no live lease on the resource ${args.property} requires
```

Re-run of the failing check, after the fix:

```
$ node --import ./Test/Support/Register.mjs --test --test-reporter=tap \
    --test-name-pattern="does not name the private lease resource" Test/Audience.test.ts
# [audit] entitlement refusal: "admission-refused: 0000…0000 holds no live lease on the resource latency requires"
ok 1 - criterion 4: a refusal does not name the private lease resource
# pass 1
# fail 0
```

The assertion is load-bearing. Restoring the old message in a scratch copy of the module
(`node_modules` symlinked, so the bare `spacetimedb` specifier still resolves) fails exactly that
test and no other:

```
not ok 1 - criterion 4: a refusal does not name the private lease resource
  error: 'the refusal named the private resource catalog:latency'
```

`Test/Reveal.test.ts` pins the same rule from the entitlement side, so the wording cannot drift back
without a second failure.

## Temporary instrumentation

None remains. The fault injections used to prove the atomicity assertions are built in the test
files out of the harness's own context (`Object.create` over the real accessors, or a spread context
whose one table overrides `insert`), not by editing the module - so there is nothing to revert in
`src/index.ts`:

```
$ grep -nE "mutation|MUTATION|inject|INJECT|boom|__test|testOnly|TEST_ONLY|process\.env|TODO|FIXME|XXX|HACK|throw new Error\(" src/index.ts
782: *    disclosure injected into that identity's belief.
```

The single hit is the word "injected" in a comment about writing a receipt in another identity's
name. `grep -rnE "mutation|INJECT|__test|process\.env" src/` finds nothing. One test-only evidence
hook exists in `Test/Belief.test.ts` (`BELIEF_DUMP_DIR`, unset by default): it writes the compared
dumps to disk when set, and injects nothing.

## Appendix A - Reducer disclosure audit

Read from `Catalog.default.moduleDef` after the harness registers the module's exports, so these are
the facts the host publishes rather than the source text's claims. An empty product type is the unit
type; a SpacetimeDB reducer has no return channel to a caller, so `unit` means no value can travel
out of it.

| Function          | Kind                      | Declared return          | Verdict                  |
| ----------------- | ------------------------- | ------------------------ | ------------------------ |
| `attach`          | reducer (ClientCallable)  | unit                     | safe - no return channel |
| `bind`            | reducer (ClientCallable)  | unit                     | safe - no return channel |
| `claim`           | reducer (ClientCallable)  | unit                     | safe - no return channel |
| `classify`        | reducer (ClientCallable)  | unit                     | safe - no return channel |
| `observe`         | reducer (ClientCallable)  | unit                     | safe - no return channel |
| `recomputeBelief` | reducer (ClientCallable)  | unit                     | safe - no return channel |
| `record`          | reducer (ClientCallable)  | unit                     | safe - no return channel |
| `recordTrace`     | reducer (ClientCallable)  | unit                     | safe - no return channel |
| `renew`           | reducer (ClientCallable)  | unit                     | safe - no return channel |
| `reveal`          | reducer (ClientCallable)  | unit                     | safe - no return channel |
| `init`            | lifecycle (Init)          | unit                     | safe                     |
| `onConnect`       | lifecycle (OnConnect)     | unit                     | safe                     |
| `onDisconnect`    | lifecycle (OnDisconnect)  | unit                     | safe                     |
| `myProbe`         | view (public, per-sender) | `Array<ProbeDisclosure>` | sender-scoped            |

Procedures: none registered. Source-level scan for the same rule: the only `return` statements
inside a registration are bare (`src/index.ts` lines 174, 487, 1057, 1068); every value-returning
`return` (374, 402, 407, 718, 744, 757, 962-965) is inside a helper - `traceContent`, `digestOf`,
`traceId`, `audienceOf`, `standingOf`, `discloseOf`, `compareReceipts` - and the only value any of
them hands back is a key, a fence, a comparison, or the permitted projection built by `discloseOf`.

Table access, which decides what a subscriber can read at all:

| Table         | Access  |
| ------------- | ------- |
| `post`        | Public  |
| `author`      | Public  |
| `media`       | Public  |
| `observation` | Public  |
| `event`       | Public  |
| `membership`  | Public  |
| `capability`  | Private |
| `generation`  | Private |
| `lease`       | Private |
| `property`    | Private |
| `probe`       | Private |
| `belief`      | Private |
| `trace`       | Private |

## Appendix B - Belief idempotence diff summary

Fixtures: one capability (`latency@1`), one property, three receipts in the caller's scope (two
properties, one at a newer version). The clock is moved one minute between the two recomputes, so a
re-stamp would be visible. Rows are ordered by `id` and serialised one JSON object per line.

```
run 1 rows: 1
run 2 rows: 1
run 1 == run 2: true

$ shasum -a 256 belief-run1.txt belief-run2.txt
b0eac0517fbc3aa253337a7038fd0661dafb9e93ed9b39348267a47db4578b66  belief-run1.txt
b0eac0517fbc3aa253337a7038fd0661dafb9e93ed9b39348267a47db4578b66  belief-run2.txt

$ diff -u belief-run1.txt belief-run2.txt
(empty, exit 0)
```

The single row, from run 1:

```
{"id":"0000…0000:latency@1","audience":"0000…0000","capability":"latency@1",
 "value":"{\"name\":\"beta\",\"version\":2,\"value\":\"80ms\"}","confidence":0.75,
 "at":"2026-01-01T00:00:00.000000Z"}
```

`confidence` is `3/4` for three receipts, `value` is the highest property version's receipt copied
verbatim, and `at` still carries the first run's instant - the second run rewrote nothing, because
`recomputeBelief` returns early when the derived columns already match. A separate run over three
scopes (three belief rows) reports the same result: six dumps, one sha256
`2b8f3278b4579b88a3c5a76471516bddb01d46aee8a622adca4cf2a7f30c3767`.

Mid-recompute failure: a fourth receipt is inserted and `recomputeBelief` is called in the same
transaction, which then throws.

```
injected failure: injected mid-recompute failure
prior beliefs survive intact: true
receipts after rollback: 1

$ shasum -a 256 belief-before-failure.txt belief-after-failure.txt
507da823f4709bbd3f5ae6bcb65412cdf9ac98af1fac85dea33356e66920b0e2  belief-before-failure.txt
507da823f4709bbd3f5ae6bcb65412cdf9ac98af1fac85dea33356e66920b0e2  belief-after-failure.txt

$ diff -u belief-before-failure.txt belief-after-failure.txt
(empty, exit 0)
```

The prior belief survives byte-for-byte and the receipt that would have changed it is rolled back
with it, because the delete and the insert and the throw are one transaction. The
`Test/Belief.test.ts` faults go further and count the writes the reducer attempted, so a reducer
that returned early cannot make the assertion vacuous.

## Appendix C - Commits carrying the fixes and the tests

| Commit     | What it carries                                                     |
| ---------- | ------------------------------------------------------------------- |
| `078efb0e` | the criterion-4 fix in `reveal`, plus the assertions that pin it    |
| `9c975a0c` | the criterion-5 tests and the `Probe-Contract.md` claim → test rows |
| `ae538dc3` | further belief-recompute failure tests                              |
| `f06e5e90` | `Disclosure-Audit.md`, the criteria 3-4 record                      |
| `d612d547` | `Test/Audience.test.ts` in its final form, and the audited revision |

## Residual, not a criterion failure

`claim`'s `lease-held` refusal names `lease.holder` - another identity's hex - in the same shape
`reveal` was fixed for. Criterion 4 as stated governs return values, and `claim` returns nothing, so
the criterion passes; the message is still a disclosure that hands one caller another caller's
identity. It is queued as follow-up work against `claim` alone; the fence and generation logic is
not in question.

## Superseded revision

The schema has since gained a column. `probe.generation` records the generation a receipt was
written under, so a receipt now carries nine columns rather than the eight asserted above, and the
criterion-4 column assertion has to move with it. `reveal` also requires a bound generation, so a
fixture that binds none is refused at
`unbound-generation: a receipt names the generation it was allowed under, and none has been bound`
before the entitlement check is reached - which is a property of the newer revision, not a return of
the leak.

Neither change touches the F1 fix, which still reads
`admission-refused: ${audience} holds no live lease on the resource ${args.property} requires`
(`src/index.ts:911`). Every verdict above was measured at `03868332`; a re-run against the newer
revision is the epic-boundary pass, not a correction to this record.

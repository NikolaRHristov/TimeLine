# Disclosure and audience audit

The disclosure path's two security criteria, checked against the module's own published definition
rather than against a reading of the source: criterion 3 (the stored audience is the server-resolved
sender) and criterion 4 (no reducer returns a private value, and a probe returns only what it
wrote).

Everything below is produced by `Test/Audience.test.ts`, which runs on the SpacetimeDB module test
harness - an in-memory datastore, a controllable clock, and the module's real reducers called the
way the host calls them.

```sh
cd Maintain/Spacetime/spacetimedb
node --import ./Test/Support/Register.mjs --test Test/Audience.test.ts   # 22 tests
npm test                                                                 # 121 tests, whole module
```

The audited revision is `src/index.ts` at sha256
`03868332ef692251ed06617fae96b24a91c480e3b492704e73c6ac3e85003625`.

---

## Verdicts

**Criterion 3 - PASS.** Command:
`node --import ./Test/Support/Register.mjs --test Test/Audience.test.ts`, tests
`criterion 3: no registered reducer declares an audience-like argument` through
`criterion 3: no reducer call persists a caller-supplied audience in any table` (14 tests). No
reducer declares an audience-like parameter, eleven separate spoofing attempts are ignored - seven
argument shapes, a field carried on the prototype chain, a `__proto__` payload, a second identity
presenting the first one's hex, and the two reducers that write an audience column - and a scan of
every table after a call through every client-callable reducer finds the spoofed value nowhere.

**Criterion 4 - PASS** on the stated criterion. Command: the same run, tests
`criterion 4: every registered reducer declares a unit return type` through
`criterion 4: a refusal does not name the private lease resource` (8 tests). All thirteen registered
functions declare a unit return type, all return `undefined` when called, no registration in the
source contains a value-returning `return`, the catalog tables are private, `my_probe` is the only
view and is sender-scoped, and a receipt carries the eight receipt columns and neither the evidence
nor the lease resource.

Two error-message disclosures were found while auditing; the one in `reveal` is fixed here, the one
in `claim` is recorded as a finding and carded. They are not return values, so they do not change
the verdict above, and they are not invisible: see **Findings**.

---

## Criterion 3 - the audience is server-resolved

The rule is checked three ways, because there are three ways it could break.

**No reducer declares one.** The audit reads `schema.moduleDef.reducers`, which is the definition
the host publishes, and asserts that no parameter name matches
`audience|role|holder|sender|identity|actor|principal|owner|member|user`. The same test asserts the
audited set is exactly the thirteen published reducers, so a reducer added later cannot be skipped.

**A call that carries one anyway is ignored.** Each shape below is an argument the reducer's
declared signature does not have; the harness hands the reducer the object the caller built, extra
fields included, which is the same situation as a wire payload whose decoder kept an undeclared
field. The stored row is printed by the test (`[audit] reveal with …`) and asserted.

| Attempt                                    | Payload field                                    | Stored `audience`                     |
| ------------------------------------------ | ------------------------------------------------ | ------------------------------------- |
| audience argument                          | `audience: "f"×64`                               | the caller's hex                      |
| role argument                              | `role: "prober"`                                 | the caller's hex                      |
| holder argument                            | `holder: "f"×64`                                 | the caller's hex                      |
| sender argument                            | `sender: "f"×64`                                 | the caller's hex                      |
| identity argument                          | `identity: "f"×64`                               | the caller's hex                      |
| actor argument                             | `actor: "f"×64`                                  | the caller's hex                      |
| every audience-like argument at once       | all six                                          | the caller's hex                      |
| audience on the prototype chain            | inherited `audience` (resolves, not `undefined`) | the caller's hex                      |
| `__proto__` payload                        | `{"__proto__":{"audience":…}}`                   | the caller's hex                      |
| second identity presenting the first's hex | `audience: <first identity>`                     | the second identity's hex             |
| `claim` with a holder                      | `holder: "f"×64`                                 | `lease.holder` is the caller's hex    |
| `recomputeBelief` with an audience         | `audience: "f"×64`                               | `belief.audience` is the caller's hex |

The caller's hex is the module identity (`00…00`, 32 zero bytes) because `TestAuth.internal()`
resolves to it; the second identity is a JWT-derived one, `c2 00 c1 11 …`, and the spoof is `"f"`
repeated 64 times so that its presence anywhere is unambiguous.

The prototype-chain row is the strongest form of the attack: `args.audience` resolves to a value the
caller chose, so a module that read it with even `args.audience ?? ctx.sender` would store the
spoof. `reveal` reads neither.

**No call persists one anywhere.** The sweep calls `observe`, `record`, `classify`, `attach`,
`bind`, `recordTrace`, `claim`, `renew`, `reveal` and `recomputeBelief` in one fixture, each with an
audience-like field appended, and after every call serialises all thirteen tables and asserts the
spoof appears in none of them. A reducer that copied the field into some other column is caught even
where the `audience` column itself is correct. The same test asserts the caller's own hex and the
receipt's property name did reach the datastore, so the scan cannot pass by having written nothing.

---

## Criterion 4 - the reducer audit

Every registered function was read for its return type, its `return` statements and the tables it
opens. "Return type" is the published `okReturnType`; "unit" is
`{"tag":"Product","value":{"elements":[]}}`.

| Reducer           | Return type   | Reads                                      | Writes (visibility)                      | Verdict                                     |
| ----------------- | ------------- | ------------------------------------------ | ---------------------------------------- | ------------------------------------------- |
| `init`            | unit          | -                                          | -                                        | safe                                        |
| `onConnect`       | unit          | -                                          | -                                        | safe                                        |
| `onDisconnect`    | unit          | -                                          | -                                        | safe                                        |
| `observe`         | unit          | `post`, `author`, `observation`            | `post`, `author`, `observation` (public) | safe                                        |
| `record`          | unit          | `event`                                    | `event` (public)                         | safe                                        |
| `classify`        | unit          | `membership`                               | `membership` (public)                    | safe                                        |
| `attach`          | unit          | `media`                                    | `media` (public)                         | safe                                        |
| `bind`            | unit          | `capability` by key, `generation`          | `generation` (private)                   | safe                                        |
| `recordTrace`     | unit          | `generation`, `trace`                      | `trace` (private)                        | safe                                        |
| `claim`           | unit          | `lease`                                    | `lease` (private)                        | returns safe; refusal names the holder (F2) |
| `renew`           | unit          | `lease`                                    | `lease` (private)                        | safe                                        |
| `reveal`          | unit          | `capability`, `property`, `lease`, `probe` | `probe` (private)                        | safe after F1                               |
| `recomputeBelief` | unit          | `capability`, `probe`, `belief`            | `belief` (private)                       | safe                                        |
| `myProbe` (view)  | receipt array | `probe` by `audience = ctx.sender`         | -                                        | safe                                        |

The checks behind the table:

- **Return type.** All thirteen published reducers declare the unit type, so no return value exists
  for a private value to travel in.
- **Return statements.** The source is scanned with literals and comments masked; every `return`
  inside every registration's arrow body is bare (`return;`). The scan asserts its own coverage -
  the names it finds must equal the published reducer names - so a registration written in another
  form fails the test rather than escaping it.
- **Runtime.** Each of the thirteen is called on a valid path in one fixture and each answers
  `undefined`.
- **Visibility.** `capability`, `generation`, `lease`, `property`, `probe`, `belief` and `trace` are
  declared `private`, so no subscriber reads a private column; `post`, `author`, `media`,
  `observation`, `event` and `membership` are public because they are the site's content.
- **Read paths.** `my_probe` is the only view, it is public and not anonymous, and its rows are the
  caller's own receipts: two identities each reveal once and each sees exactly one row, its own. No
  procedure, HTTP handler, HTTP route, outbox or row-level security filter is registered, so there
  is no second way into the catalog.
- **What a probe returns.** The receipt carries `id`, `capability`, `property`, `propertyVersion`,
  `audience`, `value`, `at` and `ingestedAt`, and nothing else; the private row's `evidence` and
  `resource` appear in neither the receipt nor the view, both checked against a canary string.

---

## Findings

### F1 - the entitlement refusal named the private lease resource (fixed)

`reveal` refused an unentitled caller with the property's declared lease resource in the message:

```
admission-refused: <audience> holds no live lease on catalog:latency, which latency requires
```

`property.resource` is a column of a private table, and the caller reaching that line is by
definition not entitled to it. It is also the one value `claim` needs to make itself entitled,
because `claim` grants any free resource to any sender that names it - so the refusal was an
instruction for passing the gate it described. The message now names the property and not the
resource:

```
admission-refused: <audience> holds no live lease on the resource latency requires
```

The assertion that pinned the old wording (`Test/Reveal.test.ts`,
`an unentitled sender is refused, writes no probe row and deducts no charge`) now asserts the
property is named and the resource is not. `Test/Audience.test.ts` locks it from the other side with
`criterion 4: a refusal does not name the private lease resource`.

### F2 - the lease refusal named the identity that holds the resource (fixed)

`claim` refused a second caller with the current holder's identity:

```
lease-held: catalog:latency is held by 0000…0000 under fence 1 until 2026-01-01T00:01:00.000000Z
```

Measured with two authenticated senders and one resource; the refused sender learned the holder's
hex, its fence and its deadline, none of which it is entitled to. `lease` is a private table, so the
holder's identity is a value the refused caller cannot read for itself, and an error message is
still a read. The refusal now keeps its diagnostic value and drops the identity:

```
lease-held: catalog:latency is held by another identity under fence 1 until 2026-01-01T00:01:00.000000Z
```

The caller still learns that the resource is taken, which fence stands in the way and when that
fence lapses; it no longer learns who holds it. `Test/Lease.test.ts`,
`the lease-held refusal does not name the identity that holds the resource`, measures it with two
authenticated senders and one resource: it asserts the refusal matches `/held by another identity/`,
that it does not contain the holder's hex, that it carries no identity hex at all
(`/[0-9a-f]{64}/`), and that the first sender still holds the one grant afterwards. The prefix
`lease-held: <resource> is held by ` is unchanged, so the file's earlier assertions stay green.

Both halves of the assertion are load-bearing, measured by mutation: restoring `${live.holder}` in
place of `another identity` fails the test on the wording, and a message that says
`another identity` while also appending the hex fails it on the holder's hex.

### F3 - observations, not defects

- `observe`, `record`, `classify` and `attach` accept writes from any identity. They write the
  public archive and read no private table, so they disclose nothing; the write authority they grant
  is a separate question from this audit.
- `claim` grants any free resource to any sender. A live lease is therefore a gate a caller can open
  for itself rather than a role check, which is why F1 mattered: naming the resource handed a caller
  the key to a gate it could then open. Removing the name does not make `claim` an authorization; it
  removes the shortcut to it.

---

## Reproducing

```sh
cd Maintain/Spacetime/spacetimedb

# This file, with every stored row printed as it is asserted.
node --import ./Test/Support/Register.mjs --test Test/Audience.test.ts

# The whole module suite.
npm test

# The module compiles and the tests type-check.
spacetime build
```

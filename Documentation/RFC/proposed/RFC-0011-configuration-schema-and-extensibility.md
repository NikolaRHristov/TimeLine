# RFC-0011 - Configuration schema and extensibility

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:**
`Maintain/Source/Configuration/`, the module, the client, `Documentation/Reference/Configure.md`
**Decision class:** architecture **Supersedes:** none **Superseded by:** none **Task dependencies:**
RFC-0002 (one schema, one authority), RFC-0007 (key material is configuration); t_5ca276be and
t_c65afc0c landed the map and the configuration-driven list taxonomy; implementing card to be
created: "Configuration schema v2 - versioned terms, defaults, validation, unknown-key preservation"

## Decision

Every term the system can vary - audience, channel, network, key, propagation channel, certificate
authority, transport, cipher - is a row in one versioned configuration schema, not a branch in code.

The schema is data. Each term declares four things and no others: a **default** (the value used when
the term is absent), an **effect** (the component and the behaviour that read it), a **validation
rule** (type, range, and the failure code a violation produces) and a **scope** (machine-local,
room, or global). A term that cannot name its effect is removed.

Unknown keys are preserved and reported. A key the schema does not know survives a read-write cycle
verbatim and appears under `unknown` in `config show`; it is never dropped and never fatal. Adding a
term is a schema change: `schemaVersion` increments, the term arrives with a default and a
validation rule, and the change states how an existing map acquires it.

Loading is a fixed ladder - schema default, then the map, then the environment, then a command
flag - and each rung may only narrow the rung below it.

## Context

The identifier map exists and is validated by hand in
`Maintain/Source/Configuration/Schema/Schema.ts` (194 lines). It has no version field and it is
lossless in neither direction:

```sh
printf '%s' '{"cdp":{"port":"abc"},"nonsense":1,"lists":[]}' > /tmp/Map.json
MAINTAIN_CONFIG=/tmp/Map.json node Maintain/Target/Index.js config show --json
```

prints `"port": 9222` and exits 0 - a wrong-typed known key falls back to its default in silence -
and `nonsense` is absent from the output. Running `config init --force` on the same file rewrites it
without `nonsense`, because `document()` (Schema.ts:163) re-emits only the keys the type declares.

`Documentation/Reference/Configure.md:189` lists `schema-invalid` as covering "a key has the wrong
shape". That is true for `lists` (Schema.ts:103) and false for every scalar term, where
`text(...) ?? default` and `count(...) ?? default` absorb the error.

The product needs terms the map has never carried - audiences, propagation channels, certificate
authorities, ciphers - and a person will edit the file by hand. A schema that silently discards what
it does not recognise cannot carry them, and a schema with no version cannot tell an old build from
a new one.

## Alternatives considered

| Option                                  | Why not chosen                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Keep hand validation, add no version    | the schema cannot be diffed, exported or read by the module and the client; three copies drift                                        |
| A schema library such as zod            | a dependency for a contract that is 194 lines of explicit code, and the failure codes and messages are product surface a library owns |
| Reject unknown keys as `schema-invalid` | a newer client writing a term an older build does not know would lock the person out of their own map                                 |
| Put every term in the database per room | machine-local facts (CDP port, storage paths) do not belong in a room, and a room is unreadable before it is joined                   |
| One flat namespace of terms             | machine-local, room and global terms have different writers and different lifetimes                                                   |

## Consequences

- The schema file becomes the only place a term is declared; `Configure.md` is generated from it or
  checked against it, never hand-synchronised.
- `config show` grows an `unknown` section, so an old build reports what a new build wrote instead
  of hiding it.
- Every write path must round-trip: `document()` gains the unknown-key bag and `config init --force`
  preserves what it does not understand.
- Scalar validation starts refusing instead of defaulting. That is a behaviour change for every
  existing map: a wrong-typed key becomes `schema-invalid` with `field` and `reason`, where it used
  to be a silent fallback.
- Three scopes mean the schema is not one flat object; a term declares where it may be set and what
  happens when it is set in the wrong scope.
- A map written by a newer build is readable by an older one without data loss, which is what makes
  the schema version meaningful rather than decorative.

## Verification

| Claim                               | Test                                                                                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The schema carries a version        | `node Maintain/Target/Index.js config show --json \| jq -r .schemaVersion` prints a number                                                                                 |
| Every term declares all four fields | `node Maintain/Target/Index.js config schema --json \| jq -r '.terms[] \| select(.default==null or .effect==null or .rule==null or .scope==null) \| .name'` prints nothing |
| Unknown keys survive a write        | add `"nonsense": 1`, run `config show`, then `config init --force`, then read the file: the key is still present                                                           |
| Unknown keys are reported           | `config show --json \| jq -r '.unknown[]'` names `nonsense`                                                                                                                |
| A wrong type is refused             | set `cdp.port` to `"abc"` and run `config show`: exit 2, `{"error":"schema-invalid","field":"cdp.port"}`                                                                   |
| Documentation matches the schema    | `node Maintain/Target/Index.js config schema --markdown` diffs clean against the `## Keys` table in `Configure.md` (intent until the generator exists)                     |
| Adding a term is a version change   | a review rule: a diff that adds a term touches `schemaVersion` in the same change (intent)                                                                                 |
| The ladder holds                    | `MAINTAIN_CDP_PORT=9223` beats `cdp.port: 9222`; a `--cdp-port` flag beats both                                                                                            |

## Open questions

- Whether the schema is TypeScript (type inference for free) or JSON (readable by the module and the
  client without a build). It is TypeScript today, and the module is TypeScript too, but the module
  is compiled into a room and cannot import from `Maintain/Source`.
- Whether a room's own terms are configuration at all, or rows in the room's database. This record
  assumes rows - a room's terms must be readable by members and changeable by an authority - and the
  schema only declares which terms a room may carry. UNKNOWN: whether the engine can hold a
  schema-version row that a module reads at init and refuses when it does not recognise.
- Spike to settle both: publish a module that reads a `config` row at init and refuses an unknown
  version, on the local server at `127.0.0.1:3010`.

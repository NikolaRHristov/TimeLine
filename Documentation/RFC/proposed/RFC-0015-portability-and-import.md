# RFC-0015 - Portability and import

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the export command,
the import command, the module's read surface, the shadow store **Decision class:** architecture
**Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0005 (the exit guarantee),
RFC-0007 (an export without keys is void), RFC-0013 (key epochs), RFC-0014 (deletion is gated on
export), RFC-0001 (the shadow store's own round trip); t_b9e11f0c (ingest), t_fe20eeee (storage);
implementing card to be created: "Export and import format, with a round-trip verifier"

## Decision

An export is five files with a version, and every byte in them is addressable.

| File                | Contents                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| `Manifest.json`     | `{format, room, exportedAt, counts, rootHash, exporter, module}`                                     |
| `Payload.jsonl`     | one line per post: `{id, envelope, ciphertext (base64), contentHash}`                                |
| `Provenance.jsonl`  | one line per authorship and propagation record: `{postId, author, signature, audience, propagation}` |
| `Key.json`          | the room's epochs, wrapped to the exporter's identity, with `notBefore`/`notAfter` per epoch         |
| `Observation.jsonl` | the observation log exactly as the shadow store holds it (RFC-0001)                                  |

Ordering is deterministic, by id. Each line carries its own hash and `rootHash` is the hash of the
sorted line hashes, so two exports of the same room compare equal across machines and across runs.

**Export needs no cooperation from the room.** The client exports what it holds: rows it authored,
rows it was granted, and the keys it carries. For that to be complete, the module must let a member
fetch everything they may read in one pass, which is a per-member view rather than a table
subscription. What the client never held cannot be exported, and that limit is stated in the
manifest as `complete: true | false` rather than implied.

**Import verifies before it writes.** Every hash is checked first; the first mismatch aborts with
`hash-mismatch` and the line number, and nothing is written. Import then either creates a room (a
new database, the module published, rows written) or merges into an existing one - only when the
format version and the room identity match, otherwise `room-mismatch`. An import appends one event
carrying the source `rootHash`, so a room can always say where its rows came from.

**Foreign platforms arrive through an adapter**, not through a second format. An adapter emits the
same five files with `origin` set on every provenance line and `signature: null`. Imported content
is marked as not locally authored, and the module refuses to treat such a row as one the local
identity wrote.

## Context

RFC-0005 promises that a person's data is exportable from the room they authored it in without the
room's cooperation, and RFC-0007 says an export must include the keys or the exit guarantee is void.
Neither record says what the bytes are, so the guarantee is currently a sentence rather than a
format.

What exists is the shadow store: one JSON file per status id under `Maintain/Storage/Shadow/`, an
append-only `Observation.jsonl`, an `Event/` directory and an `Index.json`. It round-trips through
`store export` and `store push` (RFC-0001's verification table) and it is a single person's
archive - no rooms, no keys, no provenance, and no notion of an audience. It is the fifth file of
the format, not the format.

The engine also offers a byte-level database export through the CLI. That is a different artifact:
it preserves the engine's internal representation, which is exactly the lock-in this record exists
to prevent. It may be offered beside the semantic export; it cannot replace it.

## Alternatives considered

| Option                                           | Why not chosen                                                                                     |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| One JSON blob                                    | no streaming, no per-line integrity, and one bad byte costs the whole archive                      |
| A database dump                                  | ties portability to the engine's internal format, which is the lock-in the record exists to remove |
| Export performed by the host on request          | requires the cooperation RFC-0005 forbids, and gives the host a copy of the plaintext              |
| Protobuf or another binary encoding              | smaller, unreadable without a schema, and one more format to version for no benefit at this size   |
| Keys excluded, "export your identity separately" | an export a person cannot open is not an exit; RFC-0007 already rules this out                     |
| Import that overwrites on id collision           | silently replaces one person's row with another's; a collision must be a decision                  |

## Consequences

- Keys travel inside the export, so an export is as sensitive as the room. It is written encrypted
  at rest with a passphrase, and the manifest says which mode it used.
- Deterministic ordering costs a sort per export and a stable id scheme; without it `rootHash` is
  decoration.
- Import into an existing room needs conflict rules: same id and same content hash is a skip, same
  id and a different hash is `conflict`, and nothing is ever overwritten.
- The format becomes a compatibility surface with its own version, reviewed like a schema.
- `complete: false` makes a partial export honest, and a deletion gate (RFC-0014) that reads it
  cannot be fooled by an export of nothing.

## Verification

| Claim                                 | Test                                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A round trip is stable                | `maintain export --room <id> --out a`, then `maintain import a --dry-run`: counts match and a second export has the same `rootHash` |
| Tampering is caught                   | flip one byte in `Payload.jsonl`; import fails with `hash-mismatch` naming the line, and nothing is written                         |
| Keys are in the export                | `unzip -l export.zip` lists `Key.json`, and the manifest records the wrap mode                                                      |
| Imported content is not local         | `jq -r '.signature' Provenance.jsonl` contains `null` for imported rows and an import event names the source `rootHash`             |
| A partial export says so              | export from a client holding one grant: `jq -r .complete Manifest.json` prints `false`                                              |
| The shadow store still round-trips    | `store export`, wipe, `store push`, counts match (already in RFC-0001's table)                                                      |
| Export survives the server being down | stop the server, `maintain export --room <id> --out b` still writes (intent until the client cache exists)                          |

## Open questions

- Whether `Key.json` is wrapped to the exporter's identity (portable only with the identity key) or
  to a passphrase (portable to any client, weaker). The record writes both: exporter-wrapped by
  default, passphrase re-wrap on request.
- Whether the engine's byte-level export is worth offering beside the semantic one, for a room whose
  module has been lost.
- UNKNOWN whether a per-member view can return the full set a member may read without a pagination
  limit. Spike: publish a room with 10,000 rows and subscribe as one member, then count what
  arrives.
- Whether `internal` content appears in an export at all. RFC-0012 says it does not; this record
  assumes the module refuses to serve it to the exporter, so the format needs no rule.

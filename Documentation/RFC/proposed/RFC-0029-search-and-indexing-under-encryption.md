# RFC-0029 - Search and indexing under encryption

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the client index, the
module's envelope indexes, the static site's search **Kind:** architecture **Subject:** data
**Horizon:** next **Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0007 (the
module reads shape, not content), RFC-0001 (the store is client-side), RFC-0014 (join-without-seeing
starts an index empty), RFC-0025 §5 (rows arrive by subscription); implementing card to be created:
"Client index over the shadow store"

## Decision

Search runs on the client, over an index the client builds from rows it may read. The module indexes
envelopes and nothing else.

1. **The index is a client artifact.** It is built from the rows a member holds and stored beside
   the shadow store (RFC-0001 layer 1), rebuilt from an export (RFC-0015) or incrementally from a
   subscription (RFC-0025 §5). No index is written into the room, and a room has no search table.
2. **What the module may index is the envelope.** Author, audience, action class, accepted time,
   envelope size, content hash and reply target are cleartext and signed (RFC-0007's field table),
   and every one of them is a btree index the engine supports (`AGENTS.md:405`,
   `AGENTS.md:417-427`). Search by author, by date, by type and by thread therefore works
   server-side without the module reading anything.
3. **What the module may never index is a token from the payload.** Not a word, not a stem, not a
   hash of a word. RFC-0007 fixes AES-GCM with a fresh random IV per message, which by construction
   makes two encryptions of the same word differ; no equality test over ciphertext is possible, and
   making one possible would mean replacing the cipher suite.
4. **There is no server-side plaintext projection.** A projection would be a second copy of content
   the host can read, which contradicts RFC-0007 for every row it covered and would make the privacy
   claim conditional in a way a member cannot audit. The cost is stated rather than paid: a room
   cannot offer hosted full-text search.
5. **Published content is the one place content search exists.** `Source/Content/` is plaintext at
   build time (RFC-0001 layer 3, RFC-0017), so the static site may index it and a search box over
   published cards is not a leak - it searches exactly what RFC-0012 already makes public. A search
   over `typed` or `internal` rows is a different proposition and stays client-side.
6. **A new member indexes nothing until they hold something.** Join-without-seeing (RFC-0014) means
   an empty index and an empty search result that says so; a member granted `typed:<type>` receives
   those rows at the next read and indexes them locally. Search never returns a count of rows the
   caller cannot read, because that count is itself a disclosure.
7. **A local index is a plaintext derivative and the client protects it.** It lives where the keys
   live, so it inherits RFC-0020's first assumption - a compromised client is outside the model. The
   index is not encrypted at rest by this system; a client that wants that encrypts its own store.

## Context

The engine's index vocabulary is one word: btree, on columns (`AGENTS.md:405`, `AGENTS.md:417-427`).
There is no full-text index, no tokenizer and no language model in the module's reach, and the only
row-filtering primitive that resembles search is `clientVisibilityFilter` (`AGENTS.md:681`), which
takes a SQL predicate over a table's own columns - cleartext columns, because a filter runs on the
server. A view is a computed subset over `ctx.db` (`AGENTS.md:617`) and computes over cleartext for
the same reason.

The cipher fixes the rest. RFC-0013 derives a message key per post and encrypts with
`additionalData` bound to the envelope header, so the same plaintext under two posts produces two
unrelated ciphertexts. Deterministic encryption would have to be introduced deliberately, and it
would leak equality across every row it covered - which is the one thing a room's `internal`
audience is for.

## Alternatives considered

| Option                                                | Why not chosen                                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Server-side keyword index over plaintext              | requires a plaintext projection, which is a second copy of the content the host promised not to read (RFC-0007)                            |
| Deterministic encryption so ciphertext can be matched | breaks the random-IV rule RFC-0007 fixes, and leaks equality: two identical notes become visibly identical to the host                     |
| Searchable encryption (an encrypted inverted index)   | outside RFC-0007's cipher suite, and the query pattern is visible to whoever holds the index; whether the engine could host it is UNKNOWN  |
| A per-room search service holding an epoch            | that service is a reader, so it is an escrow holder (RFC-0013) and must be configured and disclosed as one, not introduced as a feature    |
| Client index over everything the client can download  | a client can only download what it may read (RFC-0015's per-member view), so this is the chosen option with a different name               |
| Filter client-side over a public table                | a public table replicates every row to every subscriber, so the filter runs after delivery - a leak with a search box on top (RFC-0025 §5) |

## Consequences

- A member's search is as complete as their grants and no more, which is the same rule their reading
  follows. There is no way to search a room for something you may not read, and no way to learn that
  it exists.
- The client carries the cost: an index over a large archive is a build step, a storage cost and a
  reindex on every new device. That is the price of the host not being able to read.
- A room cannot ship a "find in room" feature that works before the client has synced, so the empty
  state is a designed screen (RFC-0014 already requires one for join).
- Envelope search is genuinely useful and cheap, so the common questions - what did this person
  write, what happened last week, what is in this thread - are answered without a plaintext index.
- The static site's search over published cards is free of this record's limits, which keeps the
  public face of the product competitive with a normal site.

## Verification

| Claim                                        | Test                                                                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| No content index exists in the module        | `grep -ri "index" Maintain/Spacetime/src \| grep -vi "btree"` returns nothing but envelope columns (intent)                              |
| Envelope search works without content        | `spacetime sql <room> "SELECT id FROM payload WHERE author = <identity>"` returns rows while every payload column is ciphertext (intent) |
| A query returns no unreadable count          | subscribe as a member without a `typed` grant and query the thread view; the response is empty rather than "3 hidden rows" (intent)      |
| The site index covers only published content | build the site with a room running; the search index's source set equals the files under `Source/Content/` (intent)                      |
| A fresh member's index is empty              | join a fixture room with `grant = none`; search returns zero results and the empty state renders (RFC-0014)                              |
| Two encryptions of one word differ           | encrypt the same string twice with RFC-0013's derivation; the ciphertexts differ in every byte after the IV (WebCrypto, intent)          |

## Open questions

- Whether a room could offer opt-in hosted search for `public` rows only, where the projection leaks
  nothing a member has not already published. It would be a second code path and a second promise;
  whether it is worth the audit is undecided.
- Whether a searchable-encryption scheme could be added without breaking RFC-0013's `additionalData`
  binding, and what the query-pattern leak would cost against RFC-0016 §4's enumeration. UNKNOWN -
  no scheme has been evaluated, and the answer decides whether server-side search is a road not
  taken or a road not yet built.
- Whether an index over ciphertext metadata alone (author, time, size) leaks enough to reconstruct a
  room's activity graph from a client's store. It is metadata the host already has (RFC-0016 §4), so
  the question is about a stolen device, not about the host.

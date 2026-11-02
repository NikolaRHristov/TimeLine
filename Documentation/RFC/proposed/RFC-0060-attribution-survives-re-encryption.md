# RFC-0060 - Attribution survives re-encryption because it signs plaintext

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the envelope, the
signature chain, the propagation record, published attribution **Decision class:** policy
**Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0013 §Authorship (the
signature this record gives a canonical form), RFC-0013 (the `additionalData` rule it distinguishes
itself from), RFC-0021 (observation provenance, which is about who saw rather than who wrote),
RFC-0015 (`signature: null`, the degenerate chain), RFC-0059 (a copy and a retraction); implementing
card to be created: "Canonical post form and the signature chain"

## Decision

An author signs a canonical **plaintext** statement about a post, not the ciphertext that carries
it. A copy re-encrypted into another room carries that signature unchanged, beside the copier's own.

1. **What is signed.**
   `sig = Sign(authorKey, canonical{postKey, authorKey, audience, createdAt, replyTo, mediaHashes})`.
   The canonical form excludes the room, the epoch and the ciphertext, because all three change when
   a post is copied and none of them is a fact about who wrote it.
2. **RFC-0013's `additionalData` is not this signature.** That record authenticates the envelope
   header to the _ciphertext_ - it stops a ciphertext being relabelled to another audience - and it
   is per copy. This signature authenticates the _author_ to the _content_ and is per post. Two
   mechanisms, two questions, and neither substitutes for the other.
3. **A copy is a chain, not a replacement.** A receiving room stores
   `{postKey, contentHash, signatures: [author, ...copiers], copiedFrom}`. The head is the first
   signer and is what "who said it first" means. Verification is offline: a reader needs the keys in
   the chain and the canonical form, and nothing else.
4. **Re-encryption changes the ciphertext and must not change the chain.** A room that receives a
   post decrypts under the source epoch, re-encrypts under its own, and writes the same signatures
   beside the new ciphertext. A client that cannot verify the head still shows the content and marks
   it unattributed - which is exactly RFC-0015's `signature: null` case.
5. **What survives is attribution, not the name.** The chain names keys. A display name is a
   room-scoped label (RFC-0036) and does not travel, so a published card shows the fingerprint
   prefix derived from the head's key.
6. **A copier signs the act of copying, not the content.** The second signature says "I received
   this under `postKey` and re-encrypted it", so a copy whose content does not match the head's hash
   is a copier's lie and is detectable without reading the content.
7. **An edited copy is a fork, and a fork has a new head.** Content edited in transit produces a
   `postKey` that no longer matches the original; the copier's signature becomes a head of its own
   and the original attribution becomes a reference (RFC-0059 §3's quote rule). The system never
   presents an edit as the original's words.

## Context

RFC-0013 §Authorship makes a post's author the identity whose subkey signed the canonical envelope
header and says the content hash alone proves nothing. RFC-0021 makes an observation name its
observer. Neither says what a signature covers when the bytes beside it are re-encrypted, and
RFC-0013's header includes the room and the epoch - both of which change on a copy, so a signature
over that header cannot travel.

The mechanism is forced by the cipher rather than chosen. AES-GCM with `additionalData` set to the
envelope header means a ciphertext is valid only in the context it was made in, so a copy must be a
new ciphertext with a new AAD, and any attribution riding on the old ciphertext dies with it.
RFC-0015 already anticipates the gap by writing `signature: null` for foreign rows and calling them
not locally authored; that is the degenerate chain, and this record generalises it.

Nothing signs anything today. `grep -rln "signature" Maintain/Source/` prints nothing, and the
`post` table in `Maintain/Spacetime/spacetimedb/src/Schema.ts:14-44` has no signature column - its
`text` field is the plaintext the module currently stores, so the projection is the party that would
have to verify and cannot.

## Alternatives considered

| Option                                                 | Why not chosen                                                                                                             |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Sign the ciphertext                                    | the signature dies on the first copy, which is the case it exists for                                                      |
| Sign the full envelope header including room and epoch | the same failure one layer down: the room changes on a copy                                                                |
| Let the receiving room vouch for the author            | a room's authority is not a witness to authorship, and RFC-0013 makes trust per room, so its word means nothing outside it |
| Carry the author's certificate instead of a signature  | a certificate names a key, not a post: it says the person is who they are, not that they wrote this                        |
| Verify by re-fetching from the origin room             | requires the origin to exist, which is the coupling RFC-0005 and RFC-0015 exist to remove                                  |
| Trust the content hash as attribution                  | RFC-0013 already refuses it - anyone can hash anyone's text                                                                |
| Sign the plaintext plus the receiving room's epoch     | it would bind the attribution to one copy again, and a room that re-keyed would invalidate its own archive                 |

## Consequences

- Every post carries a signature over a canonical form, so client and module must agree the
  serialisation or every verification fails - the risk RFC-0013 already accepts for
  `additionalData`, now at a second place.
- A chain grows with copies, so a widely copied post carries a list of keys: bounded in practice by
  how many rooms hold it, unbounded in principle.
- "Who said it first" is answerable offline and only as far as the chain reaches. A copy that lost
  its head is unattributed, and the client must say so rather than guess.
- A published card can show a fingerprint that survives the room's death (RFC-0036 §4), which is the
  property the static site needs.
- A copier who edits and re-signs is visible as a fork, which turns a quiet rewrite into a recorded
  act.

## Verification

| Claim                               | Test                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A signature survives a copy         | copy a post into a second fixture room, re-encrypted; the head signature verifies against the plaintext canonical form (intent)     |
| A signature does not cover the room | change the room field in the copy's envelope; the head signature still verifies (intent)                                            |
| A relabelled ciphertext fails       | flip the audience field of a stored ciphertext; AES-GCM fails on `additionalData` (RFC-0013's existing row)                         |
| An unattributed row says so         | import an RFC-0015 row with `signature: null`; the client renders it unattributed and shows no fingerprint (intent)                 |
| A copier cannot alter content       | copy a post, change one byte of plaintext, keep the head: verification fails and the copier's signature does not repair it (intent) |
| An edit is a fork                   | edit in transit and sign; a new head exists and the original is a reference, not an attribution (intent)                            |

## Open questions

- Whether the canonical form should be JSON with sorted keys or a binary encoding. Both are
  checkable; JSON is readable and one more place for a serialiser to differ.
- Whether a copy should re-sign at all, or only when the copier changed something. Re-signing every
  copy makes the chain an inventory of who holds what, which is a privacy cost the record accepts
  without measuring.
- Whether a room should be able to strip a chain down to its head, so a post's provenance does not
  become a membership list of other rooms.
- UNKNOWN whether the client's WebCrypto path can verify an Ed25519 signature the module produced,
  or whether both sides must share one primitive. RFC-0013 fixes AES-GCM for content and names no
  signature algorithm. Spike: verify a module-produced signature in the target browser.

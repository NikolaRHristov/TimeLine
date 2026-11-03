# RFC-0013 - Identity, keys and certificate authorities

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the client keystore,
the module's key tables, invitations, revocation **Kind:** policy **Subject:** identity **Horizon:**
next **Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0007 (encryption and
the envelope; this record closes its key-custody questions), RFC-0005 (membership is per room),
RFC-0012 (widening needs a signature), RFC-0011 (key material is a configuration term); implementing
card to be created: "Identity, key epochs and room authorities"

## Decision

An identity is a keypair plus a display name. The private key never leaves the client; a room stores
public keys only.

**Devices.** One identity, many devices: each device holds a subkey, and the identity key signs a
subkey certificate `{identity, subkey, label, notBefore, notAfter}`. A device can be retired without
retiring the identity, and a retired subkey cannot sign a new write.

**Message keys.** A room has a content key per epoch, `CK_e`. A message key is derived, not stored:
`MK = HKDF-SHA256(CK_e, postId, nonce)`. Content is AES-GCM-256 with a random 96-bit IV and
`additionalData` set to the canonical envelope header - room, author, audience, content hash,
epoch - so a ciphertext cannot be re-labelled to another audience or another author without failing
to decrypt. This is the WebCrypto shape already implemented in the `NowPlayingCard` project's
`Common/Source/Function/Encrypt.ts`: a JWK imported with `subtle.importKey`, AES-GCM, a fresh IV per
message.

`CK_e` reaches a member wrapped to that member's public key. The wrap is X25519 + HKDF-SHA256 +
AES-GCM, and it is the one place a second primitive enters the system.

**Rotation.** A subkey rotates on a schedule (90 days) or on suspicion. The room's `CK` rotates on
revocation, because a removed member holds the current epoch. Rotation is a new epoch row with a
`notBefore`; old epochs stay readable to members who still hold them and are never re-issued.

**Recovery.** The identity key is the only recovery path, so it is stored offline as an encoded
recovery secret. There is no server-side escrow by default: a lost identity key loses every room at
once, and that is stated rather than softened. A room may configure an **escrow holder**, which
holds epochs wrapped to its own key; that is the only sanctioned way a room outlives the loss of
every member's key, and it means the holder can read the room.

**Certificate authority.** A certificate authority in this system is a room-scoped signer: a key
plus a membership row carrying the `authority` role. Its certificate is a signed statement
`{room, identity, publicKey, notBefore, notAfter, epoch}`. Trust is per room and never global - a
certificate issued in room A is not evidence in room B - because membership is per database
(RFC-0005) and a global root would reintroduce exactly the single point of failure the room boundary
exists to remove.

**Authorship.** A post's author is the identity whose subkey signed the canonical envelope header.
The content hash alone proves nothing: it proves the bytes were not altered, not who wrote them.

## Context

RFC-0007 leaves three things open and states the cost of leaving them open: where keys live, whether
the content hash is enough to prove authorship, and whether keys are per room or per person. This
record answers all three - the client, no, and per room per epoch.

Nothing of the kind exists today. The module has no key material: identity is `ctx.sender`, a
connection identity, and no reducer inspects it.
`grep -c "ctx.sender" Maintain/Spacetime/spacetimedb/src/index.ts` prints 0, so a post is attributed
to whatever string the caller passed as `authorHandle`. The claim in RFC-0007 that the provider
cannot read user data is therefore true only of the eventual ciphertext, not of the current rows,
which are plaintext.

RFC-0007 also fixes the primitive (AES-GCM, per-message random IV, JWK key import) against working
code in a sibling repository. This record adds the key hierarchy around that primitive rather than
choosing a different one.

## Alternatives considered

| Option                                       | Why not chosen                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| One key per person for every room            | one revocation breaks every room, and a member of two rooms can correlate ciphertext across them                        |
| One key per message, stored per message      | no rotation story, and key material grows with the archive                                                              |
| A server-held room key                       | the host can read, so the privacy claim becomes marketing                                                               |
| A global PKI or public certificate authority | one root to compromise, and a room cannot leave it                                                                      |
| Content hash as proof of authorship          | a hash proves integrity, not authorship; anyone can hash anyone's text                                                  |
| Escrow by default                            | it converts "the host cannot read" into "the host cannot read unless you ask it to", which is a different product claim |

## Consequences

- A new member cannot read history until the epoch is wrapped for them. Joining does not grant
  history; the authority decides whether to wrap past epochs.
- Revocation is effective only for future epochs. A removed member keeps what they already
  decrypted. This is a property of the design, not a bug to be discovered later.
- The client needs a keystore with a passphrase and a recovery secret, which is the first thing the
  product asks of a person that a password manager cannot do for them.
- Every write carries a signature, so every reducer verifies one (RFC-0020), and a canonical
  serialization must be agreed by client and module - a divergence there is an outage, not a bug.
- A room with an escrow holder cannot claim provider blindness against that holder.

## Verification

| Claim                                    | Test                                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| No private key reaches the store         | `grep -rl "privateKey" Maintain/Storage/ Source/Content/` prints nothing                                                           |
| A message needs the room key             | decrypt a stored row with the room key in a unit test under `Maintain/Source/Test`; decrypt without it and expect failure (intent) |
| The envelope header is authenticated     | flip the audience field of a stored envelope and decrypt: AES-GCM fails on `additionalData` (intent)                               |
| Rotation is a new epoch                  | revoke a member, then `select max(epoch) from key_epoch` increases and the next post carries the new epoch (intent)                |
| A removed member cannot read a new epoch | two clients, revoke one, post from the other, the revoked client cannot decrypt (intent)                                           |
| Trust does not cross rooms               | a certificate issued in room A is rejected by room B's `grant` reducer (intent)                                                    |
| Authorship is a signature                | a post whose signature does not verify is rejected by the module (intent)                                                          |
| A retired subkey cannot sign             | sign with a subkey past `notAfter`: rejected (intent)                                                                              |

## Open questions

- Whether the engine exposes an identity-to-public-key mapping a module can read, or whether the
  public key must be a column the client writes - and therefore a value a client can lie about until
  the room authority certifies it. UNKNOWN; spike: a local module that stores a key row in one
  reducer and reads it back in another, plus `spacetime describe <room> reducers`.
- Whether X25519 is available in every browser the site targets (`crypto.subtle.deriveBits` with
  X25519 is recent). UNKNOWN; spike: feature-detect in the target browser and record the result
  before the wrap algorithm is fixed.
- Whether an escrow holder should be expressible at all, given what it does to the privacy claim.
  The record permits it and RFC-0020 lists the consequence.

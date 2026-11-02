# RFC-0007 - Privacy, encryption and the validation boundary

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the module, the
client, export, hosting **Decision class:** policy **Supersedes:** none **Superseded by:** none
**Task dependencies:** RFC-0001, RFC-0005

## Decision

Payloads are encrypted by the client before they reach the database. The service validates **shape**
and never **content**.

| Layer  | Can check                                                | Cannot check                   |
| ------ | -------------------------------------------------------- | ------------------------------ |
| Client | everything - it holds the key                            | whether the server accepted it |
| Module | identity, membership, size, schema of the envelope, rate | what the payload says          |
| Host   | traffic volume, timing, room membership                  | payload contents               |

The envelope carries the audience decision, the author identity, a content hash and the ciphertext.
Encryption is AES-GCM with a per-message random IV and key material imported as a JWK, following the
pattern already implemented in
`~/Developer/Application/NowPlayingCard/Common/Source/Function/Encrypt.ts`.

## Context

The claim that a provider cannot read user data is only true if the provider never holds plaintext,
which means server-side validation of _content_ is off the table. That is a real cost and it should
be stated rather than discovered: a rating outside its range, a comment containing something
disallowed, a payload that is not what it claims to be - none of these can be caught centrally.

What can still be enforced centrally is the envelope: who may write to a room, how large a payload
may be, how often an identity may write, and whether the declared content hash matches the
ciphertext. Those are the checks that keep a hosted network from being trivially abused.

## Alternatives considered

| Option                                     | Why not chosen                                            |
| ------------------------------------------ | --------------------------------------------------------- |
| Plaintext with server-side moderation      | contradicts the provider-blindness claim                  |
| Encryption with a server-held key          | the provider can read, so the claim is marketing          |
| Client-side checks only, no envelope rules | no rate limiting, no size limit, no abuse surface control |

## Consequences

- Moderation becomes a client and community function; the host can only act on volume and
  membership.
- Key loss is data loss. Key custody, rotation and recovery need their own design.
- Export must include the keys, or the exit guarantee is void.

## Verification

| Claim                      | Test                                                          |
| -------------------------- | ------------------------------------------------------------- |
| The host sees no plaintext | a stored row's payload does not contain the submitted text    |
| Envelope rules still bite  | an oversized payload is rejected by the module                |
| Author identity is bound   | a payload signed by one identity cannot be written as another |
| Export is readable offline | export plus key decrypts without the server                   |

## Open questions

- Where keys live on the client and how a person recovers them.
- Whether the content hash is enough to prove authorship, or a signature is required.
- Whether per-room keys or per-person keys - this decides how revocation works.

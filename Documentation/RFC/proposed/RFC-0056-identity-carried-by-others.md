---
title: Identity carried by others
rfc: 0056
category: Policy/Identity
kind: rfc
date: 2026-11-02
status: proposed
horizon: later
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: the identity model, attestations, guardianship, recovery, cross-network sign-in
supersedes: none
superseded_by: none
depends:
    - RFC-0013 (identity, keys and certificate authorities)
    - RFC-0019 (vocabulary)
    - RFC-0020 (the trust model)
    - RFC-0023 (delegation of custody)
    - RFC-0026 (peer-carried transport)
    - RFC-0038 (what the operator owes)
    - RFC-0047 (the swimlanes)
    - RFC-0055 (the provider position)
statuses:
    - name: Nobody else ever holds the private key
      state: open
      evidence: the rule names no file or command
    - name: Others carry attestations, not secrets
      state: open
      evidence: the rule names no file or command
    - name: Relaying is a challenge, never a credential
      state: open
      evidence: the rule names no file or command
    - name: Guardianship is a threshold over rotations, nothing else
      state: open
      evidence: the rule names no file or command
    - name: The identifier is derived from the key, so it travels
      state: open
      evidence: the rule names no file or command
    - name: The operator is never the identity provider
      state: open
      evidence: the rule names no file or command
---

## Decision

A person's identity is a key pair they hold. Other people may **attest** to it, **relay** it, and
**recover** it - and may never hold it.

That distinction is the whole record. The network carries what you send (RFC-0026) and the operator
carries the network without reading it (RFC-0055); the same posture applies one layer up, and it
applies with one addition: a carrier of identity must not be able to _become_ you.

Six rules make that enforceable.

### 1. Nobody else ever holds the private key

Not a peer, not a guardian, not the operator, not a recovery service. A model where another party
can sign as you is a model where "your data is yours" is false, whatever the marketing says.

This rule is what makes every other rule in this record a _supporting_ mechanism rather than a
custodial one. It also settles the hardest question in advance: there is no escrow, so there is no
escrow breach.

### 2. Others carry attestations, not secrets

A peer can sign a statement about your key:

```
{ subject: <your key fingerprint>, claim: "handle @you", since: <time>, issuer: <their key>, expires: <time> }
```

That is a verifiable credential. It is checkable offline, it survives the issuer going away until it
expires, and it grants the issuer nothing. A third network that trusts the issuer can accept it
without ever talking to the issuer or to the operator.

**Carrying an identity means carrying a signature about it.** A signature is not a secret; copying
it a thousand times changes nothing.

### 3. Relaying is a challenge, never a credential

When a peer acts as your **identity carrier** - you are signing in on a device with no key, through
a peer that has one - the exchange is:

1. the target network issues a challenge;
2. the peer forwards it to you;
3. **you** sign it;
4. the peer forwards the signature.

The peer relays bytes. It cannot produce the signature, cannot replay an old one (the challenge is
fresh), and cannot substitute its own key because the signature names the challenge and the target.

A peer that instead _stores a token that authenticates as you_ has broken rule 1 in effect even if
it never saw the key: a bearer token is a key with extra steps.

### 4. Guardianship is a threshold over rotations, nothing else

Recovery is the one place where identity genuinely needs other people, because a lost key with no
escrow is a lost identity. The mechanism is a guardian set: `n` people you choose, of whom any `k`
can authorise exactly one operation - **a key rotation**.

- A guardian holds a share, never the key and never a signing capability for anything else.
- `k of n` is the threshold; a single guardian acting alone is a failed rotation, not a recovery.
- The rotation is a signed statement published where your attestations live, with a monotonic
  counter, so a stale rotation cannot be replayed.
- Guardians cannot rotate to a key they hold, because rule 1 applies to them too: the new key is
  proved by signing with it.

This is the only mechanism in this record that can _change_ who you are, which is why it is the most
constrained one.

### 5. The identifier is derived from the key, so it travels

Your identifier is a function of your public key, not an account number issued by a network. Leaving
a network changes nothing about who you are: the attestations you collected travel with you, the
network keeps only what it published under its own authority, and the next network can verify the
same credentials without asking the last one.

An identifier issued by a network makes the network the identity provider by accident. That is the
failure this rule prevents, and it is the standard shape of every "sign in with" that ends in
lock-in.

### 6. The operator is never the identity provider

The operator may host attestations, may relay challenges, and may run a directory. It may not be the
only party who can say who you are, and it must not be able to refuse your existence: a network that
cannot verify you without the operator has made the operator an authority it promised not to be.

Concretely: every attestation is verifiable from the keys and the published set alone, with no call
to the operator. The operator's own attestations are marked as the operator's, expire, and are worth
exactly what a reader decides they are worth.

## Context

RFC-0013 defines the key. RFC-0023 lets custody of a _record_ be delegated. Neither says what
happens when a person has more than one device, loses one, or wants a peer to vouch for them - and
every real network needs all three.

The tempting answer is a hosted identity service, which is what every other product does. It is also
incompatible with RFC-0055: an operator that cannot read your content but can impersonate you has
simply moved the trust boundary, not removed it.

## Alternatives considered

**Delegated signing keys (a peer signs on your behalf).** Rejected on rule 1: a delegated key is
your identity with a shorter life, and the delegate becomes a single point of impersonation.

**Social recovery with a shared secret.** Rejected: shares of the key are still the key. The
threshold must be over an _operation_, not over a secret.

**Sign in with the operator.** Rejected on rule 6, and it is the pattern this record exists to
refuse.

**No recovery at all.** Rejected as inhumane: a lost key would end an archive. Rule 4 is the
smallest mechanism that fixes it without escrow.

## Consequences

- A person must understand that their guardians can rotate their key but cannot become them. That is
  a sentence the product has to say plainly.
- Attestations expire, so a network must tolerate an issuer that has gone quiet. An expired
  attestation is not a revoked one.
- A stable key is correlatable across networks. That is a privacy cost of federation and it is real:
  the alternative is a per-network identifier, which reintroduces lock-in.
- Recovery is a social attack surface. The threshold, the counter and the prove-the-new-key rule are
  the mitigations, and they are the reason this record is a policy record rather than an
  architecture one.

## Verification

| Claim                               | Test                                                                 |
| ----------------------------------- | -------------------------------------------------------------------- |
| No party holds the key              | the protocol has no message carrying a private key or a bearer token |
| An attestation is offline-checkable | a verifier with no network access accepts a valid credential         |
| A relay cannot impersonate          | a captured relay transcript replayed against a fresh challenge fails |
| A rotation needs the threshold      | `k-1` guardian shares produce no valid rotation                      |
| The operator is not required        | verification succeeds with every operator endpoint unreachable       |

## Open questions

- Whether the identifier should be a raw key fingerprint or a hash with a derivation path, so a key
  rotation can keep the identifier stable. The current answer is the latter, which makes rotation
  invisible to readers and is why the counter exists.
- How many guardians is enough. Three of five is the working assumption and it is a social question,
  not a protocol one.
- Whether attestations should be revocable by their issuer, and what a reader does with a credential
  whose issuer has disappeared.

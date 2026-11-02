# RFC-0020 - Trust and security model

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the module, the host,
the client keystore, module rollouts **Decision class:** policy **Supersedes:** none **Superseded
by:** none **Task dependencies:** RFC-0007 (encryption and the validation boundary), RFC-0013 (keys,
epochs and room authorities), RFC-0012 (audiences), RFC-0014 (grants and revocation), RFC-0016
(rollout and what the host observes); t_1621cc5c (substrate research); implementing card to be
created: "Reducer authorization: signature verification, nonce, rate and module pinning"

## Decision

The system states what it assumes, what it defends, and what it does not. A defence that is not
listed here is not claimed.

### Assumed

1. **The client is honest and holds the keys.** Its keystore is the perimeter; a compromised client
   is outside this model.
2. **The module is trusted code, and it is reachable by any connected client.** Every reducer must
   authorize its own caller - the engine does not do it for the module.
3. **The host is honest-but-curious.** It runs the module and observes traffic; it never holds
   plaintext (RFC-0007).
4. **The engine is not assumed flawless.** A published advisory is treated as a live threat against
   the version in use until a spike either reproduces it or clears it.

### Defended

| Threat                                                                                                                                                       | Defence                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forged authorship                                                                                                                                            | every write carries a signature by the author's subkey over the canonical envelope header; `ctx.sender` binds a connection, never authorship (RFC-0013)                                        |
| Identity impersonation of the class in the v2.11.0 release notes - an identity is impersonable when a token's subject and issuer are known; fixed in v2.10.0 | `ctx.sender` is never the sole authority for a write; the signature is verified in the module, and each room records the module version it runs so it can refuse a build carrying a known flaw |
| Replay of a captured write                                                                                                                                   | a per-post nonce and a bounded timestamp window; a second identical envelope is rejected                                                                                                       |
| Unauthorized widening of an audience                                                                                                                         | a new audience requires the author's signature (RFC-0012)                                                                                                                                      |
| Key substitution                                                                                                                                             | a member's public key must be certified by the room's authority before an epoch is wrapped to it (RFC-0013)                                                                                    |
| The host reading content                                                                                                                                     | client-side AES-GCM with the key never sent (RFC-0007)                                                                                                                                         |
| One bad module reaching every room                                                                                                                           | staged rollout, per-room version, health view, abort on first failure (RFC-0016)                                                                                                               |
| Unbounded writes                                                                                                                                             | envelope size, per-identity rate and per-room quota - the only content-adjacent checks a blind host can make                                                                                   |

### Not defended

- **Traffic analysis.** The host sees who talks to whom, when, and how much.
- **A reader who republishes what they were granted.** A federated copy is outside the sender's
  control (RFC-0012), and an export is a copy by design (RFC-0015).
- **A malicious or compromised room authority.** It certifies keys, so it can certify a key it
  holds.
- **Denial of service by a member inside the published rate.**
- **A compromised engine binary, or a flaw the engine has not published.**
- **Content moderation.** The host cannot read content and therefore cannot police it (RFC-0007).
- **Escrow.** A room that configures an escrow holder (RFC-0013) has chosen a party that can read
  it.

## The concrete gap

The module authorizes nothing. Every reducer acts on behalf of whoever called it:

- `setVisibility` (index.ts:227-234) updates any post by id to any string, from any caller.
- `classify` (index.ts:237-263) writes any membership row, from any caller.
- `observe` and `record` (index.ts:128, 206) accept any identity, any timestamp and any payload.

All six tables are declared `public: true`, and `ctx.sender` appears zero times in the module:

```sh
grep -c "ctx.sender" Maintain/Spacetime/spacetimedb/src/index.ts   # 0
grep -c "public: true" Maintain/Spacetime/spacetimedb/src/index.ts # 6
```

The flaw is documented rather than rumoured. The v2.11.0 release notes carry a security notice: an
attacker who knew a token's subject and issuer could impersonate the corresponding Identity; the
patch shipped on September 4 in v2.10.0, upgrading the JWT authentication library (PR #5866), and
the notice recommends v2.10.0 or later. The tool and library in this tree are 2.14.0 -
`spacetime --version` prints `spacetimedb tool version 2.14.0; spacetimedb-lib version 2.14.0` - so
that flaw is behind it. What survives the fix is the lesson: a connection identity is a claim about
a token, so a write needs a signature of its own.

The same release note makes one capability visible: `spacetime describe` now prints "row-level
security rules" alongside tables, reducers and constraints (PR #5947). RFC-0005 records the
mechanism the module uses - a per-user view keyed on `ctx.sender`, plus a client visibility filter
declared as SQL over the subscribed table - so visibility is enforced at delivery rather than
filtered afterwards. What that does not buy is authorization of a write: a view decides who reads a
row, not who may write one, which is why the reducer still verifies a signature.

There is no signature, no nonce, no rate and no grant. This matters for the v2.11.0 class of flaw in
a specific way: the module would be exploitable even if the engine were perfect. The engine flaw
makes it worse - it removes the one property the module was implicitly relying on, that `ctx.sender`
is the caller - but it is not the reason the module is unprotected.

A room's module version is recorded (RFC-0016) so that a room whose authority requires a fixed
minimum can refuse a downgrade to a build with a known flaw.

## Context

RFC-0007 draws the validation boundary and states that the service validates shape and never
content. It does not say who may write. RFC-0013 gives a write a signature; this record says the
module must check it. The v2.11.0 flaw is why the check cannot be "compare `ctx.sender` to the
author column" - if an identity could be impersonated when subject and issuer were known, then the
connection's identity is evidence, not proof.

The threat model is written down because the alternative is discovering it: a product that claims
provider blindness and forgery resistance has to say which of the two it actually delivers, and
under what assumptions.

## Alternatives considered

| Option                                      | Why not chosen                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Trust `ctx.sender` and skip signatures      | one engine flaw and authorship is forgeable; and the module would still have no authorization at all            |
| Sign in the module rather than the client   | the module runs on the host, holds no key the client does not, and the host is the party being defended against |
| No rate limits                              | one member can fill a room, and the host's only lever is deletion                                               |
| Host-side moderation                        | requires plaintext, contradicting RFC-0007                                                                      |
| Assume the engine is secure and pin nothing | the version in use is then invisible, and a known flaw cannot be refused                                        |
| Encrypt the envelope header too             | the module needs the audience and the author to enforce anything at all                                         |

## Consequences

- Every reducer gains a verification step, and client and module must agree on one canonical
  serialization. A divergence there is an outage, not a bug.
- Signatures cost CPU per write, and the nonce window needs a clock tolerance that a device with a
  wrong clock will hit.
- Rate limiting needs a counter per identity, and that counter is itself a write - the counter
  becomes part of the attack surface it exists to bound.
- "Not defended" is now a written refusal: a leak by a reader cannot later be called a bug.
- Pinning a module version means a room can be stuck on an old build by its authority, which is a
  governance question the record does not answer.

## Verification

| Claim                                   | Test                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| The module authorizes                   | `spacetime call <room> set_visibility '"<post>"' '"public"'` from a second identity errors and the row is unchanged (intent)                |
| Replay is rejected                      | submit the same envelope twice: the second call errors and `select count(*) from post` is unchanged (intent)                                |
| Impersonation is rejected               | a call whose signature names another identity is refused (intent)                                                                           |
| The caller is never the only authority  | `grep -c "verifySignature" Maintain/Spacetime/spacetimedb/src/index.ts` is greater than 0 (intent)                                          |
| No plaintext at rest                    | `spacetime sql <room> "select text from post limit 1"` returns base64 ciphertext (intent, RFC-0007)                                         |
| The version is pinned per room          | `spacetime describe <room> --json \| jq -r .module.version` equals the version the authority requires (intent, RFC-0016)                    |
| The advisory is mapped, not paraphrased | `Documentation/Reference/Security.md` records the reproduction attempt against 2.9.0 and 2.14.0 (intent; the citation itself is in Context) |

## Open questions

- **What the v2.11.0 flaw leaves open.** The release notes state the flaw and the fix: an attacker
  who knew a token's subject and issuer could impersonate the corresponding Identity, and the patch
  shipped on September 4 in v2.10.0 as an upgrade of the JWT authentication library (PR #5866).
  Which provider paths were reachable, and whether a token from an issuer the engine trusts is still
  accepted with a chosen subject, are UNKNOWN. Spike: attempt the reproduction against a local
  server on 2.9.0 and again on 2.14.0, and record both outcomes in
  `Documentation/Reference/Security.md`.
- **Whether a module can read the connection's issuer and subject claims at all.** If it cannot, the
  module cannot detect this class itself and signatures are the only defence. UNKNOWN; spike: a
  local module that logs whatever the reducer context exposes about the caller, plus
  `spacetime describe <room> reducers`.
- **Whether a per-identity rate counter can live in a table without becoming the denial-of-service
  vector**, since writing the counter is itself an unauthenticated write until the signature check
  passes.
- **Whether the host should be able to suspend a room** (RFC-0016's side state) and what that means
  for a member's export right. A suspended room must still export; the record assumes it does.

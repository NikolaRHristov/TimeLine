# RFC-0032 - Rate limiting and abuse resistance

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the action gateway's
envelope checks, ingestion backpressure, invitation cost **Kind:** policy **Subject:** transport
**Horizon:** next **Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0024 §4
(the gateway validates rate and quota), RFC-0020 (rate is the only content-adjacent check a blind
host has), RFC-0004 (ingestion is scheduled work), RFC-0014 (an invitation expires and has a use
bound); implementing card to be created: "Quota and invite-ledger rows"

## Decision

Every limit is an envelope check with a named refusal, an identity costs nothing to mint and
something to admit, and the invitation is where the cost sits.

1. **Two dimensions, one gate, envelope fields only.** A per-identity rate and a per-room quota are
   checked in the gateway beside signature, nonce, replay window and size (RFC-0024 §4). Both are
   computed from the envelope - count over a window, bytes over a window - because a blind module
   has nothing else to count (RFC-0020). The numbers are configuration terms (RFC-0011), scoped
   `room`, with the host's own ceiling above them and a validation rule that refuses a room setting
   above it.
2. **Backpressure is applied to the job, never to the person.** Ingestion is scheduled work
   (RFC-0004): a harvest job over its budget is simply not claimed, and the lag between the newest
   observation and the newest source change is the metric that says so (RFC-0021 §5's completeness
   number). A person's write is never queued behind a scrape, because a scrape is a job with an
   owner and a write is a person waiting.
3. **An identity is free; admission is not.** A keypair is minted offline in a second, so an
   identity-keyed limit alone is a speed bump against a sybil - it changes the cost from zero to
   near-zero. The real cost is membership: an invitation is signed by the room's authority
   (RFC-0014), and a membership row is a metered row the host prices (RFC-0039 §6). A sybil
   therefore pays one real invitation and one real membership slot per identity, per room, per
   month.
4. **An invitation is not free in three separate ways.** It expires (RFC-0014's `expiresAt`), it is
   bounded by `maxUses`, and it draws on the inviter's allowance - a member's invite count is a
   number in the room's configuration, not unlimited. A member burning invites to grow a farm loses
   the allowance and leaves a ledger a room can read.
5. **A room's quota is the room's bill, and exhaustion degrades.** The quota is the host's unit
   model (RFC-0016 §1) applied to a room; at exhaustion the room becomes read-only rather than
   dropping rows or truncating content, because a room that deletes to fit a bill has destroyed
   something the bill was supposed to price (RFC-0039 §5).
6. **A refusal is a named code carrying the dimension and the window.** `rate-limited`,
   `quota-exhausted`, `invite-spent`, `invite-expired`, each with the identity or room, the window
   and the limit that was hit. RFC-0024 §7 requires a refused action to say why by name; this record
   fixes the vocabulary so a client can retry intelligently instead of guessing.
7. **What this does not defend is stated.** A member inside their allowance can flood a room with
   garbage, and the host cannot read it to tell garbage from gold - RFC-0020 lists denial of service
   inside the published rate as not defended, and this record does not narrow that. Volume is
   defended; meaning is not, and a room's answer to meaning is moderation (RFC-0031), not a quota.

## Context

The specification asks for abuse resistance in a system where the abuser's content is unreadable.
The envelope is the only surface, and RFC-0007's field table already enumerates what it carries:
identity, audience, action class and target, timestamp, nonce, size and signature. Rate and quota
are derived from four of those columns, which is why they can be checked in the same transaction
that admits the write.

The engine offers no built-in rate limiter, but the registry page the README records lists a Rate
Limit module among its composable libraries, and RFC-0025 §3 already decides that a room's module is
composed from reviewed libraries. So the mechanism has a home; what this record decides is the
policy and the accounting, not the implementation.

Sybil cost is the part that cannot be solved with a counter. The engine's `Identity` is
`ctx.sender`, a long-lived unique identifier minted by the client's key (`AGENTS.md` identity
section) - free, offline, unlimited. A defence built on identities alone is defeated by a loop. The
defence built on invitations is defeated only by spending what an invitation costs, which is why
rule 3 puts the cost there and RFC-0039 prices a membership row.

## Alternatives considered

| Option                                      | Why not chosen                                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Proof-of-work per write                     | prices every honest write to slow an attacker who can parallelise; a phone pays it too                                                   |
| A paid identity                             | turns the identity into a purchase and makes leaving expensive, against RFC-0027 §6's free exit                                          |
| Captcha at join                             | requires a service that reads the joiner, and it does not scale to a room the host cannot inspect                                        |
| Rate limiting by IP                         | the host sees connections, not people; a room behind a shared address is punished together (RFC-0016 §4's enumeration is per connection) |
| Trust score per member                      | a score needs behaviour it can read, and the host can read none of it                                                                    |
| Free invitations with a per-room member cap | caps the room but not the churn: a sybil joins, is removed, rejoins; the invite ledger is what makes churn visible                       |

## Consequences

- A room's growth is gated by its members' invite allowances, so a room cannot go viral without an
  authority deciding to widen the allowance. That is a deliberate ceiling on the product's growth
  and the price of the sybil defence.
- Invite scarcity makes invitations valuable, which creates a secondary market in them. The ledger
  makes that visible; it does not prevent it.
- Quota exhaustion as read-only means a room can be alive, readable and frozen. Members can export
  (RFC-0015) and migrate (RFC-0033), so the freeze is not a hostage situation, which is the property
  RFC-0027 §6 requires.
- The refusal vocabulary becomes part of the client protocol, so adding a dimension later is a
  protocol version change (RFC-0034) rather than a new string.

## Verification

| Claim                                        | Test                                                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate is checked before the write             | submit past the per-identity limit from one identity; the row count is unchanged and the refusal reads `rate-limited` with the window (intent)                                  |
| Quota exhaustion freezes rather than deletes | fill a fixture room to its quota; writes refuse, reads return every prior row, and the export still completes (intent)                                                          |
| An invitation is bounded and expiring        | accept an invitation `maxUses + 1` times, and accept another after `expiresAt`; both refuse with `invite-spent` and `invite-expired` (RFC-0014)                                 |
| The invite ledger is readable                | `spacetime sql <room> "SELECT issuer FROM invite"` returns one row per invitation and the count per issuer is aggregated client-side, since the engine has no GROUP BY (intent) |
| A harvest job over budget is not claimed     | set a job's budget below its selector's size; the worker skips it and the completeness number for that identity drops (RFC-0021 §5, RFC-0004)                                   |
| A room cannot set a quota above the host     | write a quota term above the host ceiling in a probe room; `config show` reports the validation code (RFC-0011)                                                                 |

## Open questions

- Whether the per-identity rate should be per connection or per identity. One identity may hold
  several connections (multiple tabs, devices - `AGENTS.md` context API), and a per-connection limit
  lets one person multiply their allowance by opening tabs. Per identity is the safer reading and
  costs a shared-account household.
- What an invitation should cost when a room has no paying host - a self-hosted room has no bill to
  put a membership on, so the cost has to be time, allowance or nothing. UNKNOWN, and it decides
  whether a free room can resist a sybil at all.
- Whether a quota should be measured in rows, bytes, or both. Rows are countable by a blind module
  and bytes are what the host pays for; a large ciphertext and a small one are one row each, so the
  two measures disagree and one of them has to be the contract.

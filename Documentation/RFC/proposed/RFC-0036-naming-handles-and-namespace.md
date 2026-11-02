# RFC-0036 - Naming, handles and namespace

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** display names,
certificates, published attribution, room names **Decision class:** governance **Supersedes:** none
**Superseded by:** none **Task dependencies:** RFC-0013 (an identity is a keypair plus a display
name, and a certificate carries the name), RFC-0019 (the glossary is the naming authority), RFC-0017
(published cards), RFC-0023 §3 (publication is a delegation out of the room); implementing card to
be created: "Certificate display fields and the disambiguator"

## Decision

There is no global namespace. A name is a room-scoped label asserted by a certificate, and the
identity is the key.

1. **A name is a label, not an identifier.** RFC-0013 already makes an identity a keypair plus a
   display name. This record fixes the name's scope: per room. A person may be `ana` in one room and
   something else in another, and no collision exists between rooms because no lookup crosses rooms.
2. **A collision resolves by a derived disambiguator, never by first-come.** Within a room, two
   members claiming the same label are both served, each with a disambiguator derived from their
   key. First-come makes a name scarce and squatting profitable; a derived disambiguator costs
   nothing, cannot be gamed by arriving early, and cannot be transferred.
3. **Impersonation is a certificate failure, not a naming failure.** A display name reaches other
   members inside a certificate the room's authority signs (RFC-0013). A client shows a name beside
   its key fingerprint, and shows an uncertified name as uncertified. Impersonation therefore costs
   either the authority's signature or a stolen key - both visible, neither cheap.
4. **Published content carries the fingerprint, not the handle.** A card on the static site
   (RFC-0017) names its author by fingerprint prefix with the display name as a secondary line,
   because the site outlives the room and a handle is a room label. Publication already moves a copy
   out of the room (RFC-0023 §3), so attribution there must be evidence rather than a local label.
5. **A handle is not an address.** No `@name` resolution and no global directory. Federation finds a
   room by its database identity and a member by their public key (RFC-0005, RFC-0013), never by a
   name. A directory would be a global namespace with a lookup table, which is the single point of
   failure RFC-0013's per-room trust exists to avoid.
6. **Renaming is free, recorded, and does not touch a row.** The envelope carries the author's
   identity (RFC-0007's table) and the certificate carries the name, so a rename is a new
   certificate and every past row resolves to the new name at read time. Nothing is rewritten, which
   is the only option available to a system whose rows are ciphertext.
7. **A room's own name is a label too.** The room's identity is its database identity (RFC-0005) and
   its epoch chain (RFC-0033 §1); two rooms may share a name. A client shows the identity prefix
   beside the name, for the same reason a member's name is shown beside a fingerprint.

## Context

The specification asks how impersonation is made expensive. The answer is structural: this system
has no name registry to squat and no directory to poison, so the only impersonation available is a
certificate signed by a room's authority or a stolen key - and RFC-0013 already makes the authority
a room-scoped signer whose certificates are not evidence in another room.

The engine's identity model is a long-lived unique identifier for a user (`AGENTS.md` identity
section) with no display name, no handle and no namespace. A name is therefore purely a client-side
and room-side convention, which is what makes rule 1 a decision rather than a limitation.

The published site is the hard case. A card on a static page has no room to be scoped to, so its
attribution has to survive the room's death. A fingerprint does that; a handle does not, because the
handle is only meaningful inside a room whose certificate issued it.

## Alternatives considered

| Option                                  | Why not chosen                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A global handle registry                | one authority for every identity, which is the single point of failure RFC-0013 refuses; and it is a directory to poison       |
| First-come names inside a room          | makes the name scarce and rewards squatting; the disambiguator costs nothing and cannot be acquired                            |
| Unique names enforced by the module     | the module can compare labels, but a unique constraint makes a name a scarce resource and a removal a rename for everyone else |
| Names inside the encrypted payload      | a name the module cannot read cannot be certified, so an uncertified label is a claim rather than evidence                     |
| Per-contact nicknames as the only names | workable for reading, useless for attribution on a published card or for a member the reader has not met                       |
| Fingerprints as the only display        | unreadable at a glance; a name plus a fingerprint is what a person can use and what an audit can check                         |

## Consequences

- A member has as many names as rooms, and no client can answer "who is this" without a room
  context. That is a cost a person feels the first time they join a second room.
- The disambiguator is derived, so two members with the same label are distinguishable but neither
  is privileged. A room where everyone is named `ana` reads badly and is at least honest.
- The authority's signature becomes load-bearing for something a person reads, not just for
  something a module checks. A room with an absent authority has uncertified names, and clients must
  render that state rather than hide it.
- Fingerprints on published cards make the public site harder to read and impossible to spoof by
  registering a lookalike handle. The trade is deliberate.
- Renaming costs a certificate and nothing else, so a person can change how they appear without
  leaving a trail of rewritten history - and equally without being able to erase what they were
  called when they wrote something.

## Verification

| Claim                                | Test                                                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A name is room-scoped                | read the same identity's certificate in two fixture rooms; the display names differ and neither client resolves across rooms (intent)     |
| A collision is served, not refused   | certify two members with the same label; both are readable and each carries a distinct derived disambiguator (intent)                     |
| An uncertified name is shown as such | write a row signed by a key with no certificate; the client renders the name as uncertified beside the fingerprint (intent)               |
| A published card shows a fingerprint | build the site from a fixture `Source/Content/`; each card's attribution carries a fingerprint prefix (RFC-0017, intent)                  |
| No directory lookup exists           | `grep -ri "resolve\|directory" Maintain/Source` returns no name-resolution path (intent)                                                  |
| A rename rewrites no row             | rename a fixture member and re-read their old rows; every row's envelope is byte-identical and the name is resolved at read time (intent) |

## Open questions

- Whether a room's authority should be able to _refuse_ a display name, and what that power would be
  called. A refusal is a moderation act (RFC-0031) over a label rather than content, and the set has
  no vocabulary for it.
- Whether the disambiguator should be a fingerprint prefix or a word pair. A prefix is checkable
  against the key and unreadable; a word pair is readable and forgeable. Which one a person can
  actually use to spot an impersonation is untested.
- Whether published attribution should be revocable by the author. A card carries a fingerprint, and
  a person who wants their name off the site is asking for a change to content they published under
  RFC-0012 - withdrawal is a narrowing, so the answer is probably yes, but the mechanism is
  undecided.
- Whether an `Identity` can be turned into a verifying key inside a module, which is what lets a
  fingerprint be derived from the key rather than stored beside it. `ctx.sender` is an identity
  (`AGENTS.md` identity section) and whether it carries key material is UNKNOWN. Spike: compare a
  module's view of `ctx.sender` against the client's public key for the same connection.

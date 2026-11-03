# RFC-0038 - Legal posture

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the privacy notice,
access and erasure requests, residency claims, lawful requests, hosting strangers **Kind:** policy
**Subject:** operation **Horizon:** next **Supersedes:** none **Superseded by:** none **Task
dependencies:** RFC-0016 §4 (what the host observes), RFC-0015 (the export is the access answer),
RFC-0028 §4 (erasure is per author), RFC-0013 (no server-side escrow by default), RFC-0031 §4 (the
host's only lever); implementing card to be created: "Privacy notice and the takedown procedure"

## Decision

The operator is a controller of metadata and a processor of ciphertext, and every obligation is
discharged inside that split - stated, priced, and refused where it cannot be met.

1. **Two roles, one document.** Metadata - who, when, how much, which room - is personal data the
   host holds and controls. Payload is ciphertext the host processes and cannot read (RFC-0007). The
   privacy notice states exactly that, and its list of what is held is RFC-0016 §4's enumeration
   verbatim: traffic volume, timing, connection identity, room membership, row counts, envelope
   sizes, module version. A notice that listed fewer fields than the host observes would be
   inaccurate in the one direction that matters.
2. **Access and portability are the export.** RFC-0015's five files answer both: complete for what
   the member held, addressable, machine-readable, and comparable across machines by `rootHash`. A
   member's metadata - memberships, grants, counts - is served from envelope rows, so no second
   subject-access endpoint is needed for the content and none is built for it.
3. **Erasure is per author and cannot reach another person's copy.** RFC-0028 §4 is the operative
   rule. In legal terms: erasure covers the rows the person authored in the rooms they are in, the
   observations they produced, and their local store. A copy delivered to another member, published
   to the static site, or federated is outside the controller's reach, and the notice says so
   plainly rather than implying a recall the cipher cannot perform.
4. **Residency is a residency of ciphertext and metadata, not of content.** A host in a region holds
   ciphertext and metadata there; a member's keys never leave their device (RFC-0013). A residency
   claim is therefore honest about exactly two things - where the ciphertext sits and where the
   metadata sits - and a room that needs its content in a region runs its own host (RFC-0016). A
   claim about content would be a claim about something the host cannot see.
5. **A lawful request receives what the host has, and the answer names the limit.** The host returns
   envelope rows and ciphertext and states that it cannot decrypt. It does not hold, request or
   escrow a key: RFC-0013 refuses server-side escrow by default, and that refusal is the technical
   posture the notice describes. A request that demands plaintext is answered with the escrow fact -
   a room that configured an escrow holder has a party who can read it, and that party is the one to
   ask. This is the single place where the escrow choice becomes a legal exposure, and it is why
   escrow is opt-in and disclosed.
6. **Before hosting strangers, five things must be true.** A published terms and privacy notice
   naming RFC-0016 §4's list; an abuse-report channel that works without reading (RFC-0031 §2's
   report row); an age and jurisdiction policy; a takedown procedure whose only available actions
   are redaction and room suspension (RFC-0031 §4), stated as limited; and a deletion-receipt
   procedure (RFC-0033 §7). Until all five exist, the host hosts known people - and that is a
   schedule, not a promise.
7. **A limitation that is disclosed is the whole defence.** Nothing here is immunity and the notice
   is not a contract against liability. The posture is the same one RFC-0020 applies to security:
   state what is not defended, so a failure is a known gap rather than a broken promise. A claim of
   moderation the host cannot perform would be the one dishonest line in the document.

## Context

The system's privacy claim creates obligations and removes capabilities at the same time. A provider
that cannot read content cannot inspect it, cannot filter it, cannot answer a request about what it
says, and cannot comply with an order to remove a specific passage - it can only remove a whole row
it cannot see, or stop a room. That is not a gap to be papered over; it is the product's stated
position, and RFC-0020 already lists content moderation under _not defended_.

What the host does have is bounded and enumerable. RFC-0016 §4 fixes the list and makes it part of
the contract rather than a policy page that changes quietly, which is what a privacy notice needs: a
list that cannot grow without a decision.

The escrow case is where the legal and the technical collide. RFC-0013 allows a room to configure an
escrow holder and states that the holder can read the room. Legally that is a reader - a processor
with access - and a notice that described the service as unreadable without naming the exception
would be wrong for every room that configured one. The notice therefore has to be per room, or state
the exception.

## Alternatives considered

| Option                                  | Why not chosen                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Describe the service as fully anonymous | the host sees membership, timing and volume (RFC-0016 §4); an anonymous claim would be false in the first sentence              |
| Promise content takedown on request     | the host cannot find the passage, cannot verify the report, and can only remove a row it cannot read - a promise it cannot keep |
| Escrow a key for compliance             | would make every room readable by the provider, which contradicts RFC-0007 and RFC-0020's stated model                          |
| Refuse all lawful requests              | the host does hold metadata and ciphertext and cannot pretend otherwise; the honest answer is to hand over what it has          |
| A single global notice                  | a room with an escrow holder has a different posture from one without, so the notice is per room or it states the exception     |
| Host strangers from launch              | rule 6's five prerequisites are the difference between an operator with a policy and one with a hope                            |

## Consequences

- The notice is a living document tied to RFC-0016 §4, so a new observable field is a notice change
  and therefore a decision with an author - which is the property that makes the enumeration worth
  having.
- A takedown request has a small, honest action set: redact a row, or suspend a room. An operator
  cannot offer a content-level remedy to anyone, and every counterparty learns that on first
  contact.
- Erasure requests will be partially unsatisfiable in exactly the cases people care about most - a
  post that was replied to, published, or federated. The notice has to say so before the request
  arrives.
- Residency is cheap to satisfy and cheap to describe, because the movable parts are ciphertext and
  metadata. That is a genuine advantage of the design and the notice should claim it precisely.
- Hosting strangers is gated on five artifacts rather than a launch date, so the product can be
  demonstrated to known people long before it can be opened.

## Verification

| Claim                                    | Test                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| The notice lists every observed field    | compare the notice's list against RFC-0016 §4's enumeration; no field is missing and none is added (intent, reviewed at each change)     |
| An export answers an access request      | take an RFC-0015 export for a fixture member; it contains every row they authored or were granted and `complete` is stated (intent)      |
| Erasure leaves a tombstone, not a copy   | run the erasure path on a fixture room; the payload is gone and the tombstone carries no plaintext (RFC-0028 §2, intent)                 |
| A lawful request returns ciphertext only | inspect what the host's credential can read: envelope rows and payload bytes, no key material anywhere (RFC-0013, RFC-0022 §4)           |
| An escrow room is disclosed              | a room with an escrow holder shows the holder in its metadata view and the notice names the exception (RFC-0013, intent)                 |
| The five prerequisites are checkable     | each of rule 6's five is a named artifact with an owner; `ls Documentation/` shows the ones that exist and the gap for the rest (intent) |

## Open questions

- Whether a controller that cannot read the data still has a duty to inspect it for illegal content
  in the jurisdictions the service is offered in. UNKNOWN, and it decides whether hosting strangers
  is possible at all - not whether it is comfortable.
- Whether a content hash that matches a known-illegal item counts as actual knowledge. The hash is
  cleartext by design (RFC-0028 §2), so a provider could in principle compare it against a list -
  and doing so would make the provider a filter without ever reading anything. Whether that is a
  duty, a courtesy or a trap is undecided, and it is the sharpest question in this record.
- Whether the deletion receipt of RFC-0033 §7 satisfies a supervisory authority, or whether a host
  has to demonstrate deletion in a way a signed claim cannot.
- Which jurisdiction's law governs a room whose members are in several and whose host is in one. The
  answer is a contract term, and this record does not draft it.

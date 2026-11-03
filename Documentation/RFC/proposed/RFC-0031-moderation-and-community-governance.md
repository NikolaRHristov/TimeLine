# RFC-0031 - Moderation and community governance

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** redaction, member
removal, appeals, the host's response to an abuse report **Kind:** policy **Subject:** network
**Horizon:** next **Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0014
(removal and the `suspended` state), RFC-0027 §3-4 (the operator's powers and non-powers), RFC-0007
(a blind module), RFC-0028 §2 (redaction writes a tombstone); implementing card to be created:
"Report, redaction and appeal rows"

## Decision

A room moderates itself, a host moderates nothing but volume, and every removal is a signed record
that names a reason without needing the content.

1. **Three removal powers with three holders.** An author withdraws or narrows their own post and
   needs no appeal (RFC-0012 rule 1). A room authority removes content from the room's reach and
   removes a member (RFC-0014's `removed` transition), each with a recorded reason. A host suspends
   a room on volume, rate or membership only (RFC-0016 §5), and cannot touch a row.
2. **A redaction is an envelope action against a report.** `redact(targetId, reason, signature)`
   deletes the ciphertext and writes a tombstone (RFC-0028 §2). It is triggered by a report row -
   `{reporter, targetId, category, note}` - which is itself an action record (RFC-0007), so the
   reporter's note is encrypted to the authority while the target, the reporter and the category
   stay in the cleartext header the module must check.
3. **Acting without reading is the honest limit, and it is stated.** The authority sees the target's
   author, audience, size, age and hash, and the reporter's note if the reporter addressed it to
   them. It cannot see whether the content matches the report. Room moderation is therefore
   report-driven, never inspection-driven, and a room that wants inspection has chosen an escrow
   holder (RFC-0013) and must say so - the two cannot both be true and the room picks.
4. **A host asked to act on content it cannot read has exactly one power: it can stop the room.** It
   may suspend the database so members lose writes while reads continue, require the room's
   authority to act within a window, or terminate the room with RFC-0016 §5's export window. It may
   not delete rows, name a member, or demand a key. A request that names content is answered with
   what the host has - envelope rows and ciphertext - and a statement that it cannot read them
   (RFC-0038 §5).
5. **An appeal is a record with a deadline, not a conversation.**
   `appeal{decisionId, from, statement, signature}` is addressed to the authority; when the
   authority is the one who acted, it escalates to the room's founding key holders or a second
   authority role. An unanswered appeal expires into `upheld` with the original reason still
   visible, so silence is a decision that can be read rather than an absence that cannot.
6. **A removal must cite a published rule.** A room publishes its rule set as a versioned row at
   creation; a redaction or removal that cites no rule in the version in force is `procedural` and
   is appealable to the founding holders by default. Changing the rule set is itself a recorded act
   with an author, so a rule cannot be rewritten to fit a decision already made.
7. **Moderation narrows reach; it does not rewrite history.** A removed member's content stays and
   stays attributed (RFC-0014). A redaction is the only act that destroys a payload, and it is
   reserved for content the room is legally obliged to remove (RFC-0038 §6) - not for disagreement,
   not for quality, and not for a member the authority dislikes.

## Context

The product's privacy claim and its moderation need pull in opposite directions, and the set has
already fixed which one wins. RFC-0007 makes the payload opaque to the module, RFC-0016 §5 says the
host is not the moderator, and RFC-0020 lists content moderation under _not defended_. That leaves a
room without an inspection power, so governance has to work from what is visible: who wrote it, who
it was addressed to, how big it is, and who complained.

The room lifecycle already carries the states this record uses. RFC-0014 has `suspended` as a
host-imposed side state and `removed` as a membership transition with a recorded reason; this record
adds the content-side equivalents - a report row, a redaction that writes a tombstone, and an appeal
with a deadline - without adding a lifecycle state.

## Alternatives considered

| Option                                               | Why not chosen                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Host-side moderation with a key escrowed to the host | turns the provider into a reader of every room, which contradicts RFC-0007 and RFC-0020's not-defended list                         |
| Automated content scanning                           | requires plaintext or a classifier that reads it; there is nothing to scan that the module can open                                 |
| Community removal by downvote                        | a majority with a delete button; RFC-0027 §2 already separates ranking from selection, and a vote is not a verdict                  |
| Removal that also deletes the member's past content  | RFC-0014 keeps authored content attributed; retroactive deletion would let a room rewrite who said what                             |
| A global moderation service shared across rooms      | a second reader and a second authority, and it would need a key per room it serves                                                  |
| No appeal, authority is final                        | the founding holders are already the recovery path (RFC-0013's recovery, RFC-0014's authority role), so an escalation target exists |

## Consequences

- A room's moderation quality depends on its reports, so a room with an inactive membership has an
  ineffective authority and no external remedy. That is the price of the host not reading.
- An authority can remove content it has never read, which means a bad-faith report can succeed. The
  appeal row and the visible reason are the only counterweights, and they are records rather than
  remedies.
- The founding holders become a real institution: their keys are the escalation path, so a room's
  governance is only as good as its founders' availability. RFC-0013's recovery warning applies to
  them too.
- A published rule set makes moderation predictable and makes a rule change expensive, which is
  intended: a rule that can be rewritten after the fact is not a rule.
- Suspension is the host's only lever, so a host facing a legal demand stops a room rather than
  policing it - a blunt action that is at least honest about what it can see.

## Verification

| Claim                                    | Test                                                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A redaction leaves a tombstone           | `spacetime sql <room> "SELECT id, reason, signature FROM tombstone"` returns the row and the payload row is gone (RFC-0028, intent)     |
| A report is an envelope action           | inspect the report row; `note` is ciphertext and `target_id`, `reporter`, `category` are cleartext (intent)                             |
| A non-authority cannot redact            | call `redact` as a member without the `authority` role; it refuses with `action-refused` naming the class (RFC-0024 §7)                 |
| An appeal expires into a visible outcome | issue an appeal against a fixture decision and let its deadline pass; the outcome row reads `upheld` with the original reason (intent)  |
| The host cannot redact                   | the host's credential has no reducer call path to `redact`; only `suspend` and `delete` are host operations (RFC-0016 §5, intent)       |
| A removal without a rule is procedural   | redact with a reason that cites no rule in the current rule-set version; the row is marked `procedural` and becomes appealable (intent) |

## Open questions

- Whether the rule set should be a room-scoped row the authority signs, or a document referenced by
  hash. A row is checkable by the module; a document is readable by people. Which one a removal
  cites is undecided.
- Whether a member removed for cause keeps the ability to read what they were granted before
  removal. RFC-0014 rotates the epoch on revocation, which stops future reads; whether an
  already-delivered copy in their client should be deleted is unenforceable and therefore undecided
  rather than promised.
- Whether an appeal should be able to reverse a redaction. Reversal would need the ciphertext back,
  and the tombstone deliberately does not keep it (RFC-0028 §2) - so an appeal can clear the record
  but cannot restore the content, and whether that is acceptable is a governance question this
  record leaves open.
- Whether a host, as the database owner, can write a table directly instead of calling a reducer.
  `AGENTS.md:46` makes a private table accessible to reducers and the database owner, and rule 4
  denies the host a delete path - but a direct write would be a path no reducer authorizes. UNKNOWN.
  Spike: as the owner's identity, attempt a table write on a local database without calling a
  reducer.

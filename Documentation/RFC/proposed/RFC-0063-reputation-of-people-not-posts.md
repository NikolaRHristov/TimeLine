# RFC-0063 - Reputation of people, never of posts

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** votes, member
statements, standing, the cost of an identity **Decision class:** governance **Supersedes:** none
**Superseded by:** none **Task dependencies:** RFC-0027 §2 (a vote is a nomination and a rating is a
vote record; this record keeps it about placement), RFC-0031 (removal cites a published rule and an
appeal expires), RFC-0032 §3 and RFC-0039 §6 (the seat price that is the only sybil cost), RFC-0058
(a room's public face says what its reputation set costs); implementing card to be created: "Member
statement row and the standing view"

## Decision

A rating is a signed statement one identity makes about another identity's conduct, scoped to a room
and a rule set. It is never a score attached to content and never a single number.

1. **Content has no score.** RFC-0027 §2 already makes a vote a nomination and a rating a vote
   record; this record adds that the vote is about _placement_, not quality, and that no aggregate
   of votes is presented as a judgement of a person's writing. A card shows a count of voters, never
   a number out of five (RFC-0017).
2. **Reputation is a set of statements, not a number.**
   `{subject, issuer, claim, room, ruleSetHash, at, signature, expiresAt}`. A reader sees the
   statements plus each issuer's own standing. There is no scalar, because a scalar across
   incomparable claims is a number nobody can check.
3. **The unit is conduct in a room, and it does not travel.** A statement is scoped to the room it
   was made in and to the rule set in force (RFC-0031 §6). A room may read another room's statements
   about an identity as evidence and must label them as another room's - the rule RFC-0013 already
   applies to certificates.
4. **A pseudonymous rater's statement is worth its issuer's standing and nothing else.** There is no
   "verified person" flag that raises a statement's weight. A statement by an identity with no
   history is a statement by an identity with no history, and a client that hides that is inventing
   authority.
5. **Sybil resistance is a price, not a filter.** RFC-0032 §3 and RFC-0039 §6 already make an
   invitation cost a membership-month, so N identities cost N seats per room per month. The
   consequence for reputation is that a room's statement set is cheap to spam only up to the price
   of seats - so a room that accepts cheap invitations has a cheap reputation system, and its public
   face (RFC-0058) says what that price is.
6. **A negative statement needs the procedure a removal needs.** A claim about conduct that would
   restrict a member cites a rule in the version in force, is appealable (RFC-0031 §5), and expires.
   An anonymous complaint is not a statement; a signed one with an issuer is.
7. **Standing is computed by the reader, published by nobody.** No operator runs a reputation
   service, no global score exists, and no client is told what to think. The data is signed rows;
   the rendering is a client decision a member can disagree with by using another client.
8. **A member sees every statement about them, and can contest it.** RFC-0066's views are the
   mechanism. A statement the subject has not seen is a statement made behind their back, and the
   room's rules say whether that is allowed.

## Context

The topic exists because "reputation" is the word every network uses for a number it computes about
a person, and this architecture cannot compute such a number honestly: the module cannot read
content (RFC-0007), so it cannot judge quality, and any scalar would be built from the only things
it can see

- counts of rows, accounts and votes - which measure activity rather than conduct.

The set already holds every part a reputation system needs and none of them is a score. RFC-0027's
vote rule separates ranking from selection; RFC-0031 makes removal cite a published rule with an
appeal that expires into a visible outcome; RFC-0032 and RFC-0039 make an identity cost a seat per
room per month. Those four are the machinery, and the gap is the object: nothing records a statement
about a person.

What exists is content-shaped. `ls Maintain/Source/Command/Vote/` lists Approve, Entry, Nominate,
Queue, Rank, Reject and Sync, and the `Voted` and `Curated` collections carry `votes`, `status` and
`rank` per post (`Source/content.config.ts:123-155`). No collection, table or command mentions a
member's standing, so the tool layer's whole notion of judgement is a ranking of links.

## Alternatives considered

| Option                                               | Why not chosen                                                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| A five-star rating per post                          | an average hides whether one person or a hundred voted (RFC-0017), and it judges content the rater may not have read                   |
| A global reputation score per identity               | one number across rooms and rule sets, computed by someone, and therefore an authority nobody granted                                  |
| Web-of-trust weighting (a trusted rater counts more) | it is a scalar with a recursion, and the recursion's seed is whoever the reader trusts first - a client's decision, not the protocol's |
| Reputation from activity counts                      | rows written and votes cast measure presence, not conduct, and both are cheap to inflate                                               |
| A verified-person flag issued by the operator        | RFC-0056 rule 6 refuses the operator as an identity authority, and a flag is exactly that                                              |
| No reputation at all                                 | a room with no statements about conduct re-litigates every member from scratch, and RFC-0031's appeals already assume a history exists |
| Let the module compute standing from row counts      | the only inputs are counts, so the output would be a popularity metric wearing the word "trust"                                        |

## Consequences

- A client carries the weight of interpreting statements, so two clients can rank the same member
  differently and both are right - the property a scalar destroys.
- A room's statement set is small and readable, so a member can be confronted with the whole of what
  has been said about them: uncomfortable, and honest.
- Sybil resistance inherits the invitation price, so a free room cannot have a meaningful reputation
  set, and its public face says so.
- Negative statements expire, so a member's history is not a permanent sentence and a room cannot
  build a blacklist that outlives its rules.
- No operator service means no appeal to a platform: the escalation path is the room's authority and
  then its founding holders (RFC-0031 §5), the same path a removal already has.

## Verification

| Claim                                | Test                                                                                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No score exists                      | `spacetime describe <room> --json \| jq '.tables[] \| select(.name=="member_statement")'` shows issuer, claim and expiry and no numeric weight column (intent) |
| A statement is signed                | a statement whose signature does not verify is rejected by the module (intent)                                                                                 |
| A statement is room-scoped           | a statement made in room A renders in room B as another room's evidence, labelled with A's identity (intent)                                                   |
| An unverified rater is not amplified | two statements with the same claim from issuers with and without history render at the same weight, with both histories shown (review rule)                    |
| A negative statement cites a rule    | issue one citing no rule in force; it is `procedural` and appealable, as RFC-0031 §6's row already requires (intent)                                           |
| A statement expires                  | let `expiresAt` pass; the client stops counting it and keeps the row (intent)                                                                                  |
| The subject can see it               | RFC-0066's view lists every statement whose subject is the member (intent)                                                                                     |

## Open questions

- Whether a claim should be an enumerated vocabulary a rule set defines, or free text. An
  enumeration is comparable and must be published per room; free text is honest and unaggregatable.
- Whether a member may issue a statement about an identity outside their own room, which would make
  reputation portable without a global score. It needs a rule for which room's rule set a claim
  about another room's member cites.
- Whether a room should be able to require a statement before granting (a vouching step). It is
  RFC-0014's grant with a precondition, and it would put the sybil cost where it is felt.
- UNKNOWN whether the engine can expire a row without a sweeper, which decides whether "expires" is
  a client rule or a module one. RFC-0028's open question is the same one.

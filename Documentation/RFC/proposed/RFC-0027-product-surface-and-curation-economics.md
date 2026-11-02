# RFC-0027 - Product surface and curation economics

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the curated index, the
vote subsystem, the operator's powers, pricing **Decision class:** product **Supersedes:** none
**Superseded by:** none **Task dependencies:** RFC-0017 (the client surface the gallery is built
from), RFC-0012 (what may be published at all), RFC-0016 (what is sold), RFC-0023 (publication is a
delegation), RFC-0015 (exit is free); t_406cc8ab (owner-gated curation landed)

## Decision

The gallery is a curated shelf with a published rule, and the operator is a curator with three
powers and no others.

1. **What is showcased is published content with a vote record.** A card appears because its author
   published it (RFC-0012 `public`, delegated to the publication host per RFC-0023) and because
   people nominated it. Harvesting never showcases anything: a post the room observed is a row, not
   a card. RFC-0017 already fixes the rendering - a card is the same component over a different
   source, and a rating is a vote record rather than a star average.
2. **Curation is a nomination followed by an operator decision.** A vote nominates; placement in the
   curated index requires an operator approval; a rejection is recorded with a reason and is not
   silent. The mechanism exists - `nominate`, `approve`, `reject`, `rank` and `sync` over
   `Source/Content/Voted|Curated` - and this record decides the rule it expresses: **votes rank, the
   operator selects, and nothing is selected that was not ranked.**
3. **The operator has three powers.**
    - Select what is published into the gallery, never what is addressed (RFC-0012 rule 2 forbids
      the second, and this record repeats it because the two are confused in every product that has
      a homepage).
    - Price hosting, by the published unit model (RFC-0016 §1).
    - Stop a room on volume, rate or membership (RFC-0016 §5).
4. **The operator has three non-powers.** It cannot read content (RFC-0007), cannot widen an
   audience (RFC-0012), and cannot move a member's data to another holder (RFC-0023 §6). A fourth
   follows from the others: it cannot delete a member's writing, because deletion is gated on export
   and belongs to the room's authority (RFC-0014).
5. **What is never showcased.** `internal` and `typed` content (RFC-0012), imported content whose
   provenance is foreign and unsigned (RFC-0015's `signature: null`), content the author withdrew,
   and content whose author has left without ever having published it. Withdrawal is a narrowing,
   which the author performs unilaterally (RFC-0012 rule 1), so a card can disappear without the
   operator acting.
6. **The economics are hosting, not content.** The gallery is the acquisition surface; the paid
   product is a room's hosting at published unit prices (RFC-0016 §1). Content is never sold, never
   metered per read, and never held hostage: exit is free and the format is RFC-0015's. A person who
   pays nothing still publishes to the static site, because publication costs the operator a build,
   not a database.
7. **The gallery is the same shelf for a room.** A room's gallery is the same card component and the
   same vote rule over the room's published rows (RFC-0017), so curation inside a room and curation
   of the public site are one mechanism with two scopes - and a room's authority, not the operator,
   holds the selection power inside a room.

## Context

The specification treats the feature gallery as a product and no record says what the product is.
What exists is machinery: a vote subsystem that landed as
`maintain vote nominate|approve|reject|rank|sync` writing `Source/Content/Voted` and
`Source/Content/Curated`, a `VoteTransport` seam with `firebase` and `none` backends, a `/Voted/`
page, and a Curated section leading the homepage. RFC-0017 places the gallery in the client surface
and says a rating is a vote record. None of that decides who selects, on what basis, or what the
operator may never do.

The gap matters because curation is where a product with an unreadable database earns its trust. A
host that cannot read content cannot moderate it (RFC-0007, RFC-0016), so selection is the only
lever the operator has over what a visitor sees - and a lever that can be pulled in one direction
only. The three powers above are exactly the levers that survive a blind host: what to show, what to
charge, and when to stop serving. Every other lever needs plaintext or someone else's signature.

The economics follow the same constraint. A room's cost is rows, storage, active identities and
invocations (RFC-0016 §1), all measurable without reading a payload. A visitor's read of the public
site costs a static asset. So the two surfaces have different cost shapes, and mixing them -
charging for reads, or metering the archive - would put a price on a thing the architecture cannot
measure.

## Alternatives considered

| Option                                              | Why not chosen                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Popularity alone selects the gallery                | a vote is cheap and a brigade is cheaper; the operator's approval is the only brake that needs no plaintext                           |
| Operator selection without votes                    | the shelf becomes the operator's taste and the vote subsystem becomes decoration                                                      |
| Curation by reading the content                     | the host cannot read it (RFC-0007); a curator who can is a party the privacy claim cannot support                                     |
| Charging for reads or for the archive               | a price the architecture cannot measure, and it prices the exit that RFC-0015 makes free                                              |
| A second gallery implementation for rooms           | two card components and two vote rules that drift; RFC-0017 already refuses this                                                      |
| Showcase imported content beside authored content   | an unsigned row is not evidence of an author, so a card would claim an authorship nothing verified (RFC-0015)                         |
| Let the operator remove a post the author published | a takedown power over content the host cannot read is a takedown power over the wrong thing; the author's withdrawal is the mechanism |

## Consequences

- The homepage is a filtered, ranked, operator-approved projection of `public` content, so a build
  needs the vote store and the curated index - both of which already exist - and no database.
- A rejected nomination leaves a record, which makes curation auditable and makes a curator
  answerable for a pattern rather than a decision.
- A room's authority duplicates the operator's selection power inside its own room, so the client
  must show which scope a card was curated in; otherwise a member cannot tell a public placement
  from a room placement.
- Pricing is public and binding, which constrains the operator's freedom in the direction of its
  customers (RFC-0016 already accepts that).
- The gallery can be empty without being broken: an empty shelf is a true statement about the votes,
  and the client must render it as one (RFC-0017's offline and empty states).

## Verification

| Claim                                | Test                                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Only published content is showcased  | `pnpm maintain vote rank`, then `grep -rl <internal text> Source/Content` finds nothing (shared with RFC-0012)          |
| A vote without approval is not shown | nominate a post, do not approve it: it is absent from `Source/Content/Curated` and from the homepage                    |
| A rejection is recorded              | reject a nomination: the record names the reason, and the post is not in `Curated`                                      |
| Imported content is never showcased  | import an export with `signature: null` (RFC-0015), then rank: no card appears for it                                   |
| Withdrawal needs no operator         | narrow a published post's audience to `typed` (RFC-0012); its card disappears from the next build                       |
| The gallery is static                | `astro build` with the database and the vote backend both stopped still emits the curated section from the files        |
| The operator cannot read content     | `spacetime sql <room> "select text from post limit 1"` returns ciphertext, so no curation step can depend on reading it |

## Open questions

- Whether the curated index is per network or global. A global index is the acquisition surface and
  puts every room's public content on one shelf; a per-network index keeps rooms independent and
  makes the homepage depend on which room a visitor arrived from. UNKNOWN, and it is the one product
  question here with no architectural constraint to answer it.
- Whether an approval expires. A card approved two years ago is a claim about a person's writing
  that the person may no longer make; expiry is one boolean and a policy nobody has written.
- Whether a room authority's selection and the operator's selection can ever conflict over the same
  post - both scopes are legitimate and the record does not rank them.
- Whether votes are per person per post or per identity per post. RFC-0013 allows one person several
  devices under one identity, which makes the answer cheap; a person with two identities is the case
  no vote subsystem solves.

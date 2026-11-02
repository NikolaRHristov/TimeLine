# RFC-0058 - A room's public face, and no member directory

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the room's metadata
row, the published site, the curated index, invitations **Decision class:** product **Supersedes:**
none **Superseded by:** none **Task dependencies:** RFC-0014 (join-without-seeing and the invitation
this record shortens the path to), RFC-0036 §5 (no name resolution and no global directory),
RFC-0027 §2 (a face is nominated and selected like a card), RFC-0012 (the audience types a face may
declare); implementing card to be created: "Room face document and the discoverability setting"

## Decision

A room is discoverable by a document it signs about itself, and never by anything it can say about
its members.

1. **The unit of discovery is a public face.**
   `{roomId, name, faceVersion, ruleSetHash, audienceTypes, memberCountBucket, recoveryCase, artifactHash, signedBy}` -
   signed by the room's authority and published wherever the room chooses: its own URL, a card on
   the static site, or a copy pasted into a chat. A face is a document rather than an endpoint, so a
   host that disappears leaves a face that still verifies. RFC-0036 §5's rule for a member is
   applied to a room.
2. **A face names no member.** No member list, no handle, no per-member anything. The count is a
   bucket (`1`, `2-5`, `6-20`, `21+`) because an exact count over time is a membership oracle: a
   room going from four to five tells a watcher that someone joined.
3. **Discoverability is a three-valued setting the authority chooses.** `unlisted` publishes no
   face, so the room exists only through invitations. `listed` publishes a face that may be indexed.
   `indexed` publishes a face the operator may place in the curated index. The default at creation
   is `unlisted`, and changing it is a recorded act under RFC-0031 §6's rule-set discipline.
4. **A directory may only publish faces.** Any aggregator - the operator's curated index included -
   is a list of signed faces and nothing else: no crawl of rooms, no inference of membership, no
   ranking by activity, because activity is a member-level fact. RFC-0027's vote-then-approve rule
   applies unchanged: a face is nominated and the operator selects.
5. **A join still needs an invitation.** Discovery shortens the path from "a room exists" to "ask
   for an invitation"; it never shortens it to "you are in". RFC-0014's two-step join is unchanged,
   and accepting a listed room's invitation still lands on `grant = none`.
6. **A face is re-signed, never edited.** A change to any field is a new `faceVersion` with a new
   signature, and old versions stay fetchable so a reader can see that a room's declared audience
   types or recovery case changed. A room that quietly stops declaring an escrow holder is exactly
   the change a member needs to see.
7. **No search over content, ever.** A directory indexes faces and nothing else. Search inside a
   room is RFC-0029's, and it is client-side for the reason that record gives.

## Context

RFC-0014 decides that an invitation is a signed document handed out by the inviter and leaves open
whether it is a row. RFC-0036 §5 states there is no `@name` resolution and no global directory.
Neither says what a stranger may learn about a room, and the gap is load-bearing: the product's
claim is that a room protects its members from outsiders, so the only thing an outsider may see is
what the room chose to publish.

Nothing of the kind exists. `ls Maintain/Source/Command/` lists Author, Config, Context, Event,
Page, Post, Store, Tab and Vote - there is no Room command and no room object in the tool layer, so
there is no metadata row for a face to be a projection of.

The pressure toward a directory is real and it comes from the product's own shape. RFC-0005 makes
the network many small rooms of a handful of people, and a network of five-person rooms with no
discovery is a network that only grows along the founder's friends - which is the failure mode the
whole product exists to avoid.

## Alternatives considered

| Option                                      | Why not chosen                                                                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A global room directory run by the operator | one authority decides what exists, and a listing is a claim about a room the operator cannot verify                                                         |
| A member directory, so people can be found  | membership is the thing a room protects; a directory of members is the leak the room exists to prevent                                                      |
| An exact member count                       | a count over time is an oracle; a bucket is a fact                                                                                                          |
| Discovery by crawling the federation        | a room that published no face did not consent to being listed, and a crawl finds rooms that exist rather than rooms that want to be found                   |
| Invitation-only with no discovery at all    | honest, and it makes a network of five-person rooms unjoinable beyond one hop, which is the product's own failure mode                                      |
| A face that includes recent posts           | the face is signed by the authority and posts are signed by members; republishing them is a second publication path with its own rules (RFC-0012, RFC-0023) |
| A face that lists its rules in full         | a face names the rule set's hash; the rules themselves are the room's document and a copy in the face would drift from it                                   |

## Consequences

- A room has a public identity document, so a client can show a room before it is joined and
  RFC-0014's join-without-seeing becomes a screen with content rather than a blank.
- The bucket is too coarse to track and too coarse for a member to know how many people will read a
  post; the room's own membership view answers that for members.
- Listing is a decision the authority can reverse, and a reversal leaves a trace, which is the
  property RFC-0031 §6 wants for rules.
- An unlisted room is unlisted only in that no face exists; a member can still describe it, so
  unlisted is a default and not a guarantee.
- The curated index gains a second object type - a face beside a post - so RFC-0027's gallery is one
  mechanism over two sources, the shape it already has for a room's own gallery.

## Verification

| Claim                        | Test                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A face carries no member     | publish a face from a fixture room with five members; `jq 'paths(scalars)' face.json` names no identity and no handle (intent) |
| A count is a bucket          | grow a room from four to five members; the re-signed face's count field is unchanged (intent)                                  |
| Unlisted publishes nothing   | create a room with the default; the build emits no page and no index entry for it (intent)                                     |
| A face verifies offline      | verify a face's signature with the authority's public key and no network access (intent)                                       |
| Old faces stay               | change the recovery case; two face versions are fetchable and the older one still verifies (intent)                            |
| Discovery does not grant     | accept a listed room's invitation; the membership row reads `grant = none` (RFC-0014, intent)                                  |
| A face declares its recovery | a room with an escrow holder's face names it, and the field is not `self` (RFC-0057, intent)                                   |

## Open questions

- Whether the face should live in the room's own database, readable by a non-member, or only on the
  static site. A face in the database is live and depends on RFC-0014's open question about
  non-member reducer calls; a face on the site is static and stale. UNKNOWN, and it decides whether
  a face can be live at all.
- Whether `indexed` should be separable from `listed` at all, or whether the operator's index should
  read any listed face. Two settings is one more state than the product needs if the operator only
  ever indexes what it is handed.
- Whether a bucket boundary should be published or secret. A published boundary makes the bucket
  checkable and makes a five-member room's join visible as a boundary crossing.
- Whether a room may have more than one face - a public one for strangers and a narrower one for
  invitees. It is one document with one signature today, and two would need a rule for which one a
  client shows.

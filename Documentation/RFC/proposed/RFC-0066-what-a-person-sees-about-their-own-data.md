# RFC-0066 - What a person can see about their own data

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the member's views,
the store's read surface, the publication and propagation records, the grant and epoch lists
**Kind:** contract **Subject:** data **Horizon:** next **Supersedes:** none **Superseded by:** none
**Task dependencies:** RFC-0018 (the operational half - runs and spans - which this record does not
restate), RFC-0021 §2 (an observation names its observer), RFC-0023 §3 (publication is a
delegation), RFC-0014 (grants), RFC-0013 (the wraps this record makes readable), RFC-0050 (the
vocabulary for an empty state), RFC-0041 (the aggregate, content-blind analytics this record is
not); implementing card to be created: "The four member views"

## Decision

A member can answer four questions about their own archive without a shell, a log or the operator:
what was harvested, what was published, what was shared, and with whom. Each answer is a view over a
log the system already writes.

1. **Four questions, four views.** _Harvested_ is the observation log scoped by `observer` (RFC-0021
   §2). _Published_ is the publication record - which rows left the room and where they landed
   (RFC-0023 §3). _Shared_ is the propagation record - which room received a copy, when, and under
   which audience (RFC-0012). _With whom_ is the grant list (RFC-0014) plus the wrapped-epoch list
   (RFC-0013), the only place a member can see who can decrypt what.
2. **Every view is a log, not a dashboard.** No counter is computed and stored; each view is a query
   over an append-only record. A dashboard number is a second fact that can disagree with the log,
   and RFC-0018 already refuses that duplication for runs.
3. **The "with whom" view is the one that matters and the one nobody else can build.** It is the
   wrapped-epoch list per room, per epoch, with the member's own wraps distinguished, so a member
   can see every identity that holds a key to their room. That is the plainest statement of the
   privacy claim and the only one checkable from the member's side.
4. **Absence is shown as absence.** A view with no rows says which kind of nothing it is: never
   harvested, not yet published, or nothing granted. RFC-0050's data states are the vocabulary, and
   a view that renders every empty case as "no data" is the failure RFC-0017 already names for the
   room client.
5. **The views are local-first and complete offline.** All four read the shadow store, so they
   answer with the server stopped (RFC-0001). A view that needs a room connection cannot answer the
   question a member asks when a room has gone quiet.
6. **The operator has no version of these views.** There is no member-facing page served by the
   host, no per-member analytics, and no dashboard that shows one member to another. RFC-0041's
   analytics are aggregate and content-blind by construction; these views are per-member and local
   by construction, and the two never meet.
7. **Every row in a view links to its evidence.** A published row names the build or the page; a
   shared row names the receiving room's identity; a harvested row names the run (RFC-0018). A view
   a member cannot drill into is a claim, not an answer.
8. **A deletion is visible here first.** Erasure (RFC-0028 §4), withdrawal (RFC-0012 rule 1) and
   retraction (RFC-0059) all appear in these views as records of what changed, because a member who
   cannot see their own deletion cannot tell it from a failure.

## Context

RFC-0018 already names `store status --json`, `event tail`, `run show` and the `/Activity/` page and
calls that "what a person sees about their own archive, without logs". That is the operational half:
what happened to a command. The member-facing half is a different question - what happened to my
_data_

- and the four views above are the ones the topic names.

Two of the four records already exist as logs. `Maintain/Storage/Shadow/Observation.jsonl` is the
harvest log, and `Maintain/Source/Command/Event/Tail/` reads the event log, whose `kind` enumeration
already names `bookmark.published`, `bookmark.hidden`, `vote.*` and `list.*`
(`Source/content.config.ts:113`) - the publication half. What does not exist is any propagation
record, grant table or epoch table: `ls Maintain/Source/Command/` lists Author, Config, Context,
Event, Page, Post, Store, Tab and Vote, and no Room, Grant or Key command.

That asymmetry is the point of writing this down before implementation. The two views that can ship
first are the ones over logs that exist; the two that need rooms are the ones the privacy claim
actually rests on.

## Alternatives considered

| Option                                               | Why not chosen                                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A dashboard with computed counters                   | a second fact that drifts from the log; RFC-0018 refuses it for runs and the reason is identical here            |
| A host-served member page                            | the host would have to know who the member is and what they did, which is the analytics RFC-0041 exists to avoid |
| A single "activity" list with every kind mixed       | the four questions are asked separately, and a mixed list answers none of them                                   |
| A view that only works online                        | the moment a member most needs to know who holds a key is the moment a room has gone quiet                       |
| Exposing the epoch list to the room's authority only | the authority can already enumerate grants and the member cannot, and the member is who the claim is about       |
| Aggregate counts instead of rows                     | "3 published" cannot tell a member which three, and the three is the answer                                      |
| Making the views an export format of their own       | they are derived from logs the member already owns; a fourth format is a fourth thing to version                 |

## Consequences

- The epoch list becomes a member-readable object, so the module needs a per-member view over wraps
  (RFC-0005's view capability) rather than a table a member filters.
- "With whom" exposes a member's own room membership to themselves, which sounds trivial and is the
  first time a member can audit the claim rather than believe it.
- Four views over three logs and two missing tables means the first implementation is half a feature
  until rooms exist; harvest and publication ship first.
- Local-first views make the store's completeness matter, so RFC-0065's drill and the
  `complete: false` flag in an export become things a member sees rather than things a document
  records.
- No operator dashboard means no support tool: a member asking why a post did not appear gets a view
  and a run id, not an answer from a person.

## Verification

| Claim                           | Test                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Harvested is per observer       | `maintain view harvested --json` returns only lines whose `observer` is the member (RFC-0021, intent)               |
| Published names its destination | a published row's evidence names the build or page it landed on (intent)                                            |
| Shared names the receiving room | a propagation row names the room's database identity and the audience it carried (intent)                           |
| With whom lists every wrap      | for a fixture room, the view's identity count equals `select count(*) from key_epoch` wraps for that epoch (intent) |
| Absence is distinguished        | a member with no grants sees "nothing granted" and not "no data" (RFC-0050, review rule)                            |
| The views work offline          | stop the server; all four views answer from the store (RFC-0001, intent)                                            |
| A deletion is visible           | withdraw a post; the publication view records the withdrawal and the card leaves the next build (RFC-0012, intent)  |
| The operator has no such view   | `spacetime describe <room> --json \| jq '.views'` shows per-user views and no administrative one (intent)           |

## Open questions

- Whether the "shared" view should count a copy delivered to a member rather than to a room.
  Delivery is per-member (RFC-0005's per-member view), so the count exists, and naming it would turn
  the view into a readership report.
- Whether "with whom" should show identities or display names. A name is room-scoped and a wrap is
  by key, so the honest view is a fingerprint and the readable one is a name.
- Whether a member should be able to export these views. They are derived from logs the member
  already owns, so probably yes - which makes them a second thing to version.
- UNKNOWN whether a per-user view can aggregate across several tables - grants, wraps, epochs - in
  one query, or whether the client assembles it from three subscriptions. RFC-0005's open question
  is adjacent and does not settle it.

# RFC-0064 - A list is a signed, versioned object

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the list collection,
the list command, the `List/[Slug]` page, the export format **Kind:** contract **Subject:** data
**Horizon:** next **Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0027 §7
(curation is one mechanism with two scopes), RFC-0017 (the gallery is the existing pages), RFC-0012
(a list has an audience like any row), RFC-0015 (a list is a line type in the export), RFC-0060 (the
signature a list carries), RFC-0059 §3 (a quoted entry is a reference); implementing card to be
created: "List object, version history and the list command"

## Decision

A list is a first-class object with an author, a version history and a signature. It is not a page
and not a filter over a table.

1. **A list is an object with its own identity.**
   `{listId, author, title, entries[], rule?, createdAt, version, audience, signature}`. `listId` is
   derived from the author and the creation instant, so two people publishing the same links publish
   two lists.
2. **Entries are ordered and may carry a reason.** An entry is `{postKey, position, note?}`. A list
   with no reason per entry is a copy of a search result; the note is what makes it curation rather
   than aggregation, and it is optional per entry and a declared policy per list.
3. **Every change is a new version, signed.** Version `n+1` supersedes `n` and `n` stays fetchable,
   so a client can diff two versions and see what was added, removed and reordered. That is the
   whole of the version history the topic asks for, and it is only possible because the object is
   signed.
4. **Authorship is a key, and a list travels like a post.** A list is signed by its author
   (RFC-0060's chain rule applies unchanged), carried inside RFC-0015's format as an additional line
   type, and importable into another room as a foreign list with `signature: null` when it has no
   head.
5. **A list is a publication surface, so it is audienced.** A list has an audience like any row
   (RFC-0012). A `public` list is published to the static site and can be showcased (RFC-0027); an
   `internal` list is a member's private shelf. `List/[Slug]` renders a `public` list and nothing
   else.
6. **A rule-generated list is a saved query, and it is data too.** A list whose entries are computed
   carries the rule, its version and the time it was evaluated. Two evaluations of one rule that
   differ are a divergence (RFC-0021 §4's rule), not a silent refresh.
7. **A list never confers authority over what it lists.** Being on a list changes nothing about a
   post's audience, its author's rights or its retention. A list is a claim by its author, and its
   only power is what a reader grants it.
8. **A list is exportable and a list is withdrawable.** The author withdraws a list with a new
   version that has no entries plus a withdrawal record, and RFC-0028's erasure reaches a list's
   entries the way it reaches a post - a tombstone reference, never a silent edit of the list.

## Context

The repository has lists as a UI feature and as a relation, and the two do not meet.
`Bookmark.lists` and `Person.lists` are `z.array(z.string())` (`Source/content.config.ts:73` and
`:103`), the site renders `/List/[Slug]` from that array, and `ls Maintain/Source/Command/` has no
list command. A list today is therefore a tag: no author, no order, no version, no note, and no way
to say who made it or why.

RFC-0027 §7 makes curation one mechanism with two scopes and RFC-0017 makes the gallery the existing
pages; neither says what a list _is_. The gap is why the topic is on the wave-four list: a list with
an author and a history can be cited, disputed and exported, and a tag cannot.

The module repeats the shape - `post.lists` is "the list slugs as a JSON array, because their number
is the person's" (`Maintain/Spacetime/spacetimedb/src/Schema.ts:41-42`) - so the projection stores
the tags as a string inside a row. A list object cannot be reconstructed from that, and a version
history certainly cannot.

## Alternatives considered

| Option                                                  | Why not chosen                                                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| A tag array on each post (today's shape)                | no author, no order, no version, no note; a list cannot be cited or withdrawn                                     |
| A filter query saved in the client                      | not data, so it cannot be exported, signed or shared, and it evaluates differently against another client's cache |
| A list as a room table row only                         | a `public` list then cannot reach the static site without a database at build time (RFC-0001)                     |
| A list as a hand-written JSON file in `Source/Content/` | unauthored and unsigned, so a published list is a claim with nobody behind it                                     |
| Versioning by overwriting and keeping a diff in git     | the repository is public, and a member's list history is not the repository's history                             |
| A list that grants read access to what it lists         | a curation object with access power is a permission system nobody asked for, and RFC-0012 already has audiences   |
| One list per post (a post may belong to one list)       | curation is many-to-many by nature; the constraint would force a room to choose between two shelves for one link  |

## Consequences

- The `lists` array becomes a derived index rather than the authority, so the build gains a
  collection and the pipeline gains a list command - the first content object in the tree with a
  version.
- A list's history is a public record of what a curator thought, which is the point and also a
  reason people will not curate: a curator who removes an entry leaves a trace.
- Exporting lists bumps the format's version (RFC-0034) and gives an import a second object type to
  validate.
- A rule-generated list makes evaluation time a fact, so a client showing a rule list without its
  evaluation time is showing a claim about the present that was true in the past.
- `List/[Slug]` keeps working, now over an object with an author, so a list can be attributed the
  way a post is (RFC-0036 §4).

## Verification

| Claim                            | Test                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| A list has an author             | build the site from a fixture list; the page's attribution carries a fingerprint prefix and the object carries a signature (intent) |
| A version is fetchable           | write version 1 then 2; both are readable and a diff names the added and removed entries (intent)                                   |
| A list is exported               | `maintain export --room <id>` produces a list line in `Payload.jsonl` and the round trip preserves order (RFC-0015, intent)         |
| A list is audienced              | a `public` list appears in the build and an `internal` one does not (`grep -r` over `Target/`, intent)                              |
| A rule list names its evaluation | the object carries `evaluatedAt` and `ruleVersion`, and a client omitting either fails a review rule (intent)                       |
| A list confers nothing           | remove a post from a list; the post's audience, retention and authorship are unchanged (RFC-0012, RFC-0028, intent)                 |
| Withdrawal leaves a record       | withdraw a list; the new version has no entries and the withdrawal is visible (intent)                                              |

## Open questions

- Whether a list should be a row in the room or only a client-side object published to the site. A
  row makes it live and audienced; a client object makes it exportable without a database and
  unaudienced.
- Whether entries should be `postKey` (RFC-0059) or the platform's status id. A `postKey` makes a
  list portable across rooms and requires the hash at curation time.
- Whether a list may contain another list. Composition is what makes curation scale and it is one
  more cycle to detect.
- Whether a list's order is meaningful enough to sign, or whether order is a rendering choice.
  Signing it makes a reorder a version; not signing it makes "the list I published" ambiguous.
- UNKNOWN whether an ordered array can be a column the module indexes and filters by position, or
  whether the order must live in a separate entry table keyed `(listId, position)`. The module
  already stores a list as a JSON string (`Maintain/Spacetime/spacetimedb/src/Schema.ts:41-42`),
  which cannot be queried at all. Spike: declare an `t.array(...)` column in a probe module and
  filter on it.

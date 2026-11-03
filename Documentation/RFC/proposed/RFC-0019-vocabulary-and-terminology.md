---
title: Vocabulary and terminology
rfc: 0019
category: Specification/Text
kind: rfc
date: 2026-11-02
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: every document, every identifier, every table and command name
supersedes: none
superseded_by: none
depends:
    - RFC-0010 (documentation and template policy)
    - RFC-0001 (the store's terms)
    - RFC-0005 (room, federation)
    - RFC-0012 (audience, propagation)
    - RFC-0013 (identity, epoch, authority)
    - "RFC-0018 (run, span); t_23dc5d47 (account-agnostic naming)"
    - |-
        t_bceac9f5 (PascalCase convention); implementing card to be created: "Glossary as the naming authority, with the membership/curation rename"
statuses:
    - name: "There is one glossary, at `Documentation/Reference/Glossary.md`, and it is the..."
      state: open
      evidence: the rule names no file or command
    - name: Each term is defined once, in one sentence, with its kind (concept, table,...
      state: open
      evidence: the rule names no file or command
    - name: Identifiers follow the glossary
      state: open
      evidence: the rule names no file or command
---

## Decision

There is one glossary, at `Documentation/Reference/Glossary.md`, and it is the naming authority for
the system.

Each term is defined once, in one sentence, with its kind (concept, table, command, role) and the
record that decides it. A term is never reused for a second meaning. When two meanings collide, one
is renamed in the same change that defines it, and the rename is a schema change under RFC-0002.

Identifiers follow the glossary: a table, a command, a type and a page carry the glossary's word for
what they hold (PascalCase, acronyms fully uppercase - RFC-0010). A record that needs a new term
adds it in the same change. A table or command that contradicts the glossary is a defect, not a
preference.

## The vocabulary

| Term                  | One meaning                                                                                      | Decided by         |
| --------------------- | ------------------------------------------------------------------------------------------------ | ------------------ |
| room                  | one database; the unit of membership, visibility and tenancy                                     | RFC-0005           |
| circle                | the set of rooms one identity belongs to, as seen by that identity - not a room, not an audience | RFC-0019           |
| audience              | the guarantee class a post is addressed to: `public`, `typed`, `internal`, `federated-push`      | RFC-0012           |
| channel               | a named delivery path out of a room, to another room or another transport                        | RFC-0012, RFC-0011 |
| propagation           | the recorded move of a post between audiences or rooms                                           | RFC-0012           |
| member                | an identity holding a membership row in a room                                                   | RFC-0014           |
| invite                | an issued, expiring, single-use claim on membership                                              | RFC-0014           |
| grant                 | a scope a member holds in a room: an audience tier, a channel, or `propagate`                    | RFC-0014           |
| curator               | a member who selects and orders what a room publishes - never the author of what is selected     | RFC-0014, RFC-0012 |
| author                | the identity whose subkey signed a post; immutable per post                                      | RFC-0013           |
| identity              | a keypair plus a display name; the unit of authorship                                            | RFC-0013           |
| subkey                | a device key certified by an identity key                                                        | RFC-0013           |
| key epoch             | one generation of a room's content key; revocation rotates it                                    | RFC-0013           |
| certificate authority | a room-scoped signer that certifies member keys - not a global PKI                               | RFC-0013           |
| envelope              | the cleartext header a payload travels in: audience, author, hash, epoch                         | RFC-0007           |
| payload               | the ciphertext an envelope carries                                                               | RFC-0007           |
| transport             | a seam that carries a command to a browser tab, or answers from the store                        | RFC-0003           |
| shadow store          | the local append-only authority for observations and events                                      | RFC-0001           |
| projection            | the database view rebuilt from the shadow store                                                  | RFC-0001           |
| publication           | the subset in `Source/Content/` that the static site reads                                       | RFC-0001           |
| observation           | one scrape's metrics for one post, append-only                                                   | RFC-0001           |
| event                 | one append-only fact about something that happened                                               | RFC-0001, RFC-0018 |
| run                   | one command invocation, with an outcome and counts                                               | RFC-0018           |
| span                  | one external effect or one decision inside a run                                                 | RFC-0018           |
| source                | one ingest surface: `bookmark`, `like`, `history`                                                | RFC-0004           |
| list                  | a person's curated list of handles, keyed by slug, with an id at the origin                      | RFC-0011           |
| curation              | the decision to place a handle in a list, with its recorded reason                               | RFC-0004           |
| federation            | a call from one room's module to another room's reducer                                          | RFC-0005           |
| tenancy               | one room's billing and isolation unit at a host                                                  | RFC-0016           |
| host                  | the operator running databases - not a member and not an authority                               | RFC-0016           |
| feed                  | a room's ordered stream of posts as a client renders it - never a curated list                   | RFC-0019           |

Two collisions are resolved here and both are renames.

1. **`membership` already has two meanings.** In the module it is the curated-list relation, keyed
   `<list>:<handle>` (`Maintain/Spacetime/spacetimedb/src/index.ts:94-107`); RFC-0014 needs the same
   word for an identity's place in a room. The curated-list relation becomes `curation`; the room
   relation keeps `membership`. The rename lands with the room tables, and until it does this record
   is the statement that the two are not the same thing.
2. **`list` would mean two things.** A curated list of people is a `list`; a room's stream of posts
   would also be called a list in ordinary speech. A room's stream is a `feed`, and no page, table
   or command calls it a list.

`circle` is defined here rather than inherited: the product needs a word for the person-level view -
every room one identity belongs to - and nothing in the record set names it. It is not a room, not
an audience and not a channel, and it has no table: it is a client-side projection over membership
rows across rooms.

## Context

The tree already carries three senses of "list" - a curated list of handles, the `lists` key in the
identifier map, and the `/List/[Slug]` page - and two senses of "membership" in one module. RFC-0005
introduced "room", RFC-0007 "envelope", RFC-0012 "audience" and "propagation", and RFC-0016
"tenancy" without a document that holds them; each record re-introduced its own terms. Nothing in
`Documentation/Reference/` defines a term today, so a reader has no single place to check whether
two documents mean the same thing by "channel".

The cost is already visible: the identifier map's `lists` key and the site's `List` page agree,
while the module's `membership` table means something the word does not suggest.

## Alternatives considered

| Option                                                       | Why not chosen                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| A glossary per document                                      | the current state: terms drift and nothing detects the drift                                           |
| Definitions inline in each record                            | duplicated, and the copies diverge at the first edit                                                   |
| Code as the definition                                       | a reader cannot tell which of two relations named `membership` a sentence means                        |
| Keep both senses of `membership` and disambiguate by context | context is exactly what a reader does not have when they are new to the tree                           |
| Rename `list` to `collection`                                | `collection` already means an Astro content collection in this tree; the collision would move, not end |

## Consequences

- Renaming the module's `membership` to `curation` is a schema change with a migration (RFC-0002),
  and it has to land before or with the room tables or every query about membership is ambiguous.
- The glossary becomes a review gate: a record that uses an undefined term is returned, not merged.
- `circle` gains a meaning and must be used only that way; prose that used it loosely must change.
- A term with a table has two homes - the glossary and the schema - so the glossary names the table
  and the schema names the term, and a change to one is a change to both.
- Deprecated terms keep an entry marked `superseded`, with the record that replaced them, so an old
  document still parses.

## Verification

| Claim                              | Test                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Each term is defined once          | `cut -d'\|' -f2 Documentation/Reference/Glossary.md \| sort \| uniq -d` prints nothing (intent until the file exists)                 |
| Every term in the table is present | `cut -d'\|' -f2 Documentation/Reference/Glossary.md \| grep -c room` prints 1                                                         |
| No record uses an undefined term   | a term audit over Documentation/RFC/proposed against the glossary reports nothing (intent; needs a curated list, not every code span) |
| The collision is gone              | `grep -rn "const membership" Maintain/Spacetime/spacetimedb/src/index.ts` returns nothing once renamed (intent)                       |
| The rename is a schema change      | the diff that renames the table also bumps the module's schema version (review rule, RFC-0002)                                        |
| The glossary is well formed        | `pnpm exec prettier --check Documentation/Reference/Glossary.md`                                                                      |

## Open questions

- Whether the glossary is prose or generated. Prose is the definition and the schema is checked
  against it; the reverse - generating prose from a table - cannot express a distinction like
  "circle has no table".
- Whether a term may be defined in an RFC and only later enter the glossary. The rule says no: the
  glossary entry lands with the record. That means this record and the glossary file must be written
  in one change.
- Whether any current document already uses "channel" in a different sense. The audit above settles
  it before the glossary is accepted, and the answer may add a second rename.

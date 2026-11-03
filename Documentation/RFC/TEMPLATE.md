---
title: The record's title, without the number
rfc: 00NN
category: Architecture/Data
kind: rfc
date: YYYY-MM-DD
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: the components this decision binds
supersedes: none
superseded_by: none
depends:
    - RFC-XXXX (what this record extends or needs)
    - t_XXXXXXXX (the card that implements it)
statuses:
    - name: The rule in a few words
      state: open
      evidence: the file or command that settles it
---

`Scripts/RFC-Frontmatter.mjs` writes this block from the record's own sections and checks it inside
`pnpm run check`; a copied template is rewritten on the first `--write`. What a person decides is
the title, the date, the owner, what the record applies to, what it depends on, and the rules in the
Decision section. Everything else is read from the file or from the assignment table.

- **title** - the record's title. The number lives in `rfc`, and the filename carries both.
- **rfc** - four digits, matching the filename. Never reused, never renumbered.
- **category** - `<Kind>/<Subject>` from the two closed vocabularies in `README.md`, in capitals:
  `Architecture/Data`, `Policy/Identity`.
- **kind** - `rfc`. It is what tells a generator that this document is a record and not an index or
  a registry page.
- **date** - the day the decision was written.
- **status** - `proposed`, `settled` or `superseded`. Lowercase, and the only lifecycle field.
- **horizon** - `now`, `next` or `later`: what the Decision presupposes, not when the work happens.
- **registry**, **index** - both name the document this record appears in. They are the same file
  today and they answer different questions, so a later split needs no migration.
- **owner** - who is answerable for the record.
- **applies_to** - the components the decision binds.
- **supersedes**, **superseded_by** - `none`, or the number of the record on the other end. Both
  records stay.
- **depends** - the records and the cards this one names, one per entry, each with its reason.
- **statuses** - one entry per rule in the Decision section: the rule in a few words, whether the
  tree holds it (`current`) or does not yet (`open`), and the file or command that settles it. A
  rule that names no file or command is `open`; the tool never calls a rule settled on no evidence.

## Decision

One paragraph stating what is being decided, in the present tense, as a rule. If a reader stops here
they should know what changes.

## Context

What makes the decision necessary. Measured facts, with the command that produced them. No
adjectives where a number exists.

## Alternatives considered

| Option | Why not chosen |
| ------ | -------------- |
|        |                |

## Consequences

- What becomes easier.
- What becomes harder or impossible.
- What must be true for this to remain correct.

## Verification

| Claim | Test |
| ----- | ---- |
|       |      |

## Open questions

- Anything unresolved, marked UNKNOWN rather than assumed.

# RFC corpus

One issue per design record in a numbered corpus. A record is a decision document kept in the
repository, and its issue carries that decision into the tracker, so the reasoning behind a piece of
work is readable in the same place the work is tracked. The project holds @@COUNT@@ issues, and its
views are three arrangements of the same @@COUNT@@ items, not three collections.

---

## The corpus

Records are numbered in sequence and the number is the identity. `RFC-0001` is the first record and
remains the first record; a number is never reused, and a withdrawn record keeps its number while
naming whatever replaces it. The issue title repeats the number and title in the form
`RFC-00NN @@DASH@@ <title>`.

---

## Fields

- **Title** - built-in. The record's number and title, and the only place the pair appears as a
  single string.
- **Status** - built-in, repurposed as a single-select with exactly two options, `Proposed` and
  `Implemented`. A record is `Proposed` until its verification table passes against shipped code,
  then `Implemented`. The second option means the claims in the table have been tested against code
  that exists, not that a plan exists. The record states `proposed`, `settled` or `superseded`;
  `settled` is the value written as `Implemented`, and `superseded` has no option here, so it is
  reported and the field is left alone rather than written as another state.
- **RFC** - a text field holding the record's number, zero-padded. It sorts the corpus in its own
  order and survives title edits. A plain project field is text or a number depending on how it was
  created, and this one holds `0001`, so the value written into it is text.
- **Kind** - single-select: architecture, contract, policy, specification, method. What the record
  decides. The value is the first half of the record's `category` and is never inferred.
- **Subject** - single-select: data, transport, identity, surface, network, operation, economy,
  text. What the record is about, as the noun its rules operate on rather than the file they land
  in. The value is the second half of `category`.
- **Horizon** - single-select: now, next, later. What the record presupposes - something in the
  tree, a room or key or host that does not exist yet, or a party outside this network.
- **Cards** - text, the card ids a record names, comma-separated. Empty when a record names none; a
  record that names a card and is later implemented keeps the ids.

The three axes are closed vocabularies with no value on two of them, so a value names one question
and cannot be read as the answer to another. Their definitions, and the rules that make a record
assignable from its Decision section alone, are in the corpus README.

---

## Views

- **Table, grouped by `Kind`** - the corpus as five shelves. Reading down a kind shows what has been
  decided about one sort of question, in number order.
- **Board, grouped by `Status`** - the work queue. `Proposed` on one side, `Implemented` on the
  other, and the movement between them is the only movement the board records.
- **Roadmap, grouped by `Kind`** - the same grouping laid out over time, for judging how much of
  each kind is still open.

All three views show all @@COUNT@@ issues. None filters, so a record cannot be visible on one view
and absent from another.

---

## Copying the project

```sh
gh project copy 1 --source-owner <owner> --target-owner <owner> --title "RFC corpus"
gh project mark-template <number> --owner <owner>
```

The copy carries the fields, their options and the three views into the target owner, and takes the
number that owner assigns, which is `<number>` in the second command. Marking the project a template
makes it copyable from the interface by anyone who can read it, which is the point of publishing it.

One step stays manual. GitHub's GraphQL API accepts a view's name, layout, filter and visible
fields, and accepts no group-by or sort-by on any input object, so grouping is a UI action. After
the copy, each view is opened once and given its grouping: `Kind` for the table, `Status` for the
board, `Kind` for the roadmap. Everything else arrives intact.

---

## Issue bodies

A body is assembled, never written.

- **Decision** - the record's `## Decision` section, copied verbatim, headings and emphasis
  included.
- **Kind, Subject, Horizon** - the three values from the record's frontmatter, stated in prose so
  the body reads on its own. `category` carries the first two as one field; the body states them
  apart.
- **Task dependencies** - the record's `depends` entries, joined with `, ` in the order the record
  states them, so the body reads as the line it always was.
- **Source** - the record's repository-relative path in `<owner>/<repo>`, corpus directory included,
  so the file is one step from the issue. A copy of the project points at whatever directory holds
  the corpus in the target repository.
- **Verification** - the record's verification table, copied verbatim, as the test that moves
  `Status`.

The body is never a summary. A summary would drift from the record the first time the record is
edited, and a reader comparing the two would have no way to tell which is current. When a record
changes, the body is rebuilt from it.

---

## Precedence

The record is authoritative and the issue follows it. A decision that exists only on the board does
not exist; a classification or a status that disagrees with the record is wrong at the board. The
corpus is public so that the reasoning can be read without access to the tracker, and the tracker is
public so that the state of each record can be read without opening @@COUNT@@ files.

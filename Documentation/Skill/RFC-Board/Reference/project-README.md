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
  that exists, not that a plan exists.
- **RFC** - a text field holding the record's number, zero-padded. It sorts the corpus in its own
  order and survives title edits. A plain project field is text or a number depending on how it was
  created, and this one holds `0001`, so the value written into it is text.
- **Class** - single-select: architecture, product, policy, governance, methodology. The value is
  copied from the record's `Decision class:` header and never inferred.
- **Area** - single-select: site, network, identity, tooling, governance. One value per record, the
  record's dominant subject. Ties resolve by permission to governance, wire, room or host to
  network, key or name to identity, file, build or tool to tooling, and rendering to site.
- **Cards** - text, the implementing card ids a record names, comma-separated. Empty when a record
  names none; a record that names a card and is later implemented keeps the ids.

---

## Views

- **Table, grouped by `Class`** - the corpus as five shelves. Reading down a class shows what has
  been decided about one kind of question, in number order.
- **Board, grouped by `Status`** - the work queue. `Proposed` on one side, `Implemented` on the
  other, and the movement between them is the only movement the board records.
- **Roadmap, grouped by `Class`** - the same grouping laid out over time, for judging how much of
  each class is still open.

All three views show all @@COUNT@@ issues. None filters, so a record cannot be visible on one view
and absent from another.

---

## Copying the project

```sh
gh project copy 1 --source-owner TimeLine-DELO --target-owner <owner> --title "RFC corpus"
gh project mark-template <number> --owner <owner>
```

The copy carries the fields, their options and the three views into the target owner, and takes the
number that owner assigns, which is `<number>` in the second command. Marking the project a template
makes it copyable from the interface by anyone who can read it, which is the point of publishing it.

One step stays manual. GitHub's GraphQL API accepts a view's name, layout, filter and visible
fields, and accepts no group-by or sort-by on any input object, so grouping is a UI action. After
the copy, each view is opened once and given its grouping: `Class` for the table, `Status` for the
board, `Class` for the roadmap. Everything else arrives intact.

---

## Issue bodies

A body is assembled, never written.

- **Decision** - the record's `## Decision` section, copied verbatim, headings and emphasis
  included.
- **Class** - the value from the record's header, stated in prose so the body reads on its own.
- **Task dependencies** - the record's `Task dependencies:` line, copied as it stands.
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
not exist; a status that disagrees with the verification table is wrong at the board. The corpus is
public so that the reasoning can be read without access to the tracker, and the tracker is public so
that the state of each record can be read without opening @@COUNT@@ files.

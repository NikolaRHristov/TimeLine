---
name: rfc-board
description: "Use when the RFC board must be built or re-synced."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos, linux]
metadata:
    hermes:
        tags: [rfc, github-projects, gh, board, publishing]
---

# RFC Board

The project at `TimeLine-DELO` project 1 is a projection of the record files in
`Documentation/RFC/proposed/`, not a second copy of them. One direction of flow: the record is
authoritative, the issue follows the record, the project item follows the issue. Nothing in this
procedure writes back into a record.

The tool that does the work is `Reference/rfc_board.py`, a single command with four subcommands.

---

## When to Use

- A record was added, edited or renumbered, and the board must follow it.
- The board and the corpus disagree about how many records exist.
- A clone needs its own copy of the board, or a copy of the project needs to point at another
  repository.
- Someone asks whether the published board still matches the tree.

Do not use it to publish a record that is not committed. See "What May Be Published".

---

## The Commands

```sh
python3 Documentation/Skill/RFC-Board/Reference/rfc_board.py render
python3 Documentation/Skill/RFC-Board/Reference/rfc_board.py publish --dry-run
python3 Documentation/Skill/RFC-Board/Reference/rfc_board.py publish
python3 Documentation/Skill/RFC-Board/Reference/rfc_board.py verify
python3 Documentation/Skill/RFC-Board/Reference/rfc_board.py readme
```

The root scripts are the same calls: `pnpm run RFC:Board` is `publish`, `pnpm run RFC:Board:Verify`
is `verify`.

- **`render`** reads every committed record, writes one issue body per record into the work
  directory, leak-scans the bodies and proves each `## Decision` section survived the round trip
  byte for byte. It touches nothing remote, so it is the safe first look.
- **`publish`** creates the issues that are missing, refreshes the bodies that drifted, adds the
  issues to the project, writes the field values that disagree with the record and syncs the project
  README. It is idempotent: a second run creates nothing, rewrites nothing and leaves an agreeing
  field alone. `--dry-run` prints the plan and writes nothing.
- **`verify`** reads the published project independently of `publish` and exits non-zero on the
  first disagreement. Its checks are the table at the end of this file.
- **`readme`** uploads `Reference/project-README.md` alone, for the runs where only the prose moved.
  `publish` calls the same code, so the two cannot disagree.

The work directory is `Maintain/Storage/RFC-Board/` by default (gitignored, `--work` overrides it).
It holds `records.json` and one rendered body per record; it is a build product and nothing reads it
back as input.

---

## What May Be Published

`git ls-files Documentation/RFC/proposed` is the list. A record that is still untracked is
somebody's work in progress: it is printed as
`skip <path> (untracked: not committed, so not published)` and it is never published half-written.
The count `verify` asserts is the number of committed records, so a half-finished record cannot make
the board look incomplete.

The consequence is deliberate and worth stating plainly: a record becomes visible on the board one
step after it becomes part of the tree. Commit the record, run `publish` again, and the delta lands.
An unreadable committed record is refused rather than skipped: `publish` exits non-zero and
publishes nothing, because a corpus that cannot be parsed is a corpus whose board would be a guess.

---

## The Record Is the Authority

- **The body is assembled, never written.** It carries the `## Decision` section verbatim, the
  `## Verification` table verbatim, the three classification axes, the status, the `depends` entries
  joined with commas, the implementing card ids and a link to the file. It is never a summary, so it
  cannot drift from the record in a way a reader could not detect.
- **A body that differs from its record is rewritten.** `publish` compares the published body with
  the freshly rendered one and edits the issue when they differ, so editing a record and re-running
  is the whole update procedure.
- **The classification is read from the frontmatter, never from a side table.** `category` states
  `Kind` and `Subject` together and `horizon` states the third; `verify` compares every item's three
  values against its record's, so a board that disagrees with the corpus fails rather than reporting
  a second opinion.
- **`Status` moves when the verification table passes against shipped code**, not when a plan
  exists. The value is copied from the record's frontmatter - `settled` is written as `Implemented`,
  and `superseded` is reported and left alone - and the tool never infers it.
- **A record that names no implementing card is design, not debt.** `horizon` (`now`, `next`,
  `later`) states what the Decision presupposes, not who is working on it: `later` means nothing
  here is owed. Sixty records at `later` are sixty decisions waiting for a presupposition, and the
  board carries no due date and no `late` state for exactly that reason. Reading the horizon as a
  backlog turns a settled design into a permanent failure - the measurement the README's "By
  horizon" section reports is a split, not a fault in the axis.
- **The frontmatter is generated, and Prettier has the last word on its shape.** Prettier reformats
  a YAML block inside markdown: it wraps a scalar past the print width and turns a double-quoted
  value into a single-quoted one when the text holds a double quote. `Scripts/RFC-Frontmatter.mjs`
  writes what Prettier keeps - a literal block past 100 columns, the quote that needs no escape - so
  `prettier --check Documentation/RFC` is clean without a second pass over the corpus. A hand-edited
  block that misses either still parses, and fails the format check instead: run `--write`, never a
  formatter, to change one.

---

## What the API Cannot Do

A view's group-by is a manual interface step. GitHub's GraphQL schema accepts a view's name, layout,
filter and visible fields, and no input object accepts `groupBy` or `sortBy`:
`CreateProjectV2ViewInput` and `UpdateProjectV2ViewInput` carry only `name`, `layout`, `filter` and
`configuration.visibleFieldIds`. The three views therefore arrive ungrouped from `gh project copy`,
and each is opened once and given its grouping by hand: `Kind` for the table, `Status` for the
board, `Kind` for the roadmap.

Deleting a field is also API-reachable, and it un-groups every view that grouped by it. Retiring
`Class` and `Area` for the three axes therefore costs one interface pass over the two views that
grouped by `Class`, which is the same pass a new project needs. The views are renamed to match in
the same operation; a view whose name promises a grouping it no longer has is worse than an
ungrouped one.

Everything else about the project is API-reachable: the fields, their options, the item set and
every field value.

---

## Nothing Machine-Specific Is Baked In

The project id is resolved from `--owner` and `--project`; the field ids, their data types and their
option ids come from the project's own field list over GraphQL, in one request. The defaults are
`TimeLine-DELO`, repository `TimeLine`, project `1`, branch `Current`; every one of them is a flag,
so the same tool drives a copy of the project on another owner without an edit:

```sh
python3 Documentation/Skill/RFC-Board/Reference/rfc_board.py publish \
  --owner <owner> --repo <repository> --project <number> --branch <branch>
```

The record-to-axis assignment is in the record, not in the tool: `category` states `Kind` and
`Subject` together and `horizon` states the third, and the definitions plus the tie-break rules are
in `Documentation/RFC/README.md`. `Scripts/RFC-Frontmatter.mjs` checks them inside `pnpm run check`,
so a record with a missing or invented value fails before it reaches the board. The tool reads the
three values and refuses a record whose value is outside the vocabulary, naming the record and the
axis rather than publishing a guess.

---

## Pitfalls That Cost a Run

- **A literal em dash does not survive the tool transport.** A U+2014 written into a file or passed
  as an argument arrives as an ASCII hyphen, and every issue title silently loses its separator. The
  separator is built at runtime (`SEP = "\u2014"`), and the project README carries the `@@DASH@@`
  token for the same reason. An issue title is the record id, then the separator, then the record
  title.
- **`gh issue create` has no `--json` in gh 2.102.1.** It prints the issue URL on its last line,
  which is where the issue number comes from.
- **`gh project item-edit` costs one process and one API call per field**, which is 284 calls for 71
  records and times out. Field writes are aliased `updateProjectV2ItemFieldValue` mutations instead,
  four records per request; about twenty aliases is the ceiling before GitHub answers 502.
- **GraphQL input objects take unquoted keys**: `{number: 12}`, not `{"number": 12}`. `json.dumps`
  produces the wrong literal for the object, so the object is written by hand and only its string
  values are escaped.
- **`Status` is the built-in single-select, repurposed.** A second field with that name cannot be
  created, so the built-in one carries `Proposed` and `Implemented`. A project without those options
  fails the run with the option list it found.
- **A plain field's data type decides the literal.** A field that is not a single-select is text or
  a number depending on how it was created: this project's `RFC` holds the zero-padded text `0001`,
  so `{number: 1}` is refused and `{text: "0001"}` is accepted. The tool reads `dataType` from the
  schema and writes the matching shape rather than assuming a number.
- **A count written into prose goes stale.** The project README carries `@@COUNT@@` for the corpus
  size and `@@DASH@@` for the separator; both are resolved at upload, so adding a record cannot
  leave the prose claiming the old total.
- **The leak pattern is assembled from parts.** The archiver that copied this tool into `Reference/`
  scrubs a literal home root on the way in, so a pattern written as one literal would arrive with
  `<home>` where its own first branch should be. `LEAK` is therefore built from string fragments,
  and its `.local` branch excludes a following dot so a repository path such as
  `Maintain/Spacetime/spacetime.local.json` is a path and not a hostname.
- **A field's id changes when its data type does.** `UpdateProjectV2FieldInput` carries a name and,
  for a select field, its options; it has no data type. Moving a field from number to text means
  deleting and recreating it under the same name, which issues a new id and appends the field to the
  end of each view's columns, because `visibleFieldIds` is a set and accepts membership rather than
  order. Resolve every id at run time and a stale id cannot be mistaken for an empty column.
- **A deleted field takes its values and its groupings with it.** `deleteProjectV2Field` is one
  call, and it removes every value written into the field and un-groups each view that grouped by
  it. The grouping is not restorable by any API call, so a retirement needs the assignment committed
  first: `Documentation/Reference/RFC-Classification.md` is the only complete record of what the old
  values were, and `Scripts/RFC-Frontmatter.mjs --write` repopulates the new fields from it.
- **`gh project item-list` lowercases only the first letter of a field name**, so a field named
  `RFC` arrives under the key `rFC`. Reading the wrong key looks exactly like a field that is empty
  on every item, which is why `verify` reads its values over GraphQL.
- **`gh issue list` is served by the search API**, which has its own budget of about thirty requests
  a minute shared with every other client of the same token, and a refusal reads like an exhausted
  token rather than an exhausted search allowance. The tool reads issues over REST instead; only
  `gh project item-list`, the count the acceptance names, still goes through the CLI.
- **`gh project item-list` is paginated and capped.** `verify` reads items over GraphQL, and
  `--limit` is a flag because a corpus that outgrows the page size would otherwise be counted short.

---

## Adding a Record

1. Write `Documentation/RFC/proposed/RFC-00NN-<slug>.md` from `TEMPLATE.md`: the frontmatter block,
   a `## Decision` section and a `## Verification` table. The `## Open questions` section is
   optional; everything else the body renders from is required.
2. Choose `category` and `horizon` from the vocabularies in `Documentation/RFC/README.md`, then run
   `node Scripts/RFC-Frontmatter.mjs` and add the record to the audit's assignment table if it is
   new there. A value outside a vocabulary fails the check.
3. Commit the record. `publish` reads committed records only.
4. Run `publish`, then `verify`. A non-zero exit from `verify` names the item and the field that
   disagree.
5. Open the three views once and set each group-by, if the project is new.

---

## Exit Codes

| Exit | Meaning                                                                   |
| ---- | ------------------------------------------------------------------------- |
| `0`  | the command did what it reports; `verify` means every check passed        |
| `1`  | `render`: a leak hit or a mangled Decision section                        |
| `1`  | `publish`: a leak hit, or any create, refresh, add or field write failed  |
| `1`  | `verify`: at least one check failed; the failing check is printed as FAIL |
| `2`  | the inputs are wrong: no corpus above the tool, no `area.json`, no `gh`   |

---

## Files

| File                          | What it is                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `SKILL.md`                    | this procedure                                                                      |
| `Reference/rfc_board.py`      | the tool: `render`, `publish`, `verify`, `readme`                                   |
| `Reference/project-README.md` | the project's own README, ASCII, with `@@DASH@@` and `@@COUNT@@` resolved at upload |
| `Reference/Index.md`          | the archive index for this directory                                                |

---

## Verification

| Claim                             | Test                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| The tool runs from the tree       | `python3 Documentation/Skill/RFC-Board/Reference/rfc_board.py render` exits 0 and prints `decision text intact: N/N`                              |
| Only committed records publish    | `git ls-files Documentation/RFC/proposed \| wc -l` and the `committed records:` line of `render` agree                                            |
| The board count is the corpus     | `python3 .../rfc_board.py verify` prints `committed records: N   board items: N` and exits 0                                                      |
| Every item has RFC and every axis | the `[2]` block of `verify` prints `without RFC: 0`, `without Kind: 0`, `without Subject: 0` and `without Horizon: 0`                             |
| The board agrees with the files   | the `[2]` block prints `items whose axes disagree with their record: 0`, and the per-axis counts equal `node Scripts/RFC-Frontmatter.mjs`         |
| Publishing is idempotent          | a second `publish` prints `created=0 bodies_refreshed=0 items_added=0 fields_written=0`                                                           |
| The group-by gap is real          | `gh api graphql -f query='query{__type(name:"UpdateProjectV2ViewInput"){inputFields{name}}}'` prints six fields and none is `groupBy` or `sortBy` |
| The tool carries no machine path  | `python3 Documentation/Skill/Tool-Archive/Reference/archive_tool.py --audit` prints `clean: no home paths`                                        |
| The separator is a real em dash   | `gh api repos/TimeLine-DELO/TimeLine/issues/6 --jq .title \| od -An -tx1 \| head -1` shows `e2 80 94` between the id and the title                |

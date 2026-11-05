# Board

## An RFC record's life

A record is a file before it is anything else. It is written under `Documentation/RFC/proposed/`
from `TEMPLATE.md`, it carries `status: proposed` until its verification table passes against
shipped code, and it moves to `implemented/` only then (`Documentation/RFC/README.md`,
"Conventions"). Supersession is a field pair, not a deletion: the new record marks the old one
`superseded_by`, and both stay.

legend: solid arrow = a transition a file performs; dotted arrow = a transition nothing performs;
box = a state a file names; hexagon = a state no file names.

```mermaid
stateDiagram-v2
  [*] --> Drafted: written from TEMPLATE.md
  Drafted --> Proposed: committed under proposed/
  Proposed --> Settled: the verification table passes against shipped code
  Settled --> Implemented: moved to implemented/
  Proposed --> Superseded: superseded_by names the successor
```

---

## The generation rule

The record is authoritative, the issue follows the record, the project item follows the issue, and
nothing in the procedure writes back into a record (`Documentation/Skill/RFC-Board/SKILL.md`). The
body is assembled rather than written - the `## Decision` section and the `## Verification` table
travel verbatim - so a body that differs from its record is detectable, and only `sync` rewrites it.
Only committed records publish: the list is `git ls-tree` of one commit.

legend: solid arrow = a transition a file performs; dotted arrow = a transition nothing performs;
box = a state a file names; hexagon = a state no file names.

```mermaid
flowchart LR
  F["proposed/*.md"] -->|"git ls-tree of one commit"| R["render"]
  R -->|"Decision and Verification verbatim"| I["issue"]
  I -->|"one item per issue"| P["project item"]
  P -->|"six fields"| B["board"]
  B -.->|"nothing writes back"| F
  Q{"board holds items?"} -->|"sync without --reason"| N["refused, exit 2"]
  Q -->|"sync --reason"| P
```

---

## What holds the record's shape

`rfc_board.py` parses every record before it renders one: a missing axis, a value outside a
vocabulary, or a `category` that is not `<Kind>/<Subject>` is refused by name. The frontmatter is
written to the shape Prettier keeps, so `prettier --check Documentation/RFC` is clean without a
second pass. `verify` is the only thing that reads the published board, and it is run by hand.

legend: solid arrow = a transition a file performs; dotted arrow = a transition nothing performs;
box = a state a file names; hexagon = a state no file names.

```mermaid
flowchart TD
  PARSE["rfc_board.py"] --> AX["three axes present and in vocabulary"]
  PRET["prettier --check Documentation/RFC"] --> SH["frontmatter shape"]
  VER["rfc_board.py verify"] -.->|"run by hand"| LIVE["the published board"]
```

---

## The missing states

Four conditions the corpus and the board can be in with nothing to name them. Each is stated by a
file and unreachable from any command that runs on its own, so it is drawn as a gap rather than as a
state the tool would report.

- `superseded` has no option on the board. The record renders its own word in the issue and leaves
  the field alone, so a superseded record and a proposed one are indistinguishable in `Status`.
- `settled` is named and never instantiated. All seventy-six records carry `status: proposed`, and
  `Documentation/RFC/implemented/` does not exist, so the settled and implemented states are
  vocabulary with no instance.
- A record edited after its commit publishes the committed bytes. The tree holds newer text, the
  board holds the old body, and the run reports it as a warning rather than as a state.
- An issue with no record, or a record with no issue, is called a defect of the same kind as an
  unlisted file, and only a manual `verify` reads the live board.

legend: solid arrow = a transition a file performs; dotted arrow = a transition nothing performs;
box = a state a file names; hexagon = a state no file names.

```mermaid
flowchart TD
  S["Status field"] -.-> G1{{"gap: superseded has no board option"}}
  ST["status: settled"] -.-> G2{{"gap: named, never instantiated"}}
  ED["record edited after commit"] -.-> G3{{"gap: board holds the committed bytes"}}
  D["issue with no record"] -.-> G4{{"gap: only a manual verify reads the board"}}
```

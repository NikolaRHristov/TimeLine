---
title: A worker that cannot hold both cards stops
rfc: 0076
category: Method/Operation
kind: rfc
date: 2026-11-03
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: every card worked on the shared board, and the coordinator that decomposes an epic
supersedes: none
superseded_by: none
depends:
    - |-
        extends `Documentation/Skill/Parallel-Epic-Execution/SKILL.md:86-94` from a pitfall into a decision
    - |-
        RFC-0010 (documentation and template policy); implementing card to be created: "Make the block kind and the decision comment part of the card template"
statuses:
    - name: '"Both cannot hold" is a finding the worker establishes, not a suspicion it...'
      state: open
      evidence: the rule names no file or command
    - name: The worker stops before rewriting the sibling's output
      state: open
      evidence: the rule names no file or command
    - name: The work is preserved so it can be restored byte-identically
      state: open
      evidence: the rule names no file or command
    - name: The escalation is a comment with the evidence, then a block with the reason
      state: open
      evidence: the rule names no file or command
    - name: A file two cards own is named as a hotspot
      state: open
      evidence: the rule names no file or command
    - name: The decision is recorded on the card before either card resumes
      state: open
      evidence: the rule names no file or command
    - name: The card that loses is closed as superseded, and its surviving contributions...
      state: open
      evidence: the rule names no file or command
    - name: A rule written to protect a feature can itself be the conflict
      state: open
      evidence: the rule names no file or command
---

## Decision

When two cards cannot both hold, the worker stops, preserves its work so it can be recovered
byte-identically, and asks; the decision is recorded on the card before either card resumes. A
worker that guesses which card wins costs one of them the whole run, and a decision that exists only
in a conversation is a decision the next worker re-litigates.

1. **"Both cannot hold" is a finding the worker establishes, not a suspicion it reports.** The
   finding names four things: the two card ids, the files or routes they both claim, the two
   decisions that contradict, and the commits where each side's work can be found. A card blocked
   without those four is a card that will be unblocked with a question rather than a decision.
2. **The worker stops before rewriting the sibling's output.** A worker that overwrites the other
   card's files destroys the evidence that would have made the decision cheap, and it turns one
   blocked card into two wrong implementations of one page. `Parallel-Epic-Execution/SKILL.md:86-89`
   states the rule and the arithmetic: the cost of one blocked card is smaller than two
   implementations of one page.
3. **The work is preserved so it can be restored byte-identically.** Preservation is a commit, a
   recorded commit hash, or a copy held aside - and the record says which. A restore is then proven,
   not eyeballed: `git hash-object <path>` against `git rev-parse <commit>:<path>`, or `cmp` against
   the preserved copy (`Parallel-Epic-Execution/SKILL.md:90-94`). A restore that only looks right is
   a second implementation, and every measurement made against the first one describes something
   else.
4. **The escalation is a comment with the evidence, then a block with the reason.** The comment
   carries the measurements, the two options and the restore handle; the block carries a one-line
   reason and `kind` naming why - `needs_input` when a person must choose, `dependency` when another
   card must land first. The comment is what the person reads; the block is what the board shows.
5. **A file two cards own is named as a hotspot.** A comment beginning `hotspot: <path> - <reason>`
   marks the collision, so the coordinator can decompose the file before more work lands on it
   rather than discovering the collision a third time.
6. **The decision is recorded on the card before either card resumes.** It names which record was
   amended, which card was reversed, and what the other card may do next. Both cards resume from
   that comment, so the next worker inherits a decision instead of a conversation.
7. **The card that loses is closed as superseded, and its surviving contributions are enumerated.**
   The measurements, the fixes adopted elsewhere, the artifact left in history at a named commit.
   "Superseded" alone is not a record: a card that closes without saying what survived has thrown
   away the reason it was worth running.
8. **A rule written to protect a feature can itself be the conflict.** When an escalation reveals
   that the rule was the defect, the rule is amended and the worker is told its work was correct.
   The worker is not asked to absorb a reversal it argued against, because the next worker reads the
   same rule and would make the same finding.

## Context

The board holds two escalations on this pattern, and both were upheld:

| Card         | What the worker established                                                                                                                                          | How it resolved                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `t_ac439865` | one route was claimed by a second card under a rule that reversed the first card's target; the composition was built, measured and left restorable at a named commit | closed as superseded, with the surviving contributions enumerated                                                   |
| `t_52a99949` | both routes it owned were rewritten mid-run into the opposite design; the implementation was preserved and hash-verified                                             | upheld, then the rule that caused the reversal was withdrawn - the restore was correct work on a rule later amended |

`hermes kanban show t_ac439865` and `hermes kanban show t_52a99949` print the block event with its
reason and kind, and the decision comment that followed it. Twice a worker stopped on a route
conflict, and twice the stop was upheld. In the second, the escalation also surfaced a rule that was
then withdrawn, which is the outcome a guess cannot produce: guessing would have produced one
implementation and no finding.

The cost of the alternative is on the record too. One card completed, was rewritten after
completion, restored, rewritten again, and restored a second time before the decision landed - four
rewrites of two files, each one re-run against the gates, because the two cards were allowed to keep
writing while the question was open. That is the shape this record exists to prevent: the block is
cheap, the loop is not.

The vocabulary is already in the board tooling. A block records `kind` alongside its reason - the
`t_ac439865` event carries `"kind": "needs_input"` - so rule 4 asks the worker to use the
distinction the tool already makes rather than a free-form sentence.

The restore rule is not new here. `Parallel-Epic-Execution/SKILL.md:90-94` states it, and the second
card's handover records the proof: every restored file compared by `git hash-object` against its
source blob, and the preserved copies compared with `cmp`. This record promotes that skill's pitfall
to a decision, because a pitfall in a skill is advice and a record is a standard.

## Alternatives considered

| Option                                                                 | Why not chosen                                                                                                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| The worker decides which card wins and continues                       | it has the least information of anyone on the board - it knows its own card and a diff, not the other card's intent                 |
| The worker keeps both implementations and lets the coordinator pick    | the tree then holds two designs of one route, every gate result describes a tree nobody intended, and the next worker inherits both |
| Escalate in conversation only                                          | the decision is lost to the next worker, who re-derives the conflict and may decide the other way                                   |
| Close the conflicting card as superseded without enumerating survivors | the measurements and the adopted fixes are the part that was worth having; a bare closure discards them                             |
| Ask the worker to reconcile the two records itself                     | a record is amended by whoever owns the decision; a worker editing a record to win an argument is a worker grading its own work     |
| Restore from memory of what the file said                              | a restore that only looks right is a second implementation, and the measurements made against the first no longer describe it       |

## Consequences

- An epic loses one card's run time to the block, and keeps both cards' work, which is the trade the
  arithmetic in rule 2 recommends.
- Every conflict leaves a durable comment with measurements, so the same collision is cheap to
  recognise the second time.
- The hotspot convention makes a collision visible to the coordinator before the third card lands on
  the same file.
- Because the decision must name which record was amended, a wrong rule is corrected at the record
  rather than worked around in the code.
- A worker that blocks on a suspicion rather than a finding costs a decision cycle for nothing, so
  rule 1's four items are the discipline that keeps the block honest.
- The board becomes the place a design argument is settled, which means the board is a source of
  record and has to be read like one.

## Verification

| Claim                                      | Test                                                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Two escalations exist on the board         | `hermes kanban show t_ac439865` and `hermes kanban show t_52a99949` → each prints a `blocked` run with a reason and a decision comment |
| Both were upheld                           | `hermes kanban show t_ac439865 \| grep -ci superseded` → `9` lines; `hermes kanban show t_52a99949 \| grep -ci withdrawn` → `1`        |
| The block kind is recorded                 | `hermes kanban show t_ac439865 \| grep -o "kind.: .[a-z_]*"` → `needs_input`                                                           |
| Hotspots are named on the card             | `hermes kanban show t_52a99949 \| grep -c hotspot` → `2`                                                                               |
| The stop rule is already written down      | `grep -n "blocked card, not a race" Documentation/Skill/Parallel-Epic-Execution/SKILL.md` → `:86`                                      |
| A restore is proven by hash                | `grep -n "byte-identical copy" Documentation/Skill/Parallel-Epic-Execution/SKILL.md` → `:90`                                           |
| The restore was proven on the card         | `hermes kanban show t_52a99949 \| grep -i "hash-object"` → the handover's hash comparison                                              |
| A winning card enumerates its survivors    | `hermes kanban show t_ac439865 \| grep -i "surviving"` → the closure's list of contributions                                           |
| The template has no field for a block kind | `grep -c "kind" Documentation/RFC/TEMPLATE.md` → `0`                                                                                   |

## Open questions

- Whether a blocked card should be unblocked automatically when its dependency lands, and whether
  that is safe when the dependency's decision reverses the blocked card's premise.
- Whether the coordinator should hold a dispatch when two ready cards name the same route, rather
  than discovering the collision from a block. The board knows both bodies; nothing checks them
  against each other.
- Whether the hotspot convention should be enforced by a tool that compares ready cards' file
  claims. Today it is a comment a worker writes when it notices.
- UNKNOWN how many escalations the pattern needs before it is a rule rather than a response. Two is
  what the board holds, and both were upheld, which is evidence of a practice and not a measurement
  of how often the alternative fails.

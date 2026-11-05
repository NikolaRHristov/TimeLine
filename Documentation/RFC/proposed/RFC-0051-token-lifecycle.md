---
title: The token lifecycle
rfc: 0051
category: Policy/Surface
kind: rfc
date: 2026-11-02
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: |-
    `Global.css`, the material mixins, every component's public props
supersedes: none
superseded_by: none
depends:
    - RFC-0045 (the token set and the material)
    - RFC-0044 (the toolchain floor and its upgrade policy)
    - RFC-0049 (the component states)
statuses:
    - name: A token arrives with a reader
      state: open
      evidence: the rule names no file or command
    - name: A rename is an alias, not a rewrite
      state: open
      evidence: the rule names no file or command
    - name: A removal is proved, never assumed
      state: open
      evidence: the rule names no file or command
    - name: A component's public surface is its props
      state: open
      evidence: the rule names no file or command
    - name: Deprecation is visible at build time
      state: open
      evidence: the rule names no file or command
---

## Decision

A design system is a set of names that other code depends on, so its changes are versioned and its
retirements are staged. Four moves are allowed and no others: add, alias, deprecate, remove.

The system's version is the shape of its token set - the names and their roles - not the values
behind them. Changing `--chrome-void` from `#1c1c1e` to `#1b1b1d` is not a version change; renaming
it, or removing it, is.

Five rules make that enforceable.

### 1. A token arrives with a reader

A token is added in the same change as the sheet or component that reads it. A token nobody reads is
a defect, and the reason is not tidiness: an unread token is a name someone will guess the meaning
of later, and guess wrong.

### 2. A rename is an alias, not a rewrite

Renaming is two steps in one change:

1. the new name is declared with the same value, and the sheets move to it;
2. the old name stays as an alias to the new one, marked `deprecated`.

The alias is removed at the next major, when the contract check can prove nothing reads it. A rename
that deletes the old name in place breaks every consumer outside the tree, and this repository is
public: a clone that pinned a commit will not be updated by the change that breaks it.

### 3. A removal is proved, never assumed

A token is removed when the contract check reports zero reads and the tree builds without it. The
check is the proof; a `grep` by hand is a guess that misses a computed read.

### 4. A component's public surface is its props

A component's props are its API. Adding an optional prop is a minor change; adding a required one,
renaming one, or changing what an existing one means is a major change and takes the alias path of
rule 2 where the language allows it.

A prop whose meaning changes without its name changing is the worst case, because nothing fails and
everything is wrong. It is treated as a removal and an addition.

### 5. Deprecation is visible at build time

A deprecated token or component renders a warning during the check, naming the replacement and the
version it will be removed in. A deprecation nobody sees is a removal that arrives as a surprise.

The warning is a build-time report, never a runtime console message, because the runtime message
reaches the reader rather than the person who can fix it.

## Context

RFC-0045 fixes what the material and the token set are. It does not say how either may change, and a
public tree whose design system changes without a rule will accumulate three spellings of the same
token - which is exactly the drift the contract check was written to catch, arriving through the one
door the check does not guard.

RFC-0044 sets the same posture for the toolchain: a floor, a policy, and a report rather than a
surprise. This record is that posture applied to the design system.

The contract check this record leans on is no longer in the tree. Where a rule below says the check
proves something, it names the proof the rule requires, not a command that runs today.

## Alternatives considered

**No version, only a changelog.** Rejected: a changelog records what happened; a version states what
a consumer may rely on.

**Semantic versioning on the package.** Rejected as the primary signal: the site is not a library,
and the package version moves for reasons that have nothing to do with the design system. The token
shape is the thing a consumer depends on, so the token shape is the version.

**Removing a token as soon as nothing in-tree reads it.** Rejected on rule 2: an external clone is a
reader the check cannot see.

## Consequences

- The alias table becomes a real artifact with a removal schedule, not a comment.
- A major design-system change is a deliberate, listed event rather than an accumulation of small
  renames.
- The token contract grows two duties: refusing an unread token, and reporting a deprecated one.

## Verification

| Claim                       | Test                                                                    |
| --------------------------- | ----------------------------------------------------------------------- |
| No unread token             | every token declared in `Global.css` has a `var()` reader (review rule) |
| A rename keeps the old name | a report names the alias as deprecated and its removal version (intent) |
| A removal is proved         | a report of zero reads precedes the deletion (intent)                   |
| Deprecation is build-time   | a deprecation is reported before the build, not in the console (intent) |

## Open questions

- Whether the design-system version lives in `package.json`, in a constant beside the tokens, or in
  the RFC set. Today it is the RFC set plus the token shape, which is prose rather than a value.
- Whether a deprecated component should still be importable or should fail the check outright.
- How a value-only change is communicated, given it is explicitly not a version change.

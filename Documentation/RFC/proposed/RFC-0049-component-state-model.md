---
title: The component state model
rfc: 0049
category: Specification/Surface
kind: rfc
date: 2026-11-02
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: |-
    every component in `Source/Component/`, the state vocabulary, the material's state rules
supersedes: none
superseded_by: none
depends:
    - RFC-0045 (the material and the token set)
    - RFC-0019 (vocabulary)
    - RFC-0050 (the data states)
    - RFC-0051 (the token lifecycle)
statuses:
    - name: The set is closed and shared
      state: open
      evidence: the rule names no file or command
    - name: "`active` and `selected` are different states"
      state: open
      evidence: the rule names no file or command
    - name: Focus is never removed, only made visible
      state: open
      evidence: the rule names no file or command
    - name: "`locked` is not `disabled`"
      state: open
      evidence: the rule names no file or command
    - name: "`busy` preserves the geometry"
      state: open
      evidence: the rule names no file or command
    - name: Every state is reachable without a pointer
      state: open
      evidence: the rule names no file or command
    - name: A state changes one channel
      state: open
      evidence: the rule names no file or command
---

## Decision

Every interactive component has the same closed set of states, declared once in a shared module and
named the same way everywhere. A component that needs an eighth state is a vocabulary change, not a
local decision.

The set is seven: `rest`, `hover`, `focus`, `active`, `selected`, `locked`, `busy`. Each maps to a
change of face, line or ink - never to a new colour, a new radius or a new shadow.

Seven rules make the set enforceable.

### 1. The set is closed and shared

The states are exported from one module and consumed by every sheet. A component cannot invent
`--pressed` or `--dragging`; if the thing it needs is not in the set, the set is wrong and is
changed deliberately.

The failure this prevents is the one every design system drifts into: eleven components with eleven
spellings of "hover", and a reader who cannot tell whether two of them mean the same thing.

### 2. `active` and `selected` are different states

- **active** is transient: the pointer or the key is down, right now.
- **selected** is persistent: this record is the one the surface is showing.

Collapsing them produces the common bug where a row that has been chosen looks pressed, and a row
that is being pressed looks chosen. The composition draws both - the drawer's selected column is a
tab shape, and a pressed row is a fill step - and they never appear the same.

### 3. Focus is never removed, only made visible

`:focus-visible` is the only focus state, and it is drawn as a ring outside the element so it cannot
be confused with a border that belongs to the design. A component that sets `outline: none` without
replacing it fails review, because it removes the only affordance a keyboard user has.

The ring's offset is a token, not a literal, so a dense surface can tighten it without a second
rule.

### 4. `locked` is not `disabled`

Two different facts, and the difference is what the person needs to know:

- **disabled** - this control is not applicable here, structurally. It will never apply on this
  surface.
- **locked** - this control applies, and this actor may not use it. It carries a reason (RFC-0023's
  grant, RFC-0012's audience).

A disabled control needs no explanation; a locked one is a dead end without one. The state is drawn
differently for that reason: disabled is a quieter ink, locked keeps its ink and gains a lock glyph.

Most product interfaces use a single grey for both, and the result is a screen full of dead controls
with no way to tell a permission from a bug.

### 5. `busy` preserves the geometry

A busy control keeps its width, its height and its label. It states that it is working without
re-flowing the surface around it, because a control that changes size while working moves every
neighbour and turns one action into a layout event.

The busy state is a change of line weight or a mark, never a spinner that replaces the label.

### 6. Every state is reachable without a pointer

Each state must be reachable from the keyboard: `focus` by tab, `active` by key-down, `selected` by
enter or space, `locked` by reading its reason. A state reachable only by hover is a state half the
readers cannot see, and it is also the state most likely to be untested.

### 7. A state changes one channel

Each state changes exactly one of face, line, or ink - never two at once. The composition's own
selected item changes its line to the stage accent and leaves the face alone; the drawer's active
column changes its face and its corner. Two channels at once reads as a different component rather
than the same component in a different state.

## Context

RFC-0045 fixes the material and the token set. It does not say what a component does when it is
pressed, chosen, forbidden or working, and those are the states a person actually spends their time
in. Without a shared set, each component invents its own and the system reads as eleven systems.

## Alternatives considered

**A state per component, documented beside it.** Rejected: that is the drift this record exists to
prevent, and it puts the definition of "selected" in the component that happens to need it first.

**A CSS framework's state classes.** Rejected: the repository does not carry a utility framework
into its own sheets, and the states must read the material's tokens rather than a framework's
palette.

**Merging `locked` into `disabled`.** Rejected on rule 4: the distinction is the whole information
content of the state.

## Consequences

- A component's sheet becomes a state table rather than a pile of rules, which is shorter and easier
  to review.
- Adding a state is a deliberate act that touches every component, which is the correct cost.
- `locked` requires a reason string at the call site, so a forbidden control cannot be rendered
  without saying why.

## Verification

| Claim                          | Test                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------- |
| One export, no local states    | a sheet declaring a state name outside the module fails the token contract        |
| `active` and `selected` differ | a selected row and a pressed row render different computed styles                 |
| Focus is never removed         | `grep` for `outline: none` in a component sheet returns nothing                   |
| `locked` carries a reason      | a locked control rendered without one fails the component's prop contract         |
| `busy` preserves geometry      | the control's bounding box is unchanged across the state, asserted in the browser |

## Open questions

- Whether `loading` for a whole surface belongs here or in RFC-0050. Today it is a data state, and
  `busy` is reserved for a single control.
- Whether `invalid` is a state or a message. The current answer is a message with an ink change,
  which is not a state under rule 7.
- Whether `selected` on a multi-select surface needs `partially-selected`. The composition has no
  multi-select surface yet.

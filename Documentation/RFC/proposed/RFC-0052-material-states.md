# RFC-0052 - The material states

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** every component that
can appear on more than one surface, the material context, the seam **Decision class:** architecture
**Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0045 (the material and the
token set), RFC-0043 (the workspace seam), RFC-0049 (the component states), RFC-0051 (the token
lifecycle)

## Decision

The composition has two materials - chrome, which is dark, and paper, which is light - and every
component knows which one it is on. A component that appears on both reads the same four names on
either and is not forked.

Four rules make that enforceable.

### 1. A component declares its material; it never detects it

The material arrives as a context value from the sheet that mounts the component - `chrome` or
`paper` - and the component reads its tokens through that context. It never inspects a computed
background, and it never branches on a parent's class name.

Detection looks cheap and fails in exactly the case that matters: a component nested one level
deeper than expected, or mounted in a preview, reads the wrong material and produces a dark card on
a light ground that no test catches because the markup is correct.

### 2. One component, two materials, four names

A component that must appear on both surfaces reads `face`, `line`, `ink` and `muted` from the
material it was given. The chrome ramp and the paper ramp both provide those four names, so the
component has one stylesheet and no second copy.

A fork - `Card.tsx` and `PaperCard.tsx` - is the failure this rule exists to prevent, because the
two diverge on the first change that only one of them receives.

### 3. The seam is a boundary, not a blend

Nothing is half on both materials. The publish seam (RFC-0043) is the only band that belongs to
neither, and it is its own material rather than a mixture: it takes the paper ground and a white
control, and it does not inherit the chrome's ink.

A component that straddles the seam is a component with a wrong parent, not a component with a
gradient.

### 4. A wrong material fails review, not the build

The material cannot be checked mechanically without a rendered tree, so the rule is enforced in
review and in one verification: the design verifier asserts the four surfaces' computed backgrounds
against the spec. A component on the wrong material is visible there as a value, not as an opinion.

## Context

RFC-0045 defines the two ramps. The composition is dark above the seam and light below it, and the
first component that appears on both sides - a card, a badge, a link - forces the question of
whether it is one component or two. Without a rule the answer is two, and the second copy is written
by whoever needed it first.

## Alternatives considered

**A CSS custom-property cascade set by the mounting sheet.** This is the mechanism the rule uses,
not an alternative to it: the context is a set of custom properties, and the rule is that a
component reads them rather than sniffing.

**A separate component per material.** Rejected on rule 2.

**`prefers-color-scheme` as a third material.** Rejected for now: the two materials are a property
of the composition, not of the reader's preference. A reader-preference theme is a different record
and would multiply every component's states by two.

## Consequences

- The token set grows two aliases per material name, which the contract check already requires to
  have readers.
- A component's sheet is written once and reviewed once, whichever surface it lands on.
- The material is explicit at every mount site, which is a small verbosity for a large
  predictability gain.

## Verification

| Claim                           | Test                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------- |
| No component detects a material | `grep` for `getComputedStyle` in `Source/Component/` returns nothing              |
| Both ramps provide four names   | the token contract fails if a ramp is missing `face`, `line`, `ink`, `muted`      |
| The seam is its own material    | the verifier asserts the seam's background equals the seam token, not either ramp |
| No forked component             | `find Source/Component -name "*Paper*"` returns nothing                           |

## Open questions

- Whether a third material is ever legitimate. The rail's drum tints the selected band with an 8%
  plate, which is neither ramp; today that is a value on the chrome ramp.
- Whether the material should be a prop on the component as well as a context, for the case where a
  page mounts one directly.
- How a reader-preference theme would interact, if one is ever added.

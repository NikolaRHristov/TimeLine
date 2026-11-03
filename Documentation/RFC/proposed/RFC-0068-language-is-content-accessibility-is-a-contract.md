# RFC-0068 - Language is content; accessibility is a contract

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the site shell, every
component, the content schema, every client **Kind:** contract **Subject:** surface **Horizon:** now
**Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0017 (the client surface and
its empty states), RFC-0015 (the export gains a language field), RFC-0034 (a format change),
RFC-0060 §7 (a translation is a copy, not an edit), RFC-0045 (the tokens an accessible contrast is
measured in); implementing card to be created: "Language in the content schema and the accessibility
audit"

## Decision

A federated network owes accessibility to the reader and language to the writer, and those are
different obligations: accessibility is a contract enforced by a check, and language is a property
of the content that the content carries.

1. **Accessibility is a contract with a named floor.** The floor is WCAG 2.2 AA for every surface
   this repository emits and for the room client. "Best effort" is not a floor; a named level is,
   because it is checkable and a failure is a defect.
2. **The check is mechanical and part of the build.** Every build runs an automated audit over the
   emitted HTML - the no-JS audit's pattern extended - and a violation fails the check rather than
   being reported. An accessibility claim that depends on someone looking is a claim that decays.
3. **What the audit cannot check is a review rule.** Keyboard order, focus visibility on every
   interactive element, and whether an empty state is announced are named in a review checklist,
   because no automated tool proves them. A record that only names the tool claims more than it can.
4. **Language is content, not metadata.** A record carries its language, because the language of a
   post is a property of the words a person wrote and not of the file it lives in. A room does not
   have a language; a member does, and a post does.
5. **The shell's language is a declared default, and it is not the content's.** The document's
   `lang` and `dir` come from configuration, and a record whose language differs from the shell's is
   marked as such in the markup - because a screen reader switches voice on a language boundary and
   gets it wrong when the boundary is unmarked.
6. **Direction is per record too.** `dir` is a property of the text rather than of the interface,
   and a right-to-left post inside a left-to-right shell is the case that breaks every assumption an
   interface makes about order.
7. **Translation is a copy, and it is authored.** A translation of a post is a new record by its
   translator with a reference to the original (RFC-0059 §3's quote rule, RFC-0060's chain). There
   is no machine-translation path in a read, no translated view of a post that pretends to be the
   post, and no automatic detection that overrides what a writer declared.
8. **A member's language preference is not a filter.** It affects rendering and the interface, never
   audience or retention. RFC-0012's audiences are the only filter, and a second one would make a
   language a permission.

## Context

The site has a shell and a content schema and neither carries a language.
`Source/Layout/Base.astro:70` emits `<html lang="en" dir="ltr">` for every page, and
`grep -cE "lang|locale|language" Source/content.config.ts` prints 0 - so a post written in Bulgarian
is published inside a document that declares English, and a screen reader will read it as English.
That is the measured case, not a hypothetical one.

The accessibility half has a partial floor already: 14 of the 19 component files under
`Source/Component` carry at least one `aria-` attribute
(`grep -rl "aria-" Source/Component --include=*.astro --include=*.tsx | wc -l`), and
`grep -rL "aria-" Source/Component` names five with none - `Showcase/Spread.astro`,
`Workspace/Bento.tsx`, `Workspace/Workspace.tsx`, `Workspace/ProvenanceRail.tsx` and
`Workspace/Rail.tsx`. Partial is the problem: no build fails when a component arrives without a
label, so the 14 is a snapshot of attention rather than a property.

The federated half is why this is a policy record. A network of rooms cannot enforce a client's
markup, so the obligation has to attach to what the network controls: the surfaces this repository
emits, the export format's language field, and the review rules a client claims to meet.

## Alternatives considered

| Option                                          | Why not chosen                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Accessibility as a review checklist only        | no build fails, so the floor drifts with attention - which is what the 14-of-19 snapshot shows                       |
| Automated audit only                            | it proves labels exist and not that they make sense; keyboard order and focus are not machine-checkable              |
| Language as a room setting                      | a room of five people writing in three languages has no single answer, and the setting would become a filter         |
| Detect language from the text                   | a detector is wrong about short posts and code, and it would override what the writer declared                       |
| One document tree per language (`/bg/`, `/en/`) | a second full site per language, duplicating pages whose language is a property of their content                     |
| Machine translation as a reading feature        | a translated post presented as the post is a silent rewrite of someone's words (RFC-0060 §7's fork rule)             |
| Language in the envelope header only            | the header is what the module checks, and the module cannot use a language for anything; it belongs with the content |

## Consequences

- The content schema gains a language field, which is a schema change to every collection and a
  value the pipeline must set - and a default that guesses is worse than one that says UNKNOWN.
- Every emitted page gains a per-record language boundary, so the shell's single `<html lang>`
  becomes a page-level default with element-level overrides, and a client rendering a feed must do
  the same.
- A build that fails on an accessibility violation fails for a reason that is not a type error, so
  the check's output must name the element and the rule or it will be disabled.
- Direction support is the expensive part: every layout assumption about order, icons and scrollbars
  gets a second case, and the stylesheet is written for one.
- Language as content means an export carries it, so the format version bumps (RFC-0034) and an
  import from a platform that declares no language writes UNKNOWN (RFC-0062 §3's absent-is-absent
  rule).

## Verification

| Claim                                    | Test                                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The floor is named and checked           | the build runs an accessibility audit over `Target/` and exits non-zero on a violation (intent)                                                    |
| Every component is labelled              | `grep -rL "aria-" Source/Component --include=*.astro --include=*.tsx` prints nothing, or each exception is listed in the review checklist (intent) |
| Language is in the content               | `grep -c "language" Source/content.config.ts` is greater than 0 and a fixture post carries one (intent)                                            |
| The shell's default is declared          | `grep -n "<html lang=" Source/Layout/Base.astro` prints a value from configuration, not a literal (intent)                                         |
| A mixed-language page marks the boundary | build a page with two languages; each record's element carries its own `lang` (intent)                                                             |
| Direction is per record                  | a right-to-left fixture record renders with `dir="rtl"` inside an `ltr` shell (intent)                                                             |
| A translation is a copy                  | translate a fixture post; a new record exists with a reference to the original and its own author (intent)                                         |
| Language is not a filter                 | a member's preference changes the interface and no row's visibility (RFC-0012, intent)                                                             |

## Open questions

- Whether the accessibility floor should be enforced for the room client, a component set this
  repository does not emit. A contract over someone else's code needs an assertion the client can
  make, and the export format is the only shared artifact.
- Whether the language field should be a BCP 47 tag or a smaller enumeration. A tag is correct and a
  client cannot validate it; an enumeration is checkable and wrong for most of the world.
- Whether a room may require a language for its content. It would make a room readable to its
  members and exclude writers, which is an audience rule wearing a language's clothes.
- UNKNOWN how much of the current stylesheet assumes `ltr`. The record does not measure it, and the
  first implementation should count the logical-property violations before the direction work is
  scoped.

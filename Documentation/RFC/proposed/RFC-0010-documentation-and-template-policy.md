# RFC-0010 - Documentation and template policy

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** `Documentation/`,
`AGENTS.md`, `README.md`, every tracked file **Decision class:** governance **Supersedes:** none
**Superseded by:** none **Task dependencies:** t_34ee3d19 (docs repair, done), t_bceac9f5 (naming)

## Decision

The repository is a template, and every tracked file is written as if a stranger will clone it.

- **No identifiers.** Project ids, account names, absolute paths, tokens and personal handles live
  in `.env`, `.firebaserc` or `Maintain/Configuration/Local/` - all gitignored. A tracked file that
  names one is a bug.
- **No transcripts.** Ideas arrive in conversation and are restated as declarative prose. No
  quotation marks around borrowed phrasing, no first-person voice, no attributed fragments.
- **Skills live in the repository.** `Documentation/Skill/<Name>/SKILL.md`, one directory per skill,
  referenced from `AGENTS.md`. A skill that describes this repository's conventions belongs here,
  not in a profile.
- **Every claim carries its test.** A document that asserts behaviour names the command that proves
  it, or marks the claim as intent.

## Context

The tree already leaked twice: an Astro cache file carried absolute `file://` paths into a public
repository, and a vendor documentation table carried the Firebase project id. Both were fixed, and
both would have recurred without a rule - the fix is a policy plus a check, not an edit.

## Alternatives considered

| Option                          | Why not chosen                                                     |
| ------------------------------- | ------------------------------------------------------------------ |
| Rely on review                  | review does not run on every commit; both leaks were reviewed past |
| Keep docs out of the repository | loses the template value entirely                                  |
| A separate public docs site     | the repository is the template; docs must travel with it           |

## Consequences

- Anything machine-specific needs a local home before it can be documented.
- Documentation ages: a stale command is worse than a missing one, so claims are tested or marked.
- Template readiness becomes a reviewable property rather than an intention.

## Verification

| Claim                    | Test                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| No identifiers tracked   | `grep -rniE '<project-id>\|$HOME\|/Volumes/' Documentation README.md AGENTS.md` returns nothing |
| No quoted owner phrasing | the same sweep for quoted fragments returns nothing                                             |
| Skills are in-repo       | `find Documentation/Skill -name SKILL.md` lists each skill named in `AGENTS.md`                 |
| Claims are tested        | every claim→test table names a runnable command                                                 |

## Open questions

- Whether the leak sweep becomes a pre-commit hook or stays a review checklist.
- How the template is versioned once other people clone it and diverge.

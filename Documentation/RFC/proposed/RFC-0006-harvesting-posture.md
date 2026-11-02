# RFC-0006 - Harvesting posture

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** `store scrape`, the
transport seam, the shadow store **Decision class:** policy **Supersedes:** none **Superseded by:**
none **Task dependencies:** RFC-0003, RFC-0004

## Decision

Harvesting is read-only by default, and the default is enforced in code rather than trusted to the
caller.

The scraper may navigate, scroll and read. It may not like, bookmark, follow, repost or reply as
part of a scrape. Every mutating command exists as a separate, explicitly named action requiring its
own invocation and its own confirmation flag, and no scheduled job may call one.

## Context

Reading a public timeline leaves nothing behind on the source platform. Writing does: a like, a
bookmark or a follow-up changes the account's state and is visible to the platform and to anyone who
looks. A harvesting posture that mutates the source is therefore not the same product as one that
only reads, and the difference is invisible in the code unless it is made structural.

The transport seam already distinguishes mutating commands from read-only ones (`mutable` on the
transport, `--dry-run` on mutations), so the enforcement point exists.

## Alternatives considered

| Option                                       | Why not chosen                                                |
| -------------------------------------------- | ------------------------------------------------------------- |
| Allow mutations, rely on operator discipline | the failure is silent and permanent on the source platform    |
| Separate binary for mutations                | splits the CLI surface for no isolation gain over a flag      |
| Mutations behind an environment variable     | an env var is easier to set by accident than an explicit flag |

## Consequences

- Scheduled harvesting cannot express engagement, which removes a whole class of accidental
  behaviour.
- The scraper's capabilities stay legible: a reader can see what it does without auditing every call
  site.
- Any future feature that must write is a new decision with its own RFC, not a flag on an existing
  job.

## Verification

| Claim                         | Test                                                            |
| ----------------------------- | --------------------------------------------------------------- |
| Scrape cannot mutate          | a scrape run leaves like/bookmark state unchanged on the source |
| Mutations need their own flag | `post like` without confirmation exits 2                        |
| Scheduled jobs are read-only  | the job reducer rejects a mutating command name                 |
| The seam enforces it          | `view` transport refuses mutations before any side effect       |

## Open questions

- Whether a scheduled job may ever perform an authenticated read that changes server-side state (a
  view count, for example) without being classified as a mutation.
- How long harvested copies may be retained once the source platform deletes the original.

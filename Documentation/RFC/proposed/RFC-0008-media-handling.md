# RFC-0008 - Media handling

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the extractor, the
shadow store, export, the site build **Kind:** architecture **Subject:** data **Horizon:** now
**Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0001

## Decision

Media is referenced by default and copied only on request.

A post stores `media: [{kind, url}]` - a link, not bytes. A separate command fetches selected media
into the local store, records the fetch as an event, and rewrites the reference to the local copy
while keeping the original URL as provenance. The site build uses whichever reference the record
carries.

Blob URLs are discarded at extraction time: they are page-scoped and dead once the tab closes, so
storing one records a promise the archive cannot keep.

## Context

Two problems are already visible in the current archive. Media is links only -
`find Maintain/Storage -name '*.jpg' -o -name '*.mp4'` returns nothing - so a post whose media the
platform removes becomes a text stub. And at least one record carries a `blob:https://…` URL, which
was never usable.

Copying everything is not the answer either: video is large, the archive is append-only, and most
posts are never published.

## Alternatives considered

| Option                               | Why not chosen                                          |
| ------------------------------------ | ------------------------------------------------------- |
| Copy every media item at scrape time | unbounded growth, most of it never used                 |
| Store links only, forever            | the archive dies when the platform does                 |
| Store links, copy on publish         | reasonable, but loses the option to archive selectively |

## Consequences

- The archive stays small until someone asks for durability on a specific post.
- A copied item needs a content hash so the same image referenced twice is stored once.
- The site build must handle both a remote URL and a local path for the same record without
  branching in page code.

## Verification

| Claim                 | Test                                               |
| --------------------- | -------------------------------------------------- |
| Blob URLs are dropped | no stored record contains `blob:` in `media[].url` |
| Copy is idempotent    | copying twice yields one file and one event        |
| Provenance survives   | the local record still carries the original URL    |
| Build handles both    | a page renders with a remote and a local reference |

## Open questions

- Whether video is in scope at all, or only images and posters.
- Retention: how long a copied item is kept if the post is later hidden.
- Where the bytes live relative to the export, so an export stays complete.

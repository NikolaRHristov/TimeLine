---
name: timeline-bookmarks
description: Use when driving the Timeline bookmark tool layer or its data.
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos]
metadata:
  hermes:
    tags: [cdp, bookmarks, astro, collections, classification, cli]
---

# Timeline Bookmarks

A three-stage pipeline lives in this repo: a TypeScript CLI that drives the
person's own browser over the Chrome DevTools Protocol (`Maintain/`), an ingest
stage that writes one JSON file per saved post and per event into
`Source/Content/` (Astro collections), and a classification stage that files
bookmarked authors into three curated lists.

Read `Documentation/Plan/Bookmark-Pipeline.md` for the full plan and
`Documentation/Reference/Maintain-Cli.md` for the command table. This skill is
the operating procedure.

## When to Use

- Reading or refreshing the saved-post archive.
- Acting on a post in the person's browser (like, bookmark) instead of
  hand-clicking.
- Deciding which list an author belongs to.
- Debugging why the archive or the site build is stale.

## Procedure

1. **Check the transport before anything else.**
   `curl -s http://127.0.0.1:9222/json/version` must return JSON with a
   `Protocol-Version`. No answer means the browser is not exposing CDP; ask the
   person to relaunch it with the debugging flag rather than starting a second
   browser - a second browser has no session and silently returns logged-out
   pages.
2. **List tabs, never guess one.** `tab list --json` gives `{id,title,url}`.
   Target by id. A url prefix that matches two tabs is an error, not a coin
   flip.
3. **Discover the contract, don't memorise it.** `--schema` prints the command's
   JSON Schema; `--help` prints its flags. Both come from the same table, so
   they cannot disagree with the parser.
4. **Mutate with `--dry-run` first.** `post like --url … --dry-run` prints the
   resolved post. Drop the flag to act. Like and bookmark read `aria-pressed`
   first, so a second run reports `was:true` and clicks nothing.
5. **Ingest, then read counts.** `page bookmarks scrape` returns
   `{scraped,new,updated,events}`. Re-running must print `new:0`; a rising `new`
   on a second run means the status-id extraction fell back to text.
6. **Classify cheaply.** `author classify rules` decides what keywords can
   decide. Only then `author classify infer --batch 25`, which caches every
   answer in `Source/Content/Author/<handle>.json`. A second infer run must make
   zero model calls.
7. **Apply membership last, and gated.** `author distribute apply --apply`
   writes decisions and adds handles one at a time, three seconds apart. It
   stops on the first `rate-limited`.

## Token-efficiency rules

The pipeline exists to keep model work out of the loop.

- Scrape and classify through the CLI; never read page snapshots to enumerate
  posts one at a time.
- Commands return counts and ids, not bodies. Ask for a body only for the post
  being acted on.
- Evidence per author is capped: handle, domains, keyword hits, three excerpts
  of 200 characters. Never send a full timeline.
- Batch ambiguous authors (25 per call) and cache decisions on disk; the cache
  is the memory, not the conversation.

## Pitfalls

- **Two debuggers, one tab.** The browser extension attaches its own debugger to
  the tab the person handed to Hermes. Attaching over CDP to that same tab
  detaches the extension and breaks their panel. Resolve targets by url and
  skip the tab that is currently attached.
- **The archive has no `bookmarkedAt`.** The UI does not expose when a post was
  saved. `firstSeenAt` is the first scrape that observed it, and
  `bookmark.added` events mark the transition; treat both as a lower bound and
  never present them as the exact save time.
- **Identifiers are not in this repo.** List ids and handles live in
  `Maintain/Configuration/Local/Configuration.local.json`, which is gitignored.
  Docs and commits refer to `<LIST_AI>`, `<LIST_UI>`, `<LIST_CODE>`. A doc that
  contains a real id or handle is a bug.
- **Content config location follows `srcDir`.** This site sets
  `srcDir: "./Source"`, so the content config is `Source/content.config.ts`, not
  a root `src/content.config.ts`. `npx astro sync` is the probe: it must add the
  collection names to `.astro/types.d.ts`.
- **Dev-only feed.** The activity page's live feed is written by `event tail`;
  a production build must not depend on it. The Event collection is the source
  of truth.

## Claim → test

| Claim | Test |
|---|---|
| Browser exposes CDP | `curl -s http://127.0.0.1:9222/json/version` |
| Command surface is self-describing | `node Maintain/Index.ts post like --schema` |
| Like is idempotent | run twice; second prints `was:true` |
| Scrape is idempotent | run twice; second prints `new:0` |
| Classification is cached | second `author classify infer` prints `asked:0` |
| Docs are anonymised | `grep -rE "/i/lists/[0-9]+|@[A-Za-z0-9_]{2,}" Documentation/` returns nothing |

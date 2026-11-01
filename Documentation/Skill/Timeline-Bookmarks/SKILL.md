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
stage that reads three sources into a gitignored shadow store and publishes
chosen posts into `Source/Content/` (Astro collections), and a classification
stage that files bookmarked authors into three curated lists.

Read `Documentation/Plan/Bookmark-Pipeline.md` for the full plan,
`Documentation/Reference/Storage-Model.md` for the two stores, and
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
2. **List tabs, never guess one.** `tab list --json` gives
   `{id,title,url,active}`. Target by id; `--tab` also takes the zero-based
   index in that list. A url prefix that matches two tabs is an error, not a
   coin flip.
3. **Discover the contract, don't memorise it.** `--schema` prints the command's
   JSON Schema; `--help` prints its flags. Both come from the same table, so
   they cannot disagree with the parser.
4. **Mutate with `--dry-run` first.** `post like --url … --dry-run` prints the
   resolved post. Drop the flag to act. Like and bookmark read the control's
   state first - `data-testid` (`like`/`unlike`, `bookmark`/`removeBookmark`)
   then the aria-label, because the site sets no `aria-pressed` - so a second
   run reports `was:true` and clicks nothing.
5. **Ingest into the shadow store, then publish deliberately.**
   `store scrape --source bookmark|like|history` returns
   `{source,scraped,new,updated,events}` and writes only under
   `Maintain/Storage/Shadow/`. Re-running must print `new:0`; a rising `new` on
   a second run means the status-id extraction fell back to text. Nothing
   reaches `Source/Content/` until `store publish` runs with `--id`, `--source`,
   `--since` or `--all`. `store status` is the check between the two:
   `byVisibility.shadow` falling while `public` rises is the only evidence that
   a publish did what was asked.
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

- **A click is not a write.** The control flips in the DOM before the request
  behind it lands, so closing the tab (or the process exiting) in that window
  drops the mutation and the next run reports `was:false` again. The CLI waits
  for network quiet, and on a temporary tab reloads and re-reads the server
  state before printing - `liked:true` means the site agrees.
- **`--url` never touches the person's tabs.** It reuses a tab already showing
  that permalink and otherwise opens a temporary one, closed on the way out;
  `--tab`/`--index` drive a tab they already have and leave it open.
- **Two debuggers, one tab.** The browser extension attaches its own debugger to
  the tab the person handed to Hermes. Attaching over CDP to that same tab
  detaches the extension and breaks their panel. Resolve targets by url and skip
  the tab that is currently attached.
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
- **A redirect is not a failed navigation.** `/i/bookmarks` lands on
  `/i/history`, so `Session.navigate` waits for the page's own
  `Page.loadEventFired` rather than for the requested URL prefix. A prefix check
  burns the whole timeout and then reports `false` on a page that arrived fine.
- **`/i/history` is a container, not a feed.** It presents `Bookmarks` and
  `Likes` as tabs; the tab `href`s are read from the page and `--source history`
  walks them in turn. `--source bookmark` and `--source like` each read one tab.
- **Scraping publishes nothing.** Every record lands with `visibility:"shadow"`
  under `Maintain/Storage/Shadow/`; `Source/Content/` changes only through
  `store publish`. A scrape that edits the collection is a bug, not a
  convenience.
- **Code never lives under `Maintain/Storage/`.** That whole tree is gitignored
  as data, so a `.ts` file dropped there is invisible to git and never commits.
  The store code sits in `Maintain/Store/`; only records go under `Storage/`.
- **`hidden` is a tombstone, not a delete.** It survives every re-scrape and
  blocks publish, so withholding is a state rather than a deletion. There is no
  unhide command: reversing it means editing the shadow record's `visibility` by
  hand, deliberately.
- **The activity page is static.** It is a build-time read of the Event
  collection. The live view of the same directory is `event tail --follow`,
  which prints one JSON line per file; there is no `/Activity/Feed.json`
  endpoint to poll.
- **Astro 7 needs Node >= 22.23.4.** The `node` first on `PATH` in a Hermes
  terminal may be older than that and `npx astro sync|build` refuses it; the
  person's own shell resolves a newer node. Run the build from that shell
  (`npx astro build`) instead of pinning an interpreter path - a machine path
  committed to a public repository publishes the local layout.

## Claim → test

| Claim                              | Test                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Browser exposes CDP                | `curl -s http://127.0.0.1:9222/json/version`                                                                      |
| Command surface is self-describing | `node Maintain/Index.ts post like --schema`                                                                       |
| Like is idempotent                 | run twice; second prints `was:true`                                                                               |
| An attached tab is never driven    | attach `chrome.debugger` from the extension to one tab, then `post extract --tab <id>` → `no-tab`                 |
| Failures are one object            | any failing command exits 2 with `{error:<code>,…}` and nothing else on stdout                                    |
| Scrape is idempotent               | run twice; second prints `new:0` and the post count is unchanged                                                  |
| Scrape publishes nothing           | after `store scrape`, `git status --short Source/Content` prints nothing                                          |
| Shadow store is untracked          | `git check-ignore -v Maintain/Storage/Shadow/Post/1.json`                                                         |
| Publish is idempotent              | publish twice; second prints `unchanged:1` and `shasum -a 256` of the file is unchanged                           |
| Hide is durable                    | `store hide --id X`, then `store scrape`, then `store publish --id X` prints `hidden:1` and writes no file        |
| Collections resolve                | `npx astro sync` then `grep Bookmark .astro/content.d.ts`                                                         |
| Site builds                        | `npx astro build` → `Target/Bookmark/index.html`, `Target/Bookmark/<id>/index.html`, `Target/Activity/index.html` |
| Save time is not fabricated        | the detail page says "Saved at or after"; no field is named `bookmarkedAt`                                        |
| Classification is cached           | second `author classify infer` prints `asked:0`                                                                   |
| Docs are anonymised                | `grep -rE "/i/lists/[0-9]+                                                                                        | @[A-Za-z0-9_]{2,}" Documentation/` returns nothing |

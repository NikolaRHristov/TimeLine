---
name: timeline-bookmarks
description: Use when driving the Timeline bookmark CLI or its data.
version: 2.0.0
author: Timeline
license: MIT
platforms: [macos, linux]
metadata:
    hermes:
        tags: [cdp, bookmarks, astro, collections, cli]
---

# Timeline Bookmarks

A three-stage pipeline lives in this repo: a TypeScript CLI that drives the
person's own browser over the Chrome DevTools Protocol (`Maintain/`), an ingest
stage that reads three sources into a gitignored shadow store and publishes
chosen posts into `Source/Content/` (Astro collections), and a site that groups
what was published by the person's own lists.

Nothing here is tied to one account. The handle and the list ids live in a
gitignored identifier map; list slugs come from that map, never from the code.
Commands take a slug, never an id.

Read `Documentation/Reference/Configure.md` for the map's keys,
`Documentation/Reference/Maintain-Cli.md` for the command table and
`Documentation/Reference/Storage-Model.md` for the two stores. This skill is the
operating procedure.

## When to Use

- Reading or refreshing the saved-post archive.
- Acting on a post in the person's browser (like, bookmark) instead of
  hand-clicking.
- Wiring up a fresh clone: handle, lists, first publish.
- Debugging why the archive or the site build is stale.

## Procedure

1. **Check the transport before anything else.**
   `curl -s http://127.0.0.1:9222/json/version` must return JSON with a
   `Protocol-Version`. No answer means the browser is not exposing CDP; ask the
   person to relaunch it with `--remote-debugging-port=9222` rather than
   starting a second browser - a second browser has no session and silently
   returns logged-out pages.

2. **Make sure the CLI is built and the map exists.** `pnpm run tool` compiles
   `Maintain/Source` to `Maintain/Target`, which is what `pnpm maintain` runs.
   Then `pnpm maintain config show --json`: `no-config` means the map is missing
   and the failure carries the exact copy command; `unknown-list` on a later
   step means the slug is not declared.

3. **Onboard with flags, never questions.**
   `pnpm maintain config init --force --profile <handle> --list <slug>=<list-id>`
   writes the map atomically from the tracked example. `--list` repeats once per
   list. `config show` masks ids; `--reveal` prints them - never paste that
   output into a document.

4. **List tabs, never guess one.** `pnpm maintain tab list --json` gives
   `{id,title,url,active}`. Target by id; `--tab` also takes the zero-based
   index in that list. A url prefix that matches two tabs is an error, not a
   coin flip.

5. **Discover the contract, don't memorise it.** `--schema` prints the command's
   JSON Schema; `--help` prints its flags. Both come from the same table, so
   they cannot disagree with the parser.

6. **Mutate with `--dry-run` first.**
   `pnpm maintain post like --url <permalink> --dry-run` prints the resolved
   post. Drop the flag to act. Like and bookmark read the control's state
   first - `data-testid` (`like`/`unlike`, `bookmark`/`removeBookmark`) then the
   aria-label - so a second run reports `was:true` and clicks nothing.

7. **Ingest into the shadow store, then publish deliberately.**
   `pnpm maintain store scrape --source bookmark|like|history` returns
   `{source,scraped,new,updated,events}` and writes only under
   `Maintain/Storage/Shadow/`. Re-running must print `new:0`; a rising `new` on
   a second run means the status-id extraction fell back to text. Nothing
   reaches `Source/Content/` until `store publish` runs with `--id`, `--source`,
   `--since` or `--all`. `store status` is the check between the two:
   `byVisibility.shadow` falling while `public` rises is the only evidence that
   a publish did what was asked.

8. **Open a list by slug.** `pnpm maintain page list open --name <slug>`
   resolves the id from the map. The id never appears on a command line, and an
   unconfigured slug fails `unknown-list` naming the configured set.

## Token-efficiency rules

The pipeline exists to keep model work out of the loop.

- Scrape through the CLI; never read page snapshots to enumerate posts one at a
  time.
- Commands return counts and ids, not bodies. Ask for a body only for the post
  being acted on.
- The store is files; `store status` and `event tail --json` answer questions
  about it without reading a record.

## Pitfalls

- **A click is not a write.** The control flips in the DOM before the request
  behind it lands, so closing the tab (or the process exiting) in that window
  drops the mutation and the next run reports `was:false` again. The CLI waits
  for network quiet, and on a temporary tab reloads and re-reads the server
  state before printing - `liked:true` means the site agrees.
- **`--url` never touches the person's tabs.** It reuses a tab already showing
  that permalink and otherwise opens a temporary one, closed on the way out;
  `--tab`/`--index` drive a tab they already have and leave it open.
- **Two debuggers, one tab.** A browser extension can hold its own debugger on
  the tab the person handed to an agent. Attaching over CDP to that same tab
  detaches the extension and breaks their panel. Resolve targets by url and skip
  the tab that is currently attached.
- **The archive has no `bookmarkedAt`.** The UI does not expose when a post was
  saved. `firstSeenAt` is the first scrape that observed it, and
  `bookmark.added` events mark the transition; treat both as a lower bound and
  never present them as the exact save time.
- **Identifiers are not in this repo.** The handle and list ids live in
  `Maintain/Configuration/Local/Configuration.local.json`, which is gitignored.
  Docs and commits refer to `<handle>`, `<slug>`, `<list-id>`. A tracked file
  that contains a real one is a bug.
- **A slug is configuration.** No union, enum or constant lists the slugs;
  `ListSlug` is a string and the map decides. Adding a list is a config edit,
  not a code edit.
- **Content config location follows `srcDir`.** This site sets
  `srcDir: "./Source"`, so the content config is `Source/content.config.ts`, not
  a root `src/content.config.ts`. `npx astro sync` is the probe: it must add the
  collection names to `.astro/types.d.ts`.
- **A redirect is not a failed navigation.** `/i/bookmarks` lands on
  `/i/history`, so navigation is confirmed by the page's own load event rather
  than by the requested URL prefix. A prefix check burns the whole timeout and
  then reports `false` on a page that arrived fine.
- **`/i/history` is a container, not a feed.** It presents `Bookmarks` and
  `Likes` as tabs; the tab `href`s are read from the page and `--source history`
  walks them in turn. `--source bookmark` and `--source like` each read one tab.
- **Scraping publishes nothing.** Every record lands with `visibility:"shadow"`
  under `Maintain/Storage/Shadow/`; `Source/Content/` changes only through
  `store publish`. A scrape that edits the collection is a bug, not a
  convenience.
- **Code never lives under `Maintain/Storage/`.** That whole tree is gitignored
  as data, so a `.ts` file dropped there is invisible to git and never commits.
  The store code sits in `Maintain/Source/Store/`; only records go under
  `Storage/`.
- **`hidden` is a tombstone, not a delete.** It survives every re-scrape and
  blocks publish, so withholding is a state rather than a deletion. There is no
  unhide command: reversing it means editing the shadow record's `visibility` by
  hand, deliberately.
- **The activity page is static.** It is a build-time read of the Event
  collection. The live view of the same directory is `event tail --follow`,
  which prints one JSON line per file; there is no feed endpoint to poll.
- **Build output is ignored, not tracked.** `Target/` is the site build,
  `Maintain/Target/` is the CLI build; both are regenerated and both are
  gitignored. A committed build publishes every post id the archive held.
- **Astro 7 needs Node >= 22.23.4.** A terminal whose `node` is older refuses
  `astro sync|build`. Use a shell that resolves a newer node instead of pinning
  an interpreter path - a machine path committed to a public repository
  publishes the local layout.

## Claim → test

| Claim                              | Test                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Browser exposes CDP                | `curl -s http://127.0.0.1:9222/json/version`                                                                               |
| Command surface is self-describing | `pnpm maintain post like --schema`                                                                                         |
| Onboarding is non-interactive      | `pnpm maintain config init --json` writes a map with no prompt                                                             |
| An existing map is protected       | second `config init` without `--force` → `{"error":"config-exists",…}`                                                     |
| Ids are masked by default          | `config show --json` → `"id":"*…"`; `--reveal` prints the id                                                               |
| Slugs come from configuration      | `config init --force --list alpha=1`, then `config show --json` lists `alpha`                                              |
| An unknown slug is named           | `page list open --name nope` → `{"error":"unknown-list","configured":[…]}`                                                 |
| Like is idempotent                 | run twice; second prints `was:true`                                                                                        |
| Failures are one object            | any failing command exits 2 with `{error:<code>,…}` and nothing else on stdout                                             |
| Scrape is idempotent               | run twice; second prints `new:0` and the post count is unchanged                                                           |
| Scrape publishes nothing           | after `store scrape`, `git status --short Source/Content` prints nothing                                                   |
| Shadow store is untracked          | `git check-ignore -v Maintain/Storage/Shadow/Post/<id>.json`                                                               |
| Build output is untracked          | `git ls-files Target` → empty; `git check-ignore -q Target` → exit 0                                                       |
| Site builds                        | `pnpm run build` → `Target/Bookmark/index.html`, `Target/Activity/index.html`                                              |
| Save time is not fabricated        | the detail page says "Saved at or after"; no field is named `bookmarkedAt`                                                 |
| Docs are anonymised                | grep for a `file:` triple-slash URL with a letter after it, an absolute home directory, or a mounted-volume path → nothing |

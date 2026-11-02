# Bookmark Pipeline - Implementation Plan

**Goal:** a dependency-free TypeScript tool layer that drives the person's own
browser over CDP, an ingest stage that turns saved posts into static Astro
content collections, and an inference stage that files bookmarked authors into
three curated lists - all reproducible, JSON-first, and cheap to run.

**Architecture:** three stages joined by files, not by live state.

1. **Tool layer** (`Maintain/`) - a clap-shaped CLI over the Chrome DevTools
   Protocol. One file per command, PascalCase, nested by domain. Every command
   prints exactly one JSON object and can emit its own JSON Schema.
2. **Ingest** - the CLI walks the bookmarks page, extracts each post in-page,
   and writes one JSON file per post plus one JSON file per event into
   `Source/Content/`. The site renders them statically; nothing is fetched at
   build time.
3. **Distribution** - deterministic rules first, model inference only for the
   authors the rules cannot place, with every decision cached so a re-run costs
   nothing.

**Tech stack:** Node 22 (global `fetch`, global `WebSocket`), TypeScript run
directly by `node` type-stripping or the repo's `tsx`, Astro 7 content
collections + Zod, CDP 1.3 over `ws://127.0.0.1:<port>`.

---

## Constraints

- **No new runtime dependencies.** Node 22.23 ships `fetch` and `WebSocket`; a
  CDP client needs nothing else. Do not add `puppeteer` or `playwright` - they
  bundle a second browser and break the "drive _my_ tabs" requirement.
- **Anonymised documentation.** No handles, list ids, post ids, profile paths,
  session tokens, extension ids or cookies in any tracked file. Identifiers live
  in `Maintain/Configuration/Local/Configuration.local.json` (gitignored) and
  are referenced in docs as `<handle>`, `<slug>`, `<list-id>`. The tracked
  template is `Maintain/Configuration/Example/Configuration.example.json`,
  placeholders only.
- **One JSON object per command.** `--json` is the default when stdout is not a
  TTY. Human tables are a rendering of the same object, never a second code
  path.
- **Never steal focus.** The person is typing in the same browser. CDP does not
  need the foreground: `Runtime.evaluate`, DOM reads, `el.click()` and
  programmatic scrolling all work on a background tab, and `Page.navigate`
  retargets a tab without activating it. What must never appear in this tooling:
  `Page.bringToFront`, `Target.activateTarget`, and `PUT /json/new` (which opens
  and can activate a tab - use `Target.createTarget` with `background: true`, or
  navigate a tab that already exists). Background tabs are throttled, so a
  lazy-loading feed needs `Emulation.setFocusEmulationEnabled` plus
  `Page.setWebLifecycleState` (`active`) to keep timers alive without touching
  the OS focus.
- **A scrape opens its own tab.** Reusing a tab the person already has open
  moves their window under them; so does `PUT /json/new`, which creates a tab
  the browser then brings forward. `store scrape` therefore calls
  `Target.createTarget` with `background: true` on the browser-level websocket,
  drives that tab, and closes it in a `finally`. The tab set is identical before
  and after a run - that equality is the test.
- **Dry-run first.** Every mutating command (`like`, `bookmark`, `list add`)
  supports `--dry-run` and prints the resolved target before acting.
- **Idempotent ingest.** Re-running the scrape must not duplicate a post: posts
  are keyed by status id, events are keyed by `(kind, subject, at)`.

## Verified environment

| Fact         | Value                                                                       | Probe                                        |
| ------------ | --------------------------------------------------------------------------- | -------------------------------------------- |
| Node         | v22.23.0                                                                    | `node --version`                             |
| npm          | 10.9.8                                                                      | `npm --version`                              |
| CDP endpoint | `http://127.0.0.1:9222` answers `/json/version` with `Chrome/156.0.8078.80` | `curl -s http://127.0.0.1:9222/json/version` |
| Browser      | Brave, `--remote-debugging-port=9222`, real profile with the site's tabs    | `ps ax \| grep -- --remote-debugging-port`   |
| Site root    | `srcDir ./Source`, `publicDir ./Public`, `outDir ./Target`, dev port 9999   | `astro.config.ts`                            |
| Content dir  | does not exist yet (`Source/Content` absent)                                | `ls Source`                                  |

CDP is a _separate_ channel from the extension's debugger. Driving a tab over
CDP while the extension holds `chrome.debugger` on the same tab is what detaches
the extension; the tool layer must therefore never attach to a tab the person
has attached to Hermes. Resolve targets by URL, and skip the active tab.

---

## Sources and stores

### Sources, in the order they get ingested

| Source    | Route             | What it is                                 |
| --------- | ----------------- | ------------------------------------------ |
| Bookmarks | `/i/bookmarks`    | posts saved explicitly                     |
| Likes     | `/<handle>/likes` | posts liked, including old likes not saved |
| History   | `/i/history`      | the account's own activity trail           |

Each source is an independent observation channel over the same post. A post
liked _and_ bookmarked is one record with two observations, never two records.

### Two stores

Nothing scraped is public by default.

| Store      | Where                      | Tracked         | Contents                                                                                                            |
| ---------- | -------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Shadow** | `Maintain/Storage/Shadow/` | no (gitignored) | every observation, raw: post JSON keyed by status id, `Observation.jsonl` append-only log, `Index.json` id→file map |
| **Public** | `Source/Content/`          | yes             | only records explicitly promoted, as Astro collection JSON                                                          |

Promotion is a separate, reversible command (`store publish`), so "I would
rather not have that one on the site" is the default state rather than a
correction. Shadow rows carry `visibility: "shadow" | "public" | "hidden"`;
`hidden` is a tombstone that survives re-scrapes.

Rules:

- Scraping writes **only** to the shadow store. It never touches
  `Source/Content/`.
- Publishing copies a shadow record into the public collection with
  `publishedAt` and the redactions applied (author handle optional, media URLs
  optional, text trimmed).
- Un-publishing deletes the public file and writes `visibility: "hidden"` in
  shadow, so the next scrape does not resurrect it.
- The shadow store is never committed, never published, and never included in a
  build.

---

## Stage 1 - Tool layer (`Maintain/`)

### Layout

```
Maintain/
  Index.ts                              # argv entry: parse → dispatch → print
  Cli/Parser/Parser.ts                  # subcommand tree, flags, --help
  Cli/Parser/Argument/Flag.ts           # boolean flag
  Cli/Parser/Argument/Option.ts         # value option (string|int|enum)
  Cli/Parser/Output/Help.ts             # help text from the same table
  Cli/Parser/Output/Failure.ts          # one JSON error object, exit 2
  Cli/Schema/Schema.ts                  # JSON Schema (2020-12) per command
  Cli/Registry/Registry.ts              # command name → module
  Browser/Cdp/Client.ts                 # connect, send, receive, close
  Browser/Cdp/Command/Evaluate.ts       # Runtime.evaluate helper
  Browser/Target/Discovery.ts           # GET /json/list → Tab[]
  Browser/Target/Select.ts              # pick tab by url/title/id
  Browser/Session/Session.ts            # attach + evaluate + wait-for-selector
  Browser/Selector/Post.ts              # article → like/bookmark button
  Browser/Selector/List.ts              # list page → member rows
  Model/Post/Post.ts                    # {id, url, author, text, postedAt, …}
  Model/List/List.ts                    # {slug, name, id, members}
  Model/Tab/Tab.ts                      # {id, title, url, active}
  Configuration/Load/Load.ts            # read Configuration.local.json
  Configuration/Schema/Schema.ts        # zod-free hand validation
  Output/Json/Json.ts                   # stable key order, 2-space
  Output/Table/Table.ts                 # padded columns for a TTY
  Command/Post/Like/Like.ts
  Command/Post/Like/Remove.ts
  Command/Post/Bookmark/Add.ts
  Command/Post/Bookmark/Remove.ts
  Command/Post/Extract/Extract.ts       # one article → Model/Post
  Command/Page/Bookmarks/Open.ts
  Command/Page/List/Open.ts             # --name <slug>, id from the map
  Command/Page/List/Member/Add.ts       # add handle to a list
  Command/Tab/List/List.ts
  Command/Tab/Focus/Focus.ts
  Command/Event/Append/Append.ts        # write an event file
  Test/Parser.test.ts
  Test/Select.test.ts
```

Deep nesting is deliberate: a command's path states its domain, so the file that
changes when X renames a button is exactly one file.

### Command contract

| Command                | Arguments                                           | `--json` result                         |
| ---------------------- | --------------------------------------------------- | --------------------------------------- |
| `tab list`             | -                                                   | `{tabs:[{id,title,url,active}]}`        |
| `tab focus`            | `--id <n>`                                          | `{focused:true,id}`                     |
| `post extract`         | `--tab <n>`, `--index <n>`                          | `{post:{…}}`                            |
| `post like`            | `--url <u>` \| `--tab <n> --index <n>`, `--dry-run` | `{liked:true,post:{id,url},was:<bool>}` |
| `post like remove`     | same                                                | `{liked:false,…}`                       |
| `post bookmark add`    | same                                                | `{bookmarked:true,…}`                   |
| `post bookmark remove` | same                                                | `{bookmarked:false,…}`                  |
| `page bookmarks open`  | `--tab <n>`?                                        | `{navigated:true,url,count}`            |
| `page list open`       | `--name <slug>`                                     | `{navigated:true,slug,url}`             |
| `page list member add` | `--name`, `--handle`, `--apply`                     | `{added:true,handle,list}`              |
| `event append`         | `--kind`, `--subject`, `--payload <json>`           | `{written:true,path}`                   |
| `schema`               | `[command]`                                         | JSON Schema document                    |

Every command also accepts `--schema` and prints its own schema instead of
running. `--help` prints the same table the parser was built from.

### Tasks

**Task 1.1 - CDP client.** Files: `Browser/Cdp/Client.ts`,
`Browser/Cdp/Command/Evaluate.ts`. Connect to
`ws://127.0.0.1:9222/devtools/page/<id>`, send `{id,method,params}`, resolve by
id, reject on `error`. Test: evaluate `1+1` against a tab and assert
`{result:{value:2}}` shape.

**Task 1.2 - Target discovery.** Files: `Browser/Target/Discovery.ts`,
`Browser/Target/Select.ts`. `GET /json/list`, filter `type==="page"`, drop
`chrome-extension://`. Select by exact id, then url prefix, then title
substring; fail with `{error:"no-tab", candidates:[…]}` listing what was seen.

**Task 1.3 - Parser and schema.** Files: `Cli/Parser/*`, `Cli/Schema/Schema.ts`.
Subcommand tree declared once as data; `--help` and `--schema` both render from
it. Test: `schema post like` emits `required:["url"]` when `--url` is the only
alternative, and the `--dry-run` flag appears as a boolean property.

**Task 1.4 - Post extraction.** Files: `Browser/Selector/Post.ts`,
`Command/Post/Extract/Extract.ts`. In-page function returns
`{id, url, author:{handle,name,verified}, text, postedAt, media:[…], metrics:{replies,reposts,likes,views}}`
from one `article`. Status id is parsed from the `/status/<id>` permalink, never
from text.

**Task 1.5 - Like / bookmark toggles.** Files:
`Command/Post/Like/{Like,Remove}.ts`, `Command/Post/Bookmark/{Add,Remove}.ts`,
`Browser/Selector/Post.ts`. Locate the button by `data-testid` (`like`,
`unlike`, `bookmark`, `removeBookmark`) with a text fallback; read
`aria-pressed` first so a no-op is reported as `was:true` rather than clicked
twice.

**Task 1.6 - Page openers.** Files: `Command/Page/Bookmarks/Open.ts`,
`Command/Page/List/Open.ts`. Bookmarks is the account menu's saved-posts route;
lists resolve slug → id from `Configuration.local.json`, so no list id is ever
in a command line or a doc.

**Task 1.7 - Config and events.** Files: `Configuration/Load/Load.ts`,
`Configuration/Write/Write.ts`, `Command/Config/Init/Init.ts`,
`Command/Config/Show/Show.ts`, `Command/Event/Append/Append.ts`. Config is JSON
with `{cdp:{host,port},profile,lists:[{slug,name,id}],routes,content,storage}`;
missing file →
`{error:"no-config", expected:"<path>", copy:"<copy command>", next:"maintain config init"}`
and exit 2, never a crash. `config init` writes it atomically from the example;
`config show` masks ids unless `--reveal`. Events are
`Source/Content/Event/<ISO>-<kind>-<subject>.json`.

---

## Stage 2 - Ingest (bookmarks → collections)

### Collections

`Source/content.config.ts` (Astro 7 resolves the content config next to
`srcDir`, i.e. `Source/content.config.ts`; verify with
`node -e "console.log(require('astro/package.json').version)"` and the
`astro:content` docs before writing it).

**`Bookmark`** - `glob({pattern:"**/*.json", base:"./Source/Content/Bookmark"})`

```ts
z.object({
  id: z.string(),                    // status id
  url: z.string().url(),
  author: z.object({handle:z.string(), name:z.string(), verified:z.boolean()}),
  text: z.string(),
  postedAt: z.string().datetime().nullable(),
  media: z.array(z.object({kind:z.enum(["image","video","gif","link"]), url:z.string()})),
  metrics: z.object({replies:z.number(), reposts:z.number(), likes:z.number(), views:z.number()}).partial(),
  lists: z.array(z.string()),       // slugs come from the identifier map
  scrapedAt: z.string().datetime(),
  firstSeenAt: z.string().datetime(),
  source: z.literal("x"),
})
```

**`Event`** - `glob({pattern:"**/*.json", base:"./Source/Content/Event"})`

```ts
z.object({
  at: z.string().datetime(),
  kind: z.enum(["scrape.started","scrape.finished","bookmark.added","bookmark.removed","list.assigned","list.removed"]),
  subject: z.string(),
  payload: z.record(z.unknown()).default({}),
})
```

**`Author`** - `glob` over `Source/Content/Author/*.json`, written by stage 3:
`{handle, name, verified, firstSeenAt, postCount, lists:[…], decision:{by:"rule"|"model"|"manual", confidence, reason}}`.

`bookmarkedAt` is not exposed by the UI. Record `firstSeenAt` (first scrape that
observed the post) and keep `scrapedAt` per observation; the event log carries
`bookmark.added` only for ids that were absent in the previous scrape, so the
first-seen timestamp is a defensible lower bound.

### Tasks

**Task 2.1 - Collection scaffolding.** Files: `Source/content.config.ts`,
`Source/Content/Bookmark/.gitkeep`, `Source/Content/Event/.gitkeep`,
`Source/Content/Author/.gitkeep`. Run `npx astro sync` and confirm
`.astro/types.d.ts` gains the three collection names.

**Task 2.2 - Scrape loop.** Files: `Command/Page/Bookmarks/Scrape/Scrape.ts`.
Navigate, then repeat: extract every `article` in the viewport, scroll, wait for
new ids, stop after N scrolls with no new ids (default 3) or `--limit`. Writes
posts, appends `bookmark.added` for new ids, one `scrape.finished` event with
counts. Output: `{scraped:<n>, new:<n>, updated:<n>, events:<n>}` - counts only,
so the caller's context stays small.

**Task 2.3 - Site pages.** Files: `Source/pages/Bookmark/index.astro`,
`Source/pages/Bookmark/[...id].astro`, `Source/pages/Activity/index.astro`. List
page groups by `lists[]` then by author; detail page renders one post; activity
page is the Event collection in reverse time. All static, no client JS.

**Task 2.4 - Live dev feed.** Files: `Maintain/Command/Event/Tail/Tail.ts`,
`Source/pages/Activity/index.astro` (dev-only refresh). `event tail` polls the
Event directory and prints new events as JSON lines; in dev the activity page
polls a tiny `/Activity/Feed.json` endpoint written by the same command. Pub/sub
stays file-based: the directory is the broker, so nothing needs a running daemon
in production.

---

## Stage 3 - Distribution (authors → the person's own lists) - gated launch process

**Not run automatically.** Distribution is the one stage that spends model
tokens and changes the person's lists, so it ships as tools only and waits for
an explicit start. Building it is in scope; running it is a separate decision.

**Rules first, model second.** For each author, aggregate their bookmarked posts
into one compact evidence record: handle, top domains linked, keyword hits per
bucket, 3 shortest post excerpts capped at 200 chars each. Score with weighted
keyword sets; a score gap above the threshold is decided by rule and never
reaches a model.

**Model only for ambiguity.** Ambiguous authors are batched - 25 per call - into
one request that must answer with a JSON array of
`{handle, list, confidence, reason}`. Response is cached in
`Source/Content/Author/<handle>.json` with `decision.by:"model"`, so the second
run reads the file and spends nothing.

**Manual override wins.** `decision.by:"manual"` is never overwritten.

**Membership is a separate, gated action.** `page list member add` runs per
handle with `--dry-run` by default, 1 handle per 3 seconds, and stops on the
first `{error:"rate-limited"}`. Nothing about stage 3 is automatic without
`--apply`.

The flow it drives is the profile's own: the header's "More" caret
(`[data-testid="userActions"]`) opens "Add/remove from Lists", which opens a
"Pick a List" dialog whose rows are `[role="checkbox"][data-testid="listCell"]`
carrying `aria-checked`. Clicking a row stages the membership and Save commits
it, so a dry run reads `aria-checked` and stops. Two constraints the browser
imposes: the dialog's rows are fetched only while the page believes it is
visible, so a background tab needs `Emulation.setFocusEmulationEnabled` plus
`Page.setWebLifecycleState active` (otherwise the dialog renders as an empty
shell); and closing the dialog without Save writes nothing, which is what makes
the dry run a read.

### Tasks

**Task 3.1 - Evidence builder.** Files: `Command/Author/Evidence/Build.ts`,
`Model/Author/Evidence.ts`. Reads Bookmark collection JSON, emits one record per
author. No model call.

**Task 3.2 - Rule classifier.** Files: `Command/Author/Classify/Rules.ts`,
`Configuration/Rules/Rules.json` (tracked - rules are not secrets). Bucket
keywords per list, weight domain hits, emit `{handle,list,score,gap}`.

**Task 3.3 - Model fallback.** Files: `Command/Author/Classify/Infer.ts`.
Batches ambiguous authors, one request, JSON-only reply, validates against the
same schema, caches decisions.

**Task 3.4 - Apply membership.** Files: `Command/Page/List/Member/Add.ts`
(shared with stage 1), `Command/Author/Distribute/Apply.ts`. Reads decisions,
writes `Author/<handle>.json`, calls the add command per handle behind
`--apply`.

---

## Claim → test

| Claim                    | Test                                                                        |
| ------------------------ | --------------------------------------------------------------------------- |
| CDP is reachable         | `curl -s http://127.0.0.1:9222/json/version` → JSON with `Protocol-Version` |
| CLI parses like clap     | `maintain post like --help` lists `--url`, `--tab`, `--dry-run`             |
| Schema is machine-usable | `maintain post like --schema` validates under draft 2020-12                 |
| Like is idempotent       | run twice → second prints `{was:true}` and does not toggle                  |
| Scrape is idempotent     | run twice → second prints `new:0`, post file count unchanged                |
| Docs leak nothing        | `grep -rE "@[A-Za-z0-9_]{2,}                                                | /i/lists/[0-9]+" Documentation/` → no hits |
| Distribution is cheap    | second `author classify` run makes zero model calls                         |

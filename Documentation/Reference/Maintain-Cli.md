# Maintain CLI - command surface

A clap-shaped CLI over the Chrome DevTools Protocol. One file per command,
PascalCase, nested by domain. Every command prints exactly one JSON object.

## Invocation

```
pnpm maintain <group> <command> [options] [--json] [--schema]
```

`pnpm maintain` is the package script `node Maintain/Target/Index.js`, so
`pnpm run tool` has to have built the tool layer first. From source, the same
entry point is `node Maintain/Source/Index.ts` (Node >= 22.18 strips the types).

`--json` is implied when stdout is not a TTY. `--schema` prints the command's
JSON Schema (draft 2020-12) instead of running it. `--help` renders the same
table the parser was built from.

Every command speaks through a **transport**: CDP is primary and the only one
that may mutate; `--transport view` answers read commands from the shadow store
with identical JSON shapes. See `Reference/Transport.md`.

## Environment

| Variable            | Default                                                 | Meaning                                  |
| ------------------- | ------------------------------------------------------- | ---------------------------------------- |
| `MAINTAIN_CDP_PORT` | `9222`                                                  | Port of the browser's debugging endpoint |
| `MAINTAIN_CONFIG`   | `Maintain/Configuration/Local/Configuration.local.json` | Identifier map                           |
| `MAINTAIN_STORAGE`  | `Maintain/Storage/Shadow`                               | Shadow store root                        |
| `MAINTAIN_VOCABULARY`| `Configuration/Keyword/Keyword.ts` (tracked default)   | Keyword vocabulary, `{slug: [term, …]}`  |
| `MAINTAIN_RULES`    | `Maintain/Configuration/Rules/Rules.json`               | Weighted rules for `author classify`     |
| `MAINTAIN_DEBUG`    | unset                                                   | Print a failure's stack trace to stderr  |

Missing config exits 2 with `{error:"no-config", expected:"<path>",
copy:"<copy command>", next:"maintain config init"}`. No command reads
identifiers from argv.

## Commands

| Command                 | Options                                                              | Result                                               |
| ----------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| `config init`           | `--profile`, `--list <slug>=<id>` (repeatable), `--cdp-port`, `--force` | `{written,profile,lists,cdp,next}`                |
| `config show`           | `--reveal`, `--list <slug>`                                          | `{path,profile,cdp,lists,routes,content,storage}`    |
| `tab list`              | -                                                                    | `{tabs:[{id,title,url,active}]}`                     |
| `tab focus`             | `--id`                                                               | `{focused:true,id}`                                  |
| `post extract`          | `--tab`, `--index`                                                   | `{post:{id,url,author,text,postedAt,media,metrics}}` |
| `post like`             | `--url` \| `--tab --index`, `--dry-run`                              | `{liked:true,post:{id,url},was:bool}`                |
| `post like remove`      | same                                                                 | `{liked:false,…}`                                    |
| `post bookmark add`     | same                                                                 | `{bookmarked:true,…}`                                |
| `post bookmark remove`  | same                                                                 | `{bookmarked:false,…}`                               |
| `page bookmarks open`   | `--tab`                                                              | `{navigated:true,url,count}`                         |
| `page bookmarks scrape` | `--limit`, `--max-idle`, `--tab`                                     | `{source,scraped,new,updated,events}`                |
| `page list open`        | `--name <slug>`                                                      | `{navigated:true,slug,url}`                          |
| `page list member add`  | `--name`, `--handle`, `--apply`                                      | `{added:true,handle,list}`                           |
| `store scrape`          | `--source bookmark\|like\|history`, `--limit`, `--max-idle`, `--tab` | `{source,scraped,new,updated,events}`                |
| `store publish`         | `--id` \| `--source` \| `--since` \| `--all`                         | `{published,unchanged,hidden}`                       |
| `store hide`            | `--id`                                                               | `{hidden:true,id,removed,unchanged}`                 |
| `store status`          | -                                                                    | `{shadow:{…},public:{…}}`                            |
| `author evidence build` | -                                                                    | `{archive,posts,authors:[…],skipped}`                |
| `author classify rules` | -                                                                    | `{rules,threshold,counts,decisions,ambiguous,preserved}` |
| `event append`          | `--kind`, `--subject`, `--payload`                                   | `{written:true,path}`                                |
| `event tail`            | `--follow`, `--dir shadow\|public`, `--since`, `--interval`          | `{directory,count,events}` or JSON lines             |

`--tab` takes a target id from `tab list` or its zero-based index in that list.
A tab a browser extension currently holds a debugger on is never selected:
`tab list` reports it as a candidate, and matching skips to the next one.

`--dry-run` prints `{dryRun:true,action,post:{id,url},was}` - the resolved post,
no click. A mutating command reads the control's state first, so a second run
reports `was:true` instead of toggling back.

`page list member add` inverts that default on purpose: it writes nothing unless
`--apply` is passed, because it is the command a distribution pass calls in a
loop. A dry run reads the handle's "Pick a List" dialog and prints
`{dryRun:true,action,handle,list,member,wouldAdd}`; `--apply` prints
`{added:true,…}` or, when the handle is already on the list,
`{added:false,alreadyMember:true,…}` without pressing Save. A limit is reported
as `{error:"rate-limited"}`, so a caller looping over handles stops instead of
retrying. A profile whose header has no "Add/remove from Lists" control - the
account's own profile is the common case - is `no-list-menu`; a dialog that
opens with no rows is `no-list-surface`. The two are reported apart because
they send a caller looking in different places.

A command that waits for a page to be ready gets one answer when it never is:
`page-not-ready` with `{expression,timeout,url}`. `page bookmarks open`,
`page list open` and `page list member add` stop there, because a count or a
membership write against a page that never arrived would describe something
that is not on screen. Scraping is the exception: `page bookmarks scrape` and
`store scrape` warn on stderr and read what did render, and end as `no-post`
only when nothing did.

## Ingest: three sources, two stores

A saved post and a post that is safe to show the world are different facts, so
ingest writes to an archive and publishing is a separate, explicit step.

| Source     | Route             | What it is                                 |
| ---------- | ----------------- | ------------------------------------------ |
| `bookmark` | `/i/bookmarks`    | posts saved explicitly                     |
| `like`     | `/<handle>/likes` | posts liked, including old likes not saved |
| `history`  | `/i/history`      | the container page, walked tab by tab      |

`/i/bookmarks` redirects to `/i/history`, which presents `Bookmarks` and `Likes`
as tabs; `history` follows those tabs, so it is the union of the other two.
Navigation is confirmed by the page's own load event, not by the URL, because
the redirect would never match the requested prefix.

A post observed twice is one record with two observations. Identity is the
status id; `observations[]` carries one entry per source that showed it, and
`firstSeenAt` is the first scrape that saw it. The interface never exposes when
a post was saved, so nothing in this pipeline may claim `bookmarkedAt` -
`firstSeenAt` is a lower bound and is described as one.

Scraping writes **only** to `Maintain/Storage/Shadow/` (gitignored). The whole
`Maintain/Storage/` tree is ignored, so the code that reads and writes it lives
next door in `Maintain/Store/` - a file dropped under `Storage/` would never be
committed.

```
Post/<statusId>.json              one record per post, merged across sources
Observation.jsonl                 append-only {at,source,statusId,action}
Index.json                        statusId -> file
Event/<ISO>-<kind>-<subject>.json
```

`store publish` and `store hide` are the only commands that write to
`Source/Content/`, and both are idempotent: publishing a published post rewrites
the same bytes, hiding a hidden post changes nothing. `hidden` is a tombstone
checked before every publish, so a later re-scrape cannot resurrect a withheld
post.

`store status` answers the three questions worth asking before a publish: how
much is archived, how much is out, and which channel each post came from.

## Events

`scrape.started` and `scrape.finished` frame a run (`subject` is the source, the
payload carries the counts). `bookmark.added` is written once per post that is
new to the archive - `payload.source` says which channel showed it first, so a
like-discovered post is not misreported as a bookmark. `bookmark.published` and
`bookmark.hidden` record what left the shadow store.

`event tail` reads the directory rather than a socket: the directory is the
broker, so nothing needs a daemon. Without `--follow` it is one object; with it
the command never returns and prints one compact JSON line per event.

## Distribution: evidence without a model

`author evidence build` folds the archive into one compact record per author -
the only input the distribution stage ever hands a model, and the reason that
stage can be priced before it is run:

```json
{
	"handle": "<HANDLE>",
	"name": "<DISPLAY_NAME>",
	"verified": true,
	"posts": 3,
	"domains": [{ "domain": "github.com", "count": 2 }],
	"keywords": { "AI": 4, "UI": 1, "CODE": 9 },
	"excerpts": ["...", "...", "..."]
}
```

The command reads the shadow store and nothing else, so it makes no network
call: two runs on an unchanged archive print the same bytes. Nothing in the
record is a timestamp, a metric or a path, so a re-scrape that only moves
counters cannot churn it.

- `domains` ranks at most five hosts, most-linked first, counting one host once
  per post. Redirectors (`t.co`, `is.gd`, ...) are dropped: a shortener hides
  where a link goes, so ranking it would say nothing about the author.
- `keywords` counts occurrences per bucket on word boundaries - `ai` never
  counts inside `said`. The vocabulary lives in
  `Maintain/Source/Configuration/Keyword/Keyword.ts`; weights and thresholds
  belong to the classifier, not here.
- `excerpts` holds up to three posts, shortest prose first, each at most 200
  characters and cut with `…` rather than past the cap. An author with one post
  has one excerpt; a post with no text has none.

Three kinds of post are left out and counted in `skipped` instead of vanishing:
`hidden` (a tombstone - text withheld from the site is not sent to a model
either), posts no bookmark observed, and posts with no handle.

## Distribution: the rules decide first

`author classify rules` scores every author's evidence against the tracked
weights in `Maintain/Configuration/Rules/Rules.json` and places only the ones
those weights can explain:

```json
{
	"handle": "<HANDLE>",
	"list": "UI",
	"score": 13,
	"gap": 13,
	"by": "rule",
	"reason": "UI 13 (figma×2=6, typography×1=3, dribbble.com×1=4); runner-up AI 0; gap 13 clears 3"
}
```

A placement needs both halves of the threshold. `score` is the best list's
total; `gap` is that list's lead over the runner-up. `threshold.score` and
`threshold.gap` are read from the rules file, never from the TypeScript - a
cut-off living in code is a cut-off nobody can tune. Both are required: a file
without a threshold is a `schema-invalid` failure, not a default.

Everything that clears neither is reported in `ambiguous` with `list: null` and
the same arithmetic in `reason`, so the model pass has exactly the work the
rules could not do. An author no weighted term or host matched scores `0` and
says so.

- A keyword weight applies to the evidence bucket of the same name, so a list
  whose slug has no vocabulary scores on domains only. The loader says so on
  stderr rather than leaving the weight silently inert.
- A domain key covers its subdomains - `figma.com` matches `blog.figma.com` -
  and never a host that merely ends the same way, so `notfigma.com` scores
  nothing for `figma.com`.
- A bad weight (a string, a negative number) is dropped with a warning naming
  the key: one typo in a long weights list must not stop a run.

A decision already marked `decision.by: "manual"` is never scored and never
rewritten. It is reported in `preserved` with the reason on file, including
when its author no longer appears in the archive. `rule` and `model` answers are
previous guesses, so this pass may supersede them.

The command reads the shadow archive and the Author collection and writes
neither, so a dry run stays dry and two runs print the same bytes.

## Example

```bash
pnpm maintain store scrape --source bookmark --limit 200
# {"source":"bookmark","scraped":200,"new":200,"updated":0,"events":202}

pnpm maintain store publish --since 2026-01-01
# {"published":200,"unchanged":0,"hidden":0}

pnpm maintain page list open --name <slug>
# {"navigated":true,"slug":"<slug>","url":"https://…/i/lists/<list-id>"}
```

## Error shape

Every failure is one object, exit 2, no stack trace on stdout:

```json
{
	"error": "no-tab",
	"detail": "no tab matched url prefix",
	"candidates": [{ "id": 123, "url": "…" }]
}
```

Known codes: `no-config`, `config-exists`, `unknown-list`, `no-list-menu`,
`no-list-surface`, `no-tab`, `no-post`, `page-not-ready`, `rate-limited`,
`schema-invalid`, `cdp-unreachable`, `cdp-error`, `io-error`,
`usage`, `internal`. A code is a contract; the `detail` string is not. `--help`
and `--schema` are rendered from the same table the parser matches against, so a
command cannot drift from its own documentation.

## Tests

The parser, the target selector and both stores run without a browser:

```bash
pnpm --filter timeline-maintain test
# node --test "Maintain/Target/Test/*.test.js", after `pnpm run tool`
```

Everything else is verified against the live endpoint - the claim-to-test table
in `Documentation/Plan/Bookmark-Pipeline.md` is the checklist.

## Why one file per command

A command's path states its domain - `Command/Post/Bookmark/Add.ts`. When the
site renames a control, exactly one file changes, and the diff names the domain.
Shared behaviour lives in `Browser/`, `Store/` and `Cli/`; commands stay thin.

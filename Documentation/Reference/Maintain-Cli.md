# Maintain CLI - command surface

A clap-shaped CLI over the Chrome DevTools Protocol. One file per command,
PascalCase, nested by domain. Every command prints exactly one JSON object.

## Invocation

```
node Maintain/Index.ts <group> <command> [options] [--json] [--schema] [--dry-run]
```

`--json` is implied when stdout is not a TTY. `--schema` prints the command's
JSON Schema (draft 2020-12) instead of running it. `--help` renders the same
table the parser was built from.

Every command speaks through a **transport**: CDP is primary and the only one
that may mutate; `--transport view` answers read commands from the shadow store
with identical JSON shapes. See `Reference/Transport.md`.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `MAINTAIN_CDP_PORT` | `9222` | Port of the browser's debugging endpoint |
| `MAINTAIN_CONFIG` | `Maintain/Configuration/Local/Configuration.local.json` | Identifier map |
| `MAINTAIN_STORAGE` | `Maintain/Storage/Shadow` | Shadow store root |

Missing config exits 2 with `{error:"no-config", expected:"<path>"}`. No
command reads identifiers from argv.

## Commands

| Command | Options | Result |
|---|---|---|
| `tab list` | - | `{tabs:[{id,title,url,active}]}` |
| `tab focus` | `--id` | `{focused:true,id}` |
| `post extract` | `--tab`, `--index` | `{post:{id,url,author,text,postedAt,media,metrics}}` |
| `post like` | `--url` \| `--tab --index`, `--dry-run` | `{liked:true,post:{id,url},was:bool}` |
| `post like remove` | same | `{liked:false,…}` |
| `post bookmark add` | same | `{bookmarked:true,…}` |
| `post bookmark remove` | same | `{bookmarked:false,…}` |
| `page bookmarks open` | `--tab` | `{navigated:true,url,count}` |
| `page bookmarks scrape` | `--limit`, `--max-idle`, `--tab` | `{source,scraped,new,updated,events}` |
| `page list open` | `--name AI\|UI\|CODE` | `{navigated:true,slug,url}` |
| `page list member add` | `--name`, `--handle`, `--dry-run` | `{added:true,handle,list}` |
| `store scrape` | `--source bookmark\|like\|history`, `--limit`, `--max-idle`, `--tab` | `{source,scraped,new,updated,events}` |
| `store publish` | `--id` \| `--source` \| `--since` \| `--all` | `{published,unchanged,hidden}` |
| `store hide` | `--id` | `{hidden:true,id,removed,unchanged}` |
| `store status` | - | `{shadow:{…},public:{…}}` |
| `event append` | `--kind`, `--subject`, `--payload` | `{written:true,path}` |
| `event tail` | `--follow`, `--dir shadow\|public`, `--since`, `--interval` | `{directory,count,events}` or JSON lines |

`--tab` takes a target id from `tab list` or its zero-based index in that list.
A tab a browser extension currently holds a debugger on is never selected:
`tab list` reports it as a candidate, and matching skips to the next one.

`--dry-run` prints `{dryRun:true,action,post:{id,url},was}` - the resolved post,
no click. A mutating command reads the control's state first, so a second run
reports `was:true` instead of toggling back.

## Ingest: three sources, two stores

A saved post and a post that is safe to show the world are different facts, so
ingest writes to an archive and publishing is a separate, explicit step.

| Source | Route | What it is |
|---|---|---|
| `bookmark` | `/i/bookmarks` | posts saved explicitly |
| `like` | `/<handle>/likes` | posts liked, including old likes not saved |
| `history` | `/i/history` | the container page, walked tab by tab |

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

## Example

```bash
node Maintain/Index.ts store scrape --source bookmark --limit 200
# {"source":"bookmark","scraped":200,"new":200,"updated":0,"events":202}

node Maintain/Index.ts store publish --since 2026-01-01
# {"published":200,"unchanged":0,"hidden":0}

node Maintain/Index.ts page list open --name AI
# {"navigated":true,"slug":"AI","url":"https://…/i/lists/<LIST_AI>"}
```

## Error shape

Every failure is one object, exit 2, no stack trace on stdout:

```json
{"error":"no-tab","detail":"no tab matched url prefix","candidates":[{"id":123,"url":"…"}]}
```

Known codes: `no-config`, `no-tab`, `no-post`, `rate-limited`,
`schema-invalid`, `cdp-unreachable`, `cdp-error`, `io-error`, `usage`,
`internal`. A code is a contract; the `detail` string is not. `--help` and
`--schema` are rendered from the same table the parser matches against, so a
command cannot drift from its own documentation.

## Tests

The parser, the target selector and both stores run without a browser:

```bash
node --test "Maintain/Test/*.test.ts"
```

Everything else is verified against the live endpoint - the claim-to-test table
in `Documentation/Plan/Bookmark-Pipeline.md` is the checklist.

## Why one file per command

A command's path states its domain - `Command/Post/Bookmark/Add.ts`. When the
site renames a control, exactly one file changes, and the diff names the
domain. Shared behaviour lives in `Browser/`, `Store/` and `Cli/`; commands
stay thin.

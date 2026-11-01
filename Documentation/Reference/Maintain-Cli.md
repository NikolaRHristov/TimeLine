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

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `MAINTAIN_CDP_PORT` | `9222` | Port of the browser's debugging endpoint |
| `MAINTAIN_CONFIG` | `Maintain/Configuration/Local/Configuration.local.json` | Identifier map |

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
| `page list open` | `--name AI\|UI\|CODE` | `{navigated:true,slug,url}` |
| `page list member add` | `--name`, `--handle`, `--dry-run` | `{added:true,handle,list}` |
| `page bookmarks scrape` | `--limit`, `--max-idle` | `{scraped,new,updated,events}` |
| `author evidence build` | `--out` | `{authors:n,records:n}` |
| `author classify rules` | - | `{decided:n,ambiguous:n}` |
| `author classify infer` | `--batch`, `--limit` | `{asked:n,cached:n,decided:n}` |
| `author distribute apply` | `--apply`, `--dry-run` | `{added:n,skipped:n,failed:n}` |
| `event append` | `--kind`, `--subject`, `--payload` | `{written:true,path}` |
| `event tail` | `--since` | one JSON line per event |

## Example

```bash
node Maintain/Index.ts page list open --name AI
# {"navigated":true,"slug":"AI","url":"https://…/i/lists/<LIST_AI>"}
```

## Error shape

Every failure is one object, exit 2, no stack trace on stdout:

```json
{"error":"no-tab","detail":"no tab matched url prefix","candidates":[{"id":123,"url":"…"}]}
```

Known codes: `no-config`, `no-tab`, `no-post`, `rate-limited`,
`schema-invalid`, `cdp-unreachable`.

## Why one file per command

A command's path states its domain - `Command/Post/Bookmark/Add.ts`. When the
site renames a control, exactly one file changes, and the diff names the
domain. Shared behaviour lives in `Browser/` and `Cli/`; commands stay thin.

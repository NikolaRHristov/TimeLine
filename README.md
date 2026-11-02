# TimeLine

A bookmark showcase you own.

A TypeScript CLI (`Maintain/`) drives the Chromium you are already logged into over the Chrome
DevTools Protocol, archives your X bookmarks into a gitignored shadow store, publishes the ones you
choose into Astro content collections, and builds a static site that groups them by your lists and
authors.

Nothing about one account is baked in: list slugs are configuration, the tree ships a single
synthetic post, and no real handle, list id or post id is committed.

## What you get

| Route             | What it shows                                               |
| ----------------- | ----------------------------------------------------------- |
| `/`               | Counts, the lists in use, the five newest posts             |
| `/Bookmark/`      | Every published post, grouped by list and then by author    |
| `/Bookmark/<id>/` | One post: text, media, metrics, and when the archive saw it |
| `/Activity/`      | The event log, newest first - a build-time read, no polling |

Every page renders an empty state when its collection is empty, so a fresh clone builds before it
has any bookmarks.

## Prerequisites

| Requirement       | Why                                                                               | Check                                        |
| ----------------- | --------------------------------------------------------------------------------- | -------------------------------------------- |
| Node ≥ 22.23.4    | Astro 7's engine floor; the CLI is precompiled JavaScript, so it needs none of it | `node --version`                             |
| pnpm ≥ 11         | Workspace install and the tool-layer build                                        | `pnpm --version`                             |
| Chromium with CDP | The CLI reads pages over the DevTools Protocol, using your logged-in session      | `curl -s http://127.0.0.1:9222/json/version` |

Launch the browser you are already logged into with a debugging port, e.g.
`--remote-debugging-port=9222`. A second, freshly started browser has no session and will only ever
show you logged-out pages.

## Quickstart - five steps

### 1. Install and build the tool layer

```bash
pnpm install
pnpm run Build
```

`pnpm run Build` (capital B) compiles `Maintain/Source` to `Maintain/Target` and is what
`pnpm maintain` runs - `"maintain": "node Maintain/Target/Index.js"`. Until it has run, every
`pnpm maintain` command fails with a module-not-found error. `pnpm run build` (lowercase) is the
site build; the two scripts are different and both are needed.

### 2. Write your identifier map

```bash
pnpm maintain config init
```

That writes `Maintain/Configuration/Local/Configuration.local.json` from the tracked example,
atomically and with mode `0600`. Then fill it in - every value is a flag, so onboarding never stops
to ask a question:

```bash
pnpm maintain config init --force --profile <your-handle> --list <slug>=<list-id>
```

Repeat `--list` once per list. Check the result without leaking ids:

```bash
pnpm maintain config show          # list ids masked
pnpm maintain config show --reveal # ids printed
```

### 3. Ingest

Scrape into the shadow store, then publish what you want public:

```bash
pnpm maintain store scrape --source bookmark
pnpm maintain store publish --all
```

Scraping writes only under `Maintain/Storage/` (gitignored). Nothing reaches `Source/Content/` until
`store publish` runs, and re-running a scrape prints `new: 0` because identity is the status id.
Publishing from an empty shadow store fails with `{"error":"no-post"}` (exit 2): the scrape found
nothing, which is a browser or login problem, not a configuration one.

### 4. Build the site

```bash
pnpm run build
```

Output lands in `Target/`, which is gitignored - a committed build would publish every post id the
archive held.

### 5. Serve

```bash
pnpm run Run            # dev server, port 9999 (see astro.config.ts)
pnpm exec astro preview # or serve the built output
```

Astro prints the URL it actually bound; if port 9999 is already taken it uses the next free port
rather than failing.

## Bring your own bookmarks

The pipeline reads three sources through the same CLI, and keeps them apart:

| Source     | Route             | What it is                                  |
| ---------- | ----------------- | ------------------------------------------- |
| `bookmark` | `/i/bookmarks`    | posts you saved explicitly                  |
| `like`     | `/<handle>/likes` | posts you liked, including ones never saved |
| `history`  | `/i/history`      | the container page, walked tab by tab       |

`pnpm maintain store scrape --source <source>` folds a page into the shadow store; `--limit` and
`--max-idle` bound how far it scrolls. `store status` counts what is archived, what is public and
what is hidden; `store hide --id <id>` withdraws a post by deleting its published file and leaving
the shadow record as a tombstone, so a later scrape cannot resurrect it and publish always skips it.

Nothing is hardcoded to an account: the handle, the lists and the CDP endpoint all come from the
identifier map, and `MAINTAIN_CONFIG` / `MAINTAIN_CDP_PORT` override the file and the port for one
command.

The archive has no `bookmarkedAt`: the interface never exposes when a post was saved. `firstSeenAt`
is the first scrape that observed it, and the site says so instead of pretending otherwise.

## Your lists

A **slug** is your word for a list - `alpha`, `reading`, `ai`. It is the only name a command takes,
and it never has to match anything the code knows.

The identifier map declares your lists as `{ slug, name, id }`:

```json
{
	"lists": [
		{ "slug": "alpha", "name": "Alpha", "id": "<list-id>" },
		{ "slug": "beta", "name": "Beta", "id": "<list-id>" }
	]
}
```

`slug` is what commands accept and what the site groups by; `name` is a label kept beside it
(`config init --list alpha=<id>` sets `name` to the slug, so edit the file if you want a longer
one).

To find a list id: open the list in your browser and read the URL -
`https://x.com/i/lists/<list-id>`. The number at the end is the id. Then either add it to the file
or run:

```bash
pnpm maintain config init --force --list alpha=<list-id>
```

An unconfigured slug is a named failure, not a guess:

```json
{
	"error": "unknown-list",
	"detail": "\"alpha\" is not configured; configured lists: beta",
	"configured": ["beta"],
	"next": "add it with: maintain config init --force --list alpha=<id>"
}
```

Posts carry their slugs in `Source/Content/Bookmark/<id>.json`; the site groups by whatever slugs
are there and files the rest under `Unsorted`.

## Your private data

Four paths are gitignored and hold everything machine-specific:

| Path                            | Holds                                      |
| ------------------------------- | ------------------------------------------ |
| `Maintain/Configuration/Local/` | your handle and list ids                   |
| `Maintain/Storage/`             | everything scraped, including hidden posts |
| `Maintain/Target/`              | the compiled CLI                           |
| `Target/`                       | the built site                             |

Nothing in this repository names an account. Keep it that way: a tracked file that contains a real
handle, list id or post id is a bug.

## The CLI is the contract

Any agent - Claude Code, Codex, Cursor, a plain shell - can drive this repo without knowing anything
about the model that wrote it:

- **One JSON object per command**, on stdout. `--json` is implied when stdout is not a TTY.
- **Failures are one object and exit 2**: `{"error":"no-config","expected":…, "copy":…,"next":…}`. A
  code is a contract; the message is not.
- **`--help` and `--schema`** are rendered from the same command table the parser matches against,
  so a command cannot drift from its own documentation.
- **Every value is a flag** - `config init` never asks a question, so onboarding is scriptable end
  to end.
- **No MCP, no daemon, no proprietary tooling**: the browser is reached over the DevTools Protocol
  and the store is plain files.

The full command surface, JSON shapes and error codes are in
`Documentation/Reference/Maintain-Cli.md`; the configuration contract is in
`Documentation/Reference/Configure.md`; an agent-oriented walkthrough is in
`Documentation/Reference/Agent-Quickstart.md`.

## Layout

| Path             | What lives there                                                     |
| ---------------- | -------------------------------------------------------------------- |
| `Maintain/`      | The CLI: CDP client, commands, configuration, shadow store           |
| `Source/`        | The Astro site - `pages/`, `Layout/`, and the `Content/` collections |
| `Target/`        | Build output, regenerated, never committed                           |
| `Documentation/` | Reference, plan and agent-facing docs                                |

## Documentation

- `Documentation/Reference/Configure.md` - every configuration key, its default, and the environment
  overrides.
- `Documentation/Reference/Agent-Quickstart.md` - the five steps for a generic agent.
- `Documentation/Reference/Maintain-Cli.md` - the command table.
- `Documentation/Reference/Storage-Model.md` - the two stores and why there are two.
- `Documentation/Reference/Spacetime.md` - the optional SpacetimeDB projection.
- `Documentation/Skill/Timeline-Bookmarks/SKILL.md` - an operating procedure any agent can load.

## Built with

Astro 7, TailwindCSS and PostCSS, plus `@playform/build` for the tool layer.

## License

CC0 1.0 Universal - see `LICENSE`.

# TimeLine

A bookmark showcase you own - a private drawer of everything you saved, a published canvas of what
you chose to show.

![The Full Composition: the provenance rail, the file drawer, the publish seam, and the bento canvas](Documentation/Assets/Full%20Composition.png)

---

## The shape of it

A TypeScript CLI under `Maintain/` drives the Chromium you are already logged into over the Chrome
DevTools Protocol. It archives your X bookmarks into a gitignored shadow store, publishes the ones
you choose into Astro content collections, and builds a static site from them.

Nothing about one account is baked in. List slugs are configuration, the tree ships a single
synthetic post, and no real handle, list id or post id is committed.

The interface is the same split. Everything private is chrome; everything public is canvas.

- **The rail** reads the event pipeline as depth - one band per stage, the selected stage tall and
  opaque in the middle, the others falling away toward the edges of the drum.
- **The drawer** holds the private side as columns of records: bookmarks, candidates, curated
  entries, authors. A record is dragged down to publish.
- **The seam** is the only element that faces both directions. It names the destination and the
  thing being dropped.
- **The canvas** is the published side: a six-track grid of tiles whose placement is data, so a thin
  archive still composes as a page.

---

## Routes

Each route is PascalCase and is the only spelling that is served. A lowercase or semantic alias
answers with a `301` to the canonical path.

- **`/`** - the showcase: one hero claim, six dispersed boxes, three closing pillars. No records.
- **`/Showcase`** - the same spread, mounted as the layout's own demonstration.
- **`/Workspace`** - the full composition: rail, drawer, seam, canvas, swimlanes, spectrometer,
  status footer. Public and anonymous by default; the only route that reads data.
- **`/Bookmark`** - a showcase page: what a bookmark is and how one is filed.
- **`/Bookmark/<id>`** - one post: text, media, metrics, and when the archive first saw it.
- **`/List`** - a showcase page: what a list is and who may add to one.
- **`/List/<slug>`** - one list, as a bento canvas of its posts.
- **`/Activity`** - a showcase page: what the pipeline records and why the rail counts it.
- **`/Voted`** - a showcase page: what a candidate is and what a vote does, and what it does not.

Every page renders an empty state when its collection is empty, so a fresh clone builds before it
holds a single bookmark.

Aliases are generated from `Source/Function/Route/Map.ts` into `Public/_redirects`. Run
`node Maintain/Script/GenerateRedirects.ts` after editing that map, and never edit the generated
file by hand. `Documentation/Reference/URL-And-Shell.md` has the whole picture.

---

## Before you start

- **Node ≥ 22.23.4** - Astro 7's engine floor. The CLI itself is precompiled JavaScript and needs
  none of it. Check with `node --version`.
- **pnpm ≥ 11** - the workspace install and the tool-layer build. Check with `pnpm --version`.
- **A Chromium with a debugging port** - the CLI reads pages over the DevTools Protocol using your
  logged-in session. Check with `curl -s http://127.0.0.1:9222/json/version`.

Launch the browser you are already logged into with a debugging port, for example
`--remote-debugging-port=9222`. A second, freshly started browser has no session and will only ever
show you logged-out pages.

---

## Five steps

### 1 - Install and build the tool layer

```bash
pnpm install
pnpm run Build
```

`pnpm run Build` (capital B) compiles `Maintain/Source` to `Maintain/Target`, and is what
`pnpm maintain` runs - `"maintain": "node Maintain/Target/Index.js"`. Until it has run, every
`pnpm maintain` command fails with a module-not-found error. `pnpm run build` (lowercase) is the
site build. The two scripts are different and both are needed.

### 2 - Write your identifier map

```bash
pnpm maintain config init
```

That writes `Maintain/Configuration/Local/Configuration.local.json` from the tracked example,
atomically and with mode `0600`. Then fill it in. Every value is a flag, so onboarding never stops
to ask a question:

```bash
pnpm maintain config init --force --profile <your-handle> --list <slug>=<list-id>
```

Repeat `--list` once per list. Check the result without leaking ids:

```bash
pnpm maintain config show          # list ids masked
pnpm maintain config show --reveal # ids printed
```

### 3 - Ingest

Scrape into the shadow store, then publish what should be public:

```bash
pnpm maintain store scrape --source bookmark
pnpm maintain store publish --all
```

Scraping writes only under `Maintain/Storage/`, which is gitignored. Nothing reaches
`Source/Content/` until `store publish` runs, and re-running a scrape prints `new: 0` because
identity is the status id. Publishing from an empty shadow store fails with `{"error":"no-post"}`
and exit 2 - the scrape found nothing, which is a browser or login problem, not a configuration one.

### 4 - Build the site

```bash
pnpm run build
```

Output lands in `Target/`, which is gitignored. A committed build would publish every post id the
archive held.

### 5 - Serve

```bash
pnpm run Run            # dev server, port 9999 (see astro.config.ts)
pnpm exec astro preview # or serve the built output
```

Astro prints the URL it actually bound. If port 9999 is taken it uses the next free port rather than
failing.

---

## Bring your own bookmarks

The pipeline reads three sources through the same CLI and keeps them apart.

- **`bookmark`** - `/i/bookmarks`, the posts you saved explicitly.
- **`like`** - `/<handle>/likes`, the posts you liked, including ones never saved.
- **`history`** - `/i/history`, the container page, walked tab by tab: **Bookmarks** then **Likes**.

`/i/bookmarks` redirects to `/i/history` with the Bookmarks tab selected, so the `bookmark` source
reads the first tab of the page the `history` source walks in full.

`pnpm maintain store scrape --source <source>` folds a page into the shadow store; `--limit` and
`--max-idle` bound how far it scrolls. `store status` counts what is archived, what is public and
what is hidden. `store hide --id <id>` withdraws a post by deleting its published file and leaving
the shadow record as a tombstone, so a later scrape cannot resurrect it and publish always skips it.

Nothing is hardcoded to an account: the handle, the lists and the CDP endpoint all come from the
identifier map, and `MAINTAIN_CONFIG` and `MAINTAIN_CDP_PORT` override the file and the port for one
command.

The archive has no `bookmarkedAt`, because the interface never exposes when a post was saved.
`firstSeenAt` is the first scrape that observed it, and the site says so instead of pretending
otherwise.

---

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

`slug` is what commands accept and what the site groups by. `name` is a label kept beside it -
`config init --list alpha=<id>` sets `name` to the slug, so edit the file for a longer one.

To find a list id, open the list in your browser and read the URL:
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

Posts carry their slugs in `Source/Content/Bookmark/<id>.json`. The site groups by whatever slugs
are there and files the rest under `Unsorted`.

---

## Curate a front page

The homepage can lead with a Curated index. An entry has to be nominated, visitors can vote on it,
and **only the owner can approve it** - a vote ranks a candidate and publishes nothing. Approval is
one command, and a rejection is a tombstone that a later vote cannot undo.

Voting needs a Firebase project of your own, or nothing at all: the Curated index works without one.

```bash
pnpm maintain vote nominate --id <status-id> --list <slug>
pnpm maintain vote queue && pnpm maintain vote approve --id <status-id> --rank 1
```

Setup, the database rules, and the honest anti-abuse caveat are in
`Documentation/Reference/Voting.md`.

---

## Your private data

Four paths are gitignored and hold everything machine-specific.

- **`Maintain/Configuration/Local/`** - your handle and list ids.
- **`Maintain/Storage/`** - everything scraped, including hidden posts and pulled vote counts.
- **`Maintain/Target/`** - the compiled CLI.
- **`Target/`** - the built site.

Nothing in this repository names an account. Keep it that way: a tracked file that contains a real
handle, list id or post id is a bug.

---

## The CLI is the contract

Any agent - a coding assistant, a plain shell - can drive this repository without knowing anything
about the model that wrote it.

- **One JSON object per command**, on stdout. `--json` is implied when stdout is not a TTY.
- **Failures are one object and exit 2** - `{"error":"no-config","expected":…,"copy":…,"next":…}`. A
  code is a contract; the message is not.
- **`--help` and `--schema`** are rendered from the same command table the parser matches against,
  so a command cannot drift from its own documentation.
- **Every value is a flag.** `config init` never asks a question, so onboarding is scriptable end to
  end.
- **No MCP, no daemon, no proprietary tooling.** The browser is reached over the DevTools Protocol
  and the store is plain files.

The full command surface, JSON shapes and error codes are in
`Documentation/Reference/Maintain-CLI.md`; the configuration contract is in
`Documentation/Reference/Configure.md`; an agent-oriented walkthrough is in
`Documentation/Reference/Agent-Quickstart.md`.

---

## Layout

- **`Maintain/`** - the CLI: CDP client, commands, configuration, shadow store.
- **`Source/`** - the Astro site: `pages/`, `Layout/`, `Component/`, and the `Content/` collections.
- **`Source/Stylesheet/`** - `Material.scss` (the shared mixins), the token set in `Global.css`, and
  one sheet per component.
- **`Target/`** - build output, regenerated, never committed.
- **`Documentation/`** - reference, plan, RFCs and the agent-facing skills.

---

## Documentation

- **`Documentation/Reference/Configure.md`** - every configuration key, its default, and the
  environment overrides.
- **`Documentation/Reference/Agent-Quickstart.md`** - the five steps for a generic agent.
- **`Documentation/Reference/Maintain-CLI.md`** - the command table.
- **`Documentation/Reference/Storage-Model.md`** - the two stores, and why there are two.
- **`Documentation/Reference/Spacetime.md`** - the optional SpacetimeDB projection.
- **`Documentation/Reference/Voting.md`** - the Voted index, owner approval, and the Firebase setup.
- **`Documentation/Reference/Design-Composition.md`** - the measured geometry of the workspace
  frame.
- **`Documentation/Skill/`** - the operating procedures an agent loads before touching the tooling.

---

## Built with

Astro 7 with Solid islands, Sass and PostCSS through `@playform/build`, and `@playform/build` again
for the tool layer.

The site is static. The shell, the tokens and the published markup are built once and served from
cache; only the workspace hydrates, because what a person sees in their own drawer depends on who
they are.

---

## License

CC0 1.0 Universal - see `LICENSE`.

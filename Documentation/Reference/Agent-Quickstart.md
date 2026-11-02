# Agent quickstart

The same five steps as the README, written for an agent that has a shell and
nothing else: no MCP server, no editor integration, no vendor-specific tooling.
Every command prints one JSON object and exits `0` on success or `2` on failure.

Run everything from the repository root.

## Preflight

```bash
node --version                 # must be >= 22.23.4
pnpm --version                 # >= 11
curl -s http://127.0.0.1:9222/json/version   # must be JSON with a Protocol-Version
```

If the last one fails, stop and ask the person to relaunch the browser they are
logged into with `--remote-debugging-port=9222`. Do **not** start a second
browser: it has no session and every page will be logged out.

```bash
pnpm install
pnpm run tool                  # builds Maintain/Target, the `pnpm maintain` entry point
```

## Step 1 - write the identifier map

```bash
pnpm maintain config init --json
```

Success: `{"written": "<absolute path>", "profile": "", "lists": [], "cdp": {…}, "next": [<three commands>]}`.

The map is written from the tracked example, atomically, mode `0600`. It is
gitignored. Never commit it and never paste its contents into a document.

## Step 2 - fill in the handle and lists

```bash
pnpm maintain config init --force --json \
  --profile <handle> \
  --list <slug>=<list-id>
```

- `--profile` takes a handle without `@`.
- `--list` is repeatable: one `--list` per list.
- The list id is the number at the end of `https://x.com/i/lists/<list-id>`.

Verify without leaking ids:

```bash
pnpm maintain config show --json            # ids masked
pnpm maintain config show --json --reveal   # ids visible - do not log this
```

`config show` answers "is this wired up?"; it is the check to run before an
ingest.

## Step 3 - ingest

Scrape into the shadow store, then publish deliberately. Scraping writes only
under `Maintain/Storage/` (gitignored); publishing is the only step that writes
`Source/Content/`.

```bash
pnpm maintain store scrape --source bookmark --json
pnpm maintain store publish --all --json
```

Expected: `{"source":"bookmark","scraped":N,"new":N,"updated":0,"events":N+2}`.
A second scrape of the same page must print `"new": 0` - identity is the status
id, so a rising `new` means the scrape is not reading ids correctly.

`store status --json` counts both stores:

```bash
pnpm maintain store status --json
```

`byVisibility.public` rising while `byVisibility.shadow` falls is the only
evidence that a publish did what was asked.

## Step 4 - build

```bash
pnpm run build
```

Output lands in `Target/` (gitignored). A build failure here is usually content:
`Source/Content/**/*.json` is validated by `Source/content.config.ts`, and the
error names the file and the field.

## Step 5 - serve

```bash
pnpm run Run          # dev server on http://localhost:9999
npx astro preview     # or preview the built output
```

## Acting on a post

The mutating commands read the control's state first, so they are idempotent and
safe to retry:

```bash
pnpm maintain post like --url <permalink> --dry-run --json   # resolve only
pnpm maintain post like --url <permalink> --json             # act
```

`--dry-run` prints the resolved post and clicks nothing. A second real run
reports `"was": true` instead of toggling back.

## Discover the surface, do not memorise it

```bash
pnpm maintain --help                       # every command, one line each
pnpm maintain config init --help           # one command's flags
pnpm maintain config init --schema         # the same contract as JSON Schema 2020-12
```

Help and schema are rendered from the table the parser matches against, so they
cannot disagree with what runs.

## Failure codes and what to do

| `error`           | Meaning                                        | Next step                                                    |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| `no-config`       | the identifier map is missing                  | run the `copy` command in the object, or `config init`        |
| `config-exists`   | `config init` would overwrite an existing map  | add `--force` only if replacing the map is intended           |
| `unknown-list`    | a slug is not declared in the map              | `config init --force --list <slug>=<id>`, or use a listed one |
| `schema-invalid`  | the map or a content file has the wrong shape  | read `field` and `reason`; fix the file, do not guess         |
| `cdp-unreachable` | nothing is listening on the DevTools port      | ask the person to relaunch their browser with the flag        |
| `no-tab`          | no tab matched the requested target            | `tab list --json`, then target by `id`                        |
| `usage`           | argv does not match the command                | re-read `--help`; the object lists the accepted options       |
| `rate-limited`    | the site refused a write                       | stop; retry later rather than looping                         |

Every failure object carries a `next` or enough detail to name one. Treat the
`error` code as the contract and the `detail` string as prose.

## Rules for an agent working in this repository

- **Never commit, never push.** The working tree is the deliverable.
- **Never write identifiers into a tracked file.** Handles and list ids belong in
  `Maintain/Configuration/Local/`, which git ignores.
- **Never read the shadow store to answer a question a command answers.**
  `store status` counts; `event tail --json` lists events; the store's files are
  an implementation detail.
- **Prefer repository-relative paths** in anything you write. An absolute path in
  a committed file publishes the machine's layout.
- **Do not invent a list id.** If `unknown-list` fires, the configured set is in
  the failure object.

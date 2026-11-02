# SpacetimeDB - local live projection

A local SpacetimeDB instance holds the same archive as the JSON files, so an
observation is queryable the moment it happens instead of only after someone
opens a file. The files stay the source of truth; this is a projection.

## Install

The vendor's Homebrew tap is stale - its formula pins `1.0.0-rc3-hotfix6`, whose
release asset 404s - and `https://spacetimedb.com/install` serves an HTML page,
so piping it to `sh` does nothing. Install the release binary instead:

```sh
curl -sSL -o /tmp/spacetime.tar.gz \
  https://github.com/clockworklabs/SpacetimeDB/releases/download/v2.14.0/spacetime-aarch64-apple-darwin.tar.gz
tar -xzf /tmp/spacetime.tar.gz -C ~/.local/bin
chmod +x ~/.local/bin/spacetimedb-cli ~/.local/bin/spacetimedb-standalone
ln -sf spacetimedb-cli ~/.local/bin/spacetime
```

The tarball ships `spacetimedb-cli` and `spacetimedb-standalone`; `spacetime` is
a symlink to the CLI. Verified: `spacetime --version` → `2.14.0`.

## Run

```sh
spacetime start --listen-addr 127.0.0.1:3010
```

Port 3000 is SpacetimeDB's default and is usually taken (VS Code held it on this
machine), and `spacetime start` prompts interactively when the port is busy -
pass `--listen-addr` so it never asks.

Bind to loopback only. The module has no auth beyond the server's own identity
handling, so exposing the port exposes the archive.

## Project

```
Maintain/Spacetime/
  spacetime.json           # module path, server nickname
  spacetime.local.json     # local database name - must match what was published
  spacetimedb/
    src/index.ts           # schema + reducers
    package.json           # spacetimedb 2.14.*
```

`spacetime init` writes `spacetime.local.json` with a generated name
(`timeline-<suffix>`), which does **not** match the database that `publish`
creates (`timeline`). Every `sql`/`call` then fails with
`failed to find database timeline-<suffix>`. Fix the file, not the command:

```json
{ "database": "timeline" }
```

## Commands

| Task | Command |
|---|---|
| Build (typecheck + wasm) | `spacetime build` in `Maintain/Spacetime` |
| Publish / update | `spacetime publish timeline --server http://127.0.0.1:3010 --module-path spacetimedb --yes` |
| List databases | `spacetime list --server http://127.0.0.1:3010` |
| Query | `spacetime sql timeline --server http://127.0.0.1:3010 "select … from post"` |
| Call a reducer | `spacetime call timeline observe --server http://127.0.0.1:3010 <args…>` |
| Logs | `spacetime logs timeline --server http://127.0.0.1:3010` |

## Schema

| Table | Key | Holds |
|---|---|---|
| `post` | `id` (status id) | url, author, text, postedAt, firstSeenAt, lastScrapedAt, visibility, replies/reposts/likes/views |
| `author` | `handle` | name, verified, firstSeenAt, postCount |
| `media` | `<postId>:<url>` | kind, url |
| `observation` | `<postId>:<source>:<at>` | append-only metric sample per scrape |
| `event` | `<at>:<kind>:<subject>` | kind, subject, opaque JSON payload |
| `membership` | `<list>:<handle>` | by (rule/model/manual), confidence, reason |

Reducers: `observe`, `record`, `setVisibility`, `classify`, `attach`.

## Invariants

- **Derived ids, never auto-increment.** `.autoInc()` still requires `id` on
  insert in this TypeScript API, so every derived table keys on a string built
  from its content. Replaying a scrape writes nothing new.
- **Observations and events are append-only.** A re-scrape updates `post`
  metrics in place and appends an observation; it never rewrites history.
- **`visibility` gates the site.** Only `public` may reach `Source/Content/`.
- **The module is not the source of truth.** Deleting the database loses no
  data that the JSON files do not hold.

## Claim → test

| Claim | Test |
|---|---|
| CLI installed | `spacetime --version` → `2.14.0` |
| Server up | `lsof -nP -iTCP:3010 -sTCP:LISTEN` shows `spacetime` |
| Module compiles | `spacetime build` → `Build finished successfully.` |
| Database published | `spacetime list --server http://127.0.0.1:3010` shows `timeline` |
| Reducer writes | `spacetime call timeline observe …` then `select id, author, likes from post` returns the row |
| Append-only | a second identical `observe` leaves `select count(*) from observation` unchanged |
| Optional args | `postedAt` is an option: pass `null`, not a bare string |

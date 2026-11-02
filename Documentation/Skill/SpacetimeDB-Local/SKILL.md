---
name: spacetimedb-local-module
description: Use when running a SpacetimeDB module locally.
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos, linux]
metadata:
    hermes:
        tags: [spacetimedb, database, typescript, reducers, local-first, projection]
---

# SpacetimeDB Local Module

SpacetimeDB runs the schema _and_ the application logic (reducers) inside the database process, so a
write is queryable the moment it commits instead of after a refresh. This skill is the install →
init → schema → build → publish → verify path, plus the four traps that cost real time on the first
attempt.

## When to Use

- A project needs a local, live view of data that a file store already holds.
- Someone asks for event-driven tables, subscriptions or in-database logic on their own machine.
- A published module answers `failed to find database <name>-<suffix>`.

## Procedure

1. **Install the release binary, not the formula.** The Homebrew tap (`clockworklabs/tap`) can pin a
   version whose GitHub asset no longer exists, which fails as `curl: (22) … 404`; and
   `https://spacetimedb.com/install` serves the marketing page, so piping it to `sh` installs
   nothing.

    ```sh
    curl -sSL -o /tmp/spacetime.tar.gz \
      https://github.com/clockworklabs/SpacetimeDB/releases/download/<tag>/spacetime-aarch64-apple-darwin.tar.gz
    tar -xzf /tmp/spacetime.tar.gz -C ~/.local/bin
    chmod +x ~/.local/bin/spacetimedb-cli ~/.local/bin/spacetimedb-standalone
    ln -sf spacetimedb-cli ~/.local/bin/spacetime
    ```

    The tarball ships `spacetimedb-cli` and `spacetimedb-standalone`; `spacetime` is only a symlink
    you create. Pick the tag from
    `curl -s https://api.github.com/repos/clockworklabs/SpacetimeDB/releases/latest` and confirm
    with `spacetime --version`.

2. **Start the server on an explicit loopback address.** `spacetime start` defaults to port 3000 and
   prompts interactively when it is busy (an editor or dev server usually holds it), which reads as
   a hang.

    ```sh
    spacetime start --listen-addr 127.0.0.1:3010
    ```

    Bind loopback only: the module has no auth beyond the server's own identity handling. Verify
    with `lsof -nP -iTCP:3010 -sTCP:LISTEN`.

3. **Init the module inside the project, not beside it.**
   `spacetime init <name> --lang typescript --project-path <dir> --non-interactive --local` writes
   `spacetime.json` (module path) and `spacetime.local.json` (database name), then install the
   module's own deps in `<dir>/spacetimedb`.
4. **Write the schema, then let `build` be the typecheck.** `spacetime build` compiles the
   TypeScript module and reports schema errors; there is no separate `tsc` step to trust.
5. **Publish, then prove a write.**

    ```sh
    spacetime publish <db> --server http://127.0.0.1:<port> --module-path <dir> --yes
    spacetime call <db> <reducer> --server http://127.0.0.1:<port> <args…>
    spacetime sql <db> --server http://127.0.0.1:<port> "select … from <table>" --format json
    ```

    `--format json` is the machine-readable form; the default prints a padded table whose borders
    break naive parsing.

6. **Prove idempotency, not just success.** Call the same reducer twice with identical arguments and
   assert the row count did not move. Content-derived primary keys are what make that true (see
   below).

## Query and browse

There is no built-in web console — `curl http://127.0.0.1:<port>/` answers 404 — so the CLI is the
browser. Reach for `describe` before writing any query.

| Task                   | Command                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| Schema, types, indexes | `spacetime describe <db> --server <url>`                                   |
| One-shot query         | `spacetime sql <db> --server <url> "select * from <table>"`                |
| Machine-readable rows  | the same plus `--format json`                                              |
| Interactive prompt     | `spacetime sql <db> --server <url> --interactive`                          |
| Live tail              | `spacetime subscribe <db> --server <url> "select * from <table>"`          |
| Typed client           | `spacetime generate --lang typescript --module-path <dir> --out-dir <dir>` |

Three limits of the query surface read as failures, not as syntax you can fix:

- **No `GROUP BY`.** `select visibility, count(*) … group by visibility` answers `400 Bad Request`.
  `count(*)` on its own works; every breakdown is a client-side count over
  `select <column> from <table>`.
- **A subscription takes a table, not a projection.** `select id, author from post` is rejected with
  `Column projections are not supported in subscriptions; Subscriptions must return a table type` —
  subscribe to `select * from <table>` and filter in the client.
- **Columns are snake_case at the SQL surface.** A module declares `firstSeenAt` and `postCount`,
  but `describe` and `sql` expose `first_seen_at` and `post_count`; the camelCase spelling fails as
  an unknown column, which reads like a missing field rather than a naming convention.

## Schema rules that keep it replayable

- **Derived ids, never auto-increment.** `.autoInc()` in the TypeScript schema API still requires
  the `id` field on `insert`, so an auto-inc column does not save you a key. Build the key from the
  content instead — `<postId>:<source>:<at>`, `<at>:<kind>:<subject>` — and look the row up by key
  before inserting. A replay then writes nothing rather than duplicating history.
- **Append-only stays append-only.** Update the mutable entity (a post's metrics) in place; append
  an observation row for every scrape that saw it.
- **Keep one gate field.** A `visibility` (`shadow | public | hidden`) is the only thing that
  decides what a downstream exporter may publish.
- **Opaque payloads beat migrations.** Store event payloads as a JSON string so a new event shape
  needs no schema change.

## The module is a projection, never the source of truth

Keep the files (or the existing store) authoritative and treat the database as rebuildable. An
exporter reads the database and writes the same files a static site already consumes — the site
build must never connect to the database, or a static/CI build acquires a live service dependency.

## Pitfalls

- **`failed to find database <name>-<suffix>` is a config mismatch, not a missing database.**
  `spacetime init` writes a generated name into `spacetime.local.json` that does not match what
  `publish` created; every `sql` and `call` then resolves the wrong name. Fix the file to the
  published name, and confirm the truth with `spacetime list --server <url>`.
- **An option-typed reducer argument is a sum type, in both directions.** A bare string for a
  `t.string().optional()` parameter fails with `invalid type: string …, expected sum type`, and
  `null` is accepted but means _none_ - so a value sent as `null` succeeds with the field silently
  dropped. The wire shape is `{"some":"<value>"}` for a value and `null` for none; check the
  parameter index the error names.
- **A program calls a reducer over HTTP, not through the CLI.** The CLI's own transport is
  `POST <url>/v1/database/<identity>/call/<reducer>` with `Authorization: Bearer <token>` and a JSON
  **array** of positional arguments (not an object keyed by name), answering `200` with an empty
  body. The token is the `spacetimedb_token` line in `~/.config/spacetime/cli.toml`; the identity is
  `GET <url>/v1/database/<name>` -> `database_identity.__identity__` with the `0x` prefix stripped,
  which equals the identity `spacetime list` prints. Resolve it once per run rather than hardcoding
  a hex string. A wrong argument shape answers `400 invalid arguments for reducer <name>: [<index>]`
    - the index is the whole diagnosis.
- **`spacetime sql` positional order is `[DATABASE] <QUERY>`** and the server flag is `-s/--server`;
  a name that resolves locally in one command can still resolve from `spacetime.local.json` in
  another, so read the error's database name before editing anything.
- **A projection lags its source silently.** Nothing errors when the file store gains rows the
  database has never seen: a push that ran before the last scrape leaves `select count(*)` smaller
  than the store's own count, and a push that sends only entities leaves the derived tables
  (observations, events) empty. When asked whether the data "is in the database", count both layers
  and report the difference —
  `spacetime sql <db> -s <url> "select count(*) as n from <table>" --format json` against
  `ls <store>/<Entity> | wc -l` — instead of answering from the schema. A push command's own
  `--dry-run` count is the third number worth quoting.
- **A publish is an upload, not a migration.** Breaking schema changes need `--delete-data` and
  destroy rows; publish to a fresh database name while iterating instead.
- **Do not run the server as a long foreground command.** It never exits; start it in the background
  and health-check with `lsof` or a `spacetime list` call.

## Claim → test

| Claim                         | Test                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| CLI installed                 | `spacetime --version` prints the release tag                                                                                       |
| Server up                     | `lsof -nP -iTCP:<port> -sTCP:LISTEN` shows `spacetime`                                                                             |
| Module compiles               | `spacetime build` → `Build finished successfully.`                                                                                 |
| Database published            | `spacetime list --server http://127.0.0.1:<port>` shows the name                                                                   |
| Reducer writes                | `spacetime call …` then `spacetime sql … "select count(*) from <table>"`                                                           |
| Replay is idempotent          | a second identical `call` leaves `count(*)` unchanged                                                                              |
| Optional argument round-trips | send `{"some":"<value>"}` for the optional argument, then `select <column> from <table>` shows the value rather than `(none = ())` |
| Config matches reality        | the name in `spacetime.local.json` equals the row in `spacetime list`                                                              |
| Schema is discoverable        | `spacetime describe <db> --server <url>` lists tables, columns and indexes                                                         |
| Aggregation is client-side    | `select count(*) from <table> --format json` works; the same query with `group by` returns 400                                     |

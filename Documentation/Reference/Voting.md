# Voting - a public ranking, a private gate

The site has three states and one rule:

```
candidate --nominate--> Voted index --visitors vote--> ranked
                                                          |
                                        the owner reads the queue
                                                          |
                            approve --> Curated index (top of the homepage)
                            reject  --> tombstone, never resurrected
```

**A vote never publishes anything.** The Curated index is written by `pnpm maintain vote approve`, a
command a human runs. Visitors can rank what is already on the table; they cannot put anything on
it.

## The two collections

`Source/Content/Voted/<id>.json` - one file per candidate, read at build time:

```json
{
	"id": "<status-id>",
	"url": "https://x.com/<handle>/status/<status-id>",
	"title": "optional short label",
	"note": "optional reason it was nominated",
	"author": { "handle": "<handle>", "name": "<name>", "verified": false },
	"lists": ["<slug>"],
	"votes": 42,
	"votedAt": "2026-01-01T00:00:00.000Z",
	"nominatedAt": "2026-01-01T00:00:00.000Z",
	"status": "candidate"
}
```

`status` is `candidate`, `approved` or `rejected`. A rejected file stays on disk: it is a tombstone,
so a later scrape, a later nomination or a later vote cannot bring the entry back.

`Source/Content/Curated/<id>.json` - the final index, and the only thing the homepage leads with:

```json
{
	"id": "<status-id>",
	"rank": 1,
	"votes": 42,
	"approvedAt": "2026-01-01T00:00:00.000Z",
	"approvedBy": "manual"
}
```

`rank` is written by the owner, not derived from `votes` - the point of curation is that a crowd can
be overruled. Ranks are dense and unique: 1..N with no gaps, renumbered by every write.

The payload is never duplicated. `Curated/<id>.json` points at the `Voted` (or `Bookmark`) record by
`id`, and the pages join them.

`votes` and `votedAt` are a **snapshot**, refreshed by `pnpm maintain vote sync`. Nothing is fetched
at build time, so the published site is reproducible even after the live count moves on.

Four fixtures ship with the repository, one per state, so a fresh clone renders every branch of this
feature: `Voted/example-post.json` (approved), `Voted/example-candidate.json` (candidate),
`Voted/example-rejected.json` (a tombstone, rendered nowhere) and `Curated/example-post.json`. They
contain no real post; delete them as you add your own.

## Commands

```bash
pnpm maintain vote nominate --id <status-id> [--list <slug>] [--note <text>] [--title <text>]
pnpm maintain vote nominate --url <URL> [--list <slug>] [--note <text>]
pnpm maintain vote queue [--json] [--limit <n>]
pnpm maintain vote sync [--json]
pnpm maintain vote approve --id <status-id> [--rank <n>]
pnpm maintain vote reject --id <status-id> [--reason <text>]
pnpm maintain vote rank --id <status-id> --rank <n>
```

Every command prints one JSON object, accepts `--json` (implied when stdout is not a TTY), and fails
with a named code plus a `next` step on the same object.

| Command    | Does                                                                             | Idempotent because                                              |
| ---------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `nominate` | Copies a shadow post (or takes a URL) into the Voted index as `candidate`        | A second run reports `unchanged` when the file would not change |
| `queue`    | Every `candidate`, votes descending, with age and lists                          | Read-only                                                       |
| `sync`     | Pulls counts into `Maintain/Storage/Vote/` and updates `votes`/`votedAt`         | Only a count that moved rewrites a file                         |
| `approve`  | Writes `Curated/<id>.json`, flips the Voted file to `approved`, writes the event | A second run reuses the rank and timestamp, `unchanged`         |
| `reject`   | Flips to `rejected` and keeps the file                                           | A second run reports `unchanged`                                |
| `rank`     | Moves a curated entry and renumbers the index                                    | Same position is `unchanged`                                    |

Failure codes this feature adds: `no-transport`, `vote-unreachable`, `no-entry`, `not-curated`,
`already-curated`, `tombstone`.

`nominate` takes `--id` or `--url` rather than a positional argument: the parser matches a command
by its full word path and reads everything else as an option, which is the same shape `post extract`
and `store hide` use.

## The owner's loop

```bash
# 1. what is waiting
pnpm maintain vote queue

# 2. refresh the counts from the vote store (needs a project, see below)
pnpm maintain vote sync

# 3. decide
pnpm maintain vote approve --id <status-id> --rank 1
pnpm maintain vote reject --id <status-id> --reason "off topic"

# 4. publish
pnpm run build
```

Rejected entries disappear from every list and refuse both `approve` and a second `nominate`.
Withdrawing something that is already curated is a manual delete of
`Source/Content/Curated/<id>.json`; there is no command that silently unpublishes a page.

## Voting on the site

`/Voted/` renders every candidate, best-supported first, with the counts on file. When a project is
configured, each row also gets a `Vote` button and the count is refreshed live from the database.
When one is not, the page says so and renders no buttons - that is the state of every fresh clone,
and it is the default path, not an error path.

A vote is an additive integer in the Realtime Database under `votes/<status-id>`. It is cast with a
transaction, so two visitors voting at the same moment add up instead of overwriting each other.
There are no downvotes: a downvote needs an identity to mean anything.

## Bring your own Firebase project

Nothing here needs a Firebase account to work. Skip this section and the Curated index still builds,
publishes and renders - you just have no vote buttons.

1. **Create a project** at the Firebase console. A free plan is enough.
2. **Create a Realtime Database** (not Firestore) in any region. Note the database URL it shows, of
   the form `https://<project-id>-default-rtdb.<region>.firebasedatabase.app`.
3. **Paste the rules.** Copy `Maintain/Configuration/Vote/Firebase.rules.json` into the database's
   _Rules_ tab and publish. They allow reading the counts, allow writing one whole non-negative
   integer per entry, cap it at 1,000,000, restrict the key to a plain slug, and reject every other
   top-level key.
4. **Register a web app** in the project and copy its config.
5. **Export the configuration.** Either set the variables:

    | Variable                                     | Where it comes from                 |
    | -------------------------------------------- | ----------------------------------- |
    | `MAINTAIN_VOTE_FIREBASE_API_KEY`             | `apiKey`                            |
    | `MAINTAIN_VOTE_FIREBASE_AUTH_DOMAIN`         | `authDomain`                        |
    | `MAINTAIN_VOTE_FIREBASE_DATABASE_URL`        | `databaseURL` (required)            |
    | `MAINTAIN_VOTE_FIREBASE_PROJECT_ID`          | `projectId` (required)              |
    | `MAINTAIN_VOTE_FIREBASE_STORAGE_BUCKET`      | `storageBucket`                     |
    | `MAINTAIN_VOTE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId`                 |
    | `MAINTAIN_VOTE_FIREBASE_APP_ID`              | `appId`                             |
    | `MAINTAIN_VOTE_FIREBASE_MEASUREMENT_ID`      | `measurementId`                     |
    | `MAINTAIN_VOTE_FIREBASE_TOKEN`               | optional; database auth token       |
    | `MAINTAIN_VOTE_TRANSPORT`                    | `firebase` or `none`; usually unset |

    or write the same keys into `Maintain/Configuration/Local/Vote.local.json`, which is gitignored
    because it names one machine's project:

    ```json
    {
    	"apiKey": "<API-key>",
    	"databaseURL": "https://<project-id>-default-rtdb.<region>.firebasedatabase.app",
    	"projectId": "<project-id>"
    }
    ```

    The environment wins over the file, per key.

6. **Rebuild.** `pnpm run build` embeds the public configuration into `/Voted/`;
   `pnpm maintain vote sync` starts answering with real counts.

`MAINTAIN_VOTE_TRANSPORT=none` forces the read-only path even with a project configured - it is how
you check that the no-voting build still works.

### What the browser gets

A Firebase web `apiKey` is a public project identifier, not a secret: it authorises nothing on its
own, and the rules are what decide who may write. The page embeds the configuration as JSON in the
document, which is what every Firebase web app does. The SDK itself is only downloaded when a
configuration exists.

## Anti-abuse

What is implemented:

- **One vote per entry per device.** A random device id is created once and kept in `localStorage`,
  and the entries that device voted on are remembered beside it. No accounts, no email, no PII, and
  no identifier is ever sent to the database - the only thing written is the new integer.
- **Additive integers, capped.** The rules reject anything that is not a whole non-negative number,
  cap the value, and restrict keys to `[A-Za-z0-9_-]`.
- **Rejection is permanent.** A tombstone cannot be re-nominated and cannot be approved.
- **Approval is manual.** No code path publishes an entry without a person running
  `pnpm maintain vote approve`.

What is **not** implemented, stated plainly: client-side checks are not security. A determined
visitor can clear site data, or write to the database directly, and stuff the box. The rules bound
the damage to "some entries have implausible numbers"; they cannot make a vote one-per-person
without an identity, and this design has no identity by choice. That is exactly why a vote only
ranks, and why approval is a human action.

## Deliberately out of scope

- **Downvotes.** Meaningless without identity.
- **Public submission.** There is no form and no write endpoint. The candidate index is filled by
  the owner; an unauthenticated submission surface would be a moderation problem this iteration does
  not solve. `configuration.vote` therefore has no `submission` key to turn on.
- **Withdrawing a curated entry from the CLI.** Deleting the `Curated` file is the operation;
  nothing in the CLI unpublishes silently.

## Claim → test

| Claim                                | Test                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| No real project in the tree          | `git grep -niE 'apiKey\|projectId' -- .` → placeholders only                                               |
| A fresh clone builds with no project | `pnpm run build` with no `MAINTAIN_VOTE_*` → `Target/Voted/index.html` contains "Voting is not configured" |
| The page still ranks                 | the same build renders every candidate, sorted by `votes`                                                  |
| `sync` without a transport is named  | `pnpm maintain vote sync` → `{"error":"no-transport"}`, exit 2, nothing written                            |
| Approval is idempotent               | a second `pnpm maintain vote approve --id <id>` → `"unchanged": true`, same bytes                          |
| A tombstone stays dead               | `reject` then `approve` → `{"error":"tombstone"}`; `nominate` the same id → `tombstone`                    |
| Curated cannot be rejected           | `reject` a curated id → `{"error":"already-curated"}`                                                      |
| The index is written, not rendered   | `grep -c '"text"' Source/Content/Curated/*.json` is 0 - the payload stays in `Bookmark` or `Voted`         |

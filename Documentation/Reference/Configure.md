# Configure

The identifier map is the one file that knows your handle and your list ids. It is **gitignored** -
`Maintain/Configuration/Local/` is excluded wholesale, so a clone never inherits anyone's
identifiers.

The tracked template is `Maintain/Configuration/Example/Configuration.example.json`. It holds
defaults and placeholders only: empty `profile`, empty `lists`, no ids.

## Where the map lives

```
Maintain/Configuration/Local/Configuration.local.json
```

Override the location with `MAINTAIN_CONFIG` (absolute, or relative to the working directory).
`config show` always prints the path it resolved.

A missing map is `no-config`, and the failure carries both the absolute path it expected and the
exact copy command:

```json
{
	"error": "no-config",
	"detail": "the identifier map is missing",
	"expected": "<absolute path>",
	"copy": "mkdir -p \"<absolute directory>\" && cp \"<absolute example>\" \"<absolute path>\"",
	"next": "maintain config init"
}
```

## Keys

| Key                  | Type                         | Default                     | Meaning                                                                 |
| -------------------- | ---------------------------- | --------------------------- | ----------------------------------------------------------------------- |
| `cdp.host`           | string                       | `"127.0.0.1"`               | Host of the browser's DevTools endpoint                                 |
| `cdp.port`           | integer                      | `9222`                      | Port of that endpoint                                                   |
| `profile`            | string                       | `""` (unknown)              | Your handle, without `@`. Fills the `likes` route                       |
| `lists`              | array of `{slug,name,id}`    | `[]`                        | Your lists. Empty is valid - commands that need one fail `unknown-list` |
| `routes.bookmarks`   | string (url)                 | `https://x.com/i/bookmarks` | Page the `bookmark` source is read from                                 |
| `routes.likes`       | string (url)                 | derived from `profile`      | Page the `like` source is read from                                     |
| `routes.history`     | string (url)                 | `https://x.com/i/history`   | Container page the `history` source walks                               |
| `content.root`       | string (repository-relative) | `Source/Content`            | Where the site's collections live                                       |
| `storage.shadow`     | string (repository-relative) | `Maintain/Storage/Shadow`   | Where the shadow store lives                                            |
| `storage.vote`       | string (repository-relative) | `Maintain/Storage/Vote`     | Where `vote sync` parks the pulled counts (gitignored)                  |
| `spacetime.url`      | string (url)                 | `http://127.0.0.1:3010`     | The SpacetimeDB server `store push` projects into                       |
| `spacetime.database` | string                       | `timeline`                  | The database module `store push` calls `observe` on                     |

`routes.likes` is derived from `profile` on purpose: one key cannot drift from the other. Set it
explicitly only if the derived URL is wrong for you.

### `lists`

The set of lists is yours, so nothing in the code enumerates it. Each entry is `{ slug, name, id }`:

```json
{
	"lists": [
		{ "slug": "alpha", "name": "Alpha", "id": "0000000000000000000" },
		{ "slug": "beta", "name": "Beta", "id": "0000000000000000001" }
	]
}
```

- `slug` is what a command takes: letters, digits, dash, underscore.
- `name` is what the site prints; it defaults to the slug.
- `id` is the number at the end of `https://x.com/i/lists/<id>`.

Two older shapes are still read, so an existing map keeps working: an object keyed by slug
(`{"alpha": {"id": "…"}}`) and a bare id (`{"alpha": "…"}`). A slug declared twice keeps its first
id.

## Commands

### `config init`

Writes the map from the tracked example, then applies the flags. Non-interactive by construction -
every value is a flag, which is what makes it agent-drivable.

| Flag                 | Kind               | Meaning                                                 |
| -------------------- | ------------------ | ------------------------------------------------------- |
| `--profile <handle>` | string             | Your handle; a leading `@` is stripped                  |
| `--list <slug>=<id>` | string, repeatable | One configured list. Repeat once per list               |
| `--cdp-port <n>`     | integer            | Port of the DevTools endpoint                           |
| `--force`            | boolean            | Replace an existing map, keeping its values as the base |

- No flags: writes the example's defaults and prints the next three commands.
- An existing map without `--force` is `config-exists` - list ids cannot be rediscovered from the
  interface, so replacing them is deliberate.
- With `--force` on an existing map, that map is the base: only the flags given are changed. The
  onboarding sequence the command prints runs `init --force` once per fact (the handle, then each
  list), and each step must not undo the one before it. `--list` replaces the entry for its slug and
  appends the rest, so wiring a second list does not drop the first. To start over from scratch,
  delete the file first.
- The write is atomic: a temporary file beside the target, then a rename. A reader never sees half a
  map. The parent directory is created if missing.
- Mode `0600`. The map carries a public handle and public list ids - **never** put a token, cookie
  or password in it.

### `config show`

Prints the resolved map - after defaults, after env overrides - with list ids masked. `--reveal`
prints them.

```bash
maintain config show          # {"lists":[{"slug":"alpha","id":"*"}], …}
maintain config show --reveal # {"lists":[{"slug":"alpha","id":"1"}], …}
```

`--list <slug>` narrows the output to one list. The slug is resolved against the map, never against
a hardcoded set, so an unconfigured slug is `unknown-list` whose message names the configured set
(`detail`) and repeats it in `configured`:

```bash
maintain config show --list alpha # one entry
maintain config show --list nope  # {"error":"unknown-list","configured":["alpha","beta"],…}
```

## Environment overrides

| Variable                | Overrides              | Notes                                                             |
| ----------------------- | ---------------------- | ----------------------------------------------------------------- |
| `MAINTAIN_CONFIG`       | the map's path         | Absolute, or relative to the working directory                    |
| `MAINTAIN_CDP_PORT`     | `cdp.port`             | Wins over the map; non-numeric values are ignored with a warning  |
| `MAINTAIN_STORAGE`      | `storage.shadow`       | Points the whole store at a temporary directory for a test        |
| `MAINTAIN_VOTE_STORAGE` | `storage.vote`         | The same, for the pulled vote counts                              |
| `MAINTAIN_VOCABULARY`   | the keyword vocabulary | A JSON file of `{ "<slug>": ["term", …] }`; unreadable falls back |
| `MAINTAIN_RULES`        | the weights file       | Absolute, or relative to the working directory                    |
| `MAINTAIN_DEBUG`        | -                      | Prints the stack trace of a failure to stderr                     |

Environment beats the file, and the file beats the default. A command that only touches the browser
(`tab list`, `post extract`) works with no map at all: it warns on stderr and falls back to
`127.0.0.1:9222`.

### Vocabulary

`author evidence` counts words per bucket, and a bucket is a list slug. The tracked default is
`Maintain/Source/Configuration/Keyword/Keyword.ts`; point `MAINTAIN_VOCABULARY` at a JSON file to
count your own words under your own slugs:

```json
{
	"alpha": ["retrieval", "embedding"],
	"beta": ["typography", "figma"]
}
```

A file that cannot be read, is not JSON, or names no bucket is reported on stderr and the tracked
vocabulary is used instead - counting is an aid, not a prerequisite. Buckets need not match your
`lists`: a list with no bucket of the same slug still scores on domains, and the rules loader says
so.

### Weights

`author classify rules` scores each author against the tracked
`Maintain/Configuration/Rules/Rules.json`, which ships keyed to the example slugs. Neither direction
is silent:

- a slug your map declares but the weights file does not is still scored on domains - an empty
  keyword list is not an error;
- a weight for a slug your map does **not** declare is dropped, with a warning on stderr naming it,
  so the weights file can never re-introduce a list you did not configure.

Point `MAINTAIN_RULES` at your own file to bring your own weights:

```json
{
	"threshold": { "score": 3, "gap": 3 },
	"lists": {
		"alpha": {
			"keywords": { "retrieval": 2, "embedding": 1 },
			"domains": { "arxiv.org": 1 }
		}
	}
}
```

`threshold.score` is the score a list needs before an author is assigned to it and `threshold.gap`
the margin over the runner-up; below either, the author is left ambiguous rather than guessed. A
weight is a non-negative number - a string such as `"strong"`, a negative number or a term the
vocabulary never counts is ignored with a warning on stderr, and the rest of the file still loads.

## Failure codes

| Code             | When                                              | Carries                                  |
| ---------------- | ------------------------------------------------- | ---------------------------------------- |
| `no-config`      | the map is missing                                | `expected`, `copy`, `next`               |
| `config-exists`  | `config init` would overwrite without `--force`   | `path`, `next`                           |
| `schema-invalid` | the map is not JSON, or a key has the wrong shape | `path`, `field`, `reason`                |
| `unknown-list`   | a command named a slug the map does not declare   | `slug`, `configured`, `expected`, `next` |
| `io-error`       | the map could not be written (permissions, disk)  | `path`, `reason`                         |

Every failure is one JSON object on stdout and exit code 2. A code is a contract; the `detail`
string is not.

## Leak audit

The repository is public, so two questions are asked of the tracked tree whenever it changes.
`scripts/audit-leaks.sh` asks both and exits non-zero on any hit:

```bash
scripts/audit-leaks.sh            # the repo this script lives in
scripts/audit-leaks.sh . '^Update\.sh$'
```

1. **No absolute machine paths.** No `file:///` URL, and no `/Users`, `/Volumes` or `/home` prefix
   followed by a name, in a tracked file. Anchored to a letter so documentation that _quotes_ the
   forbidden form does not fail the check.
2. **No private origin names.** The wordlist lives in `Maintain/Configuration/Local/Origin.txt` -
   gitignored, because a tracked list of the names you are hiding would itself be the leak. Beside
   it, `Origin.public.txt` names the entries that are _also_ public namespaces (the build
   toolchain's `@playform/*` npm scope, the conduct contact address); the script subtracts one from
   the other and greps the difference.

Both files are yours to write; a clone has neither, and the origin half of the audit reports `SKIP`
rather than pretending to pass.

The same two rules are why the map, the shadow store, the compiled tool layer (`Maintain/Target/`)
and the compiled site (`/Target/`) are gitignored: each one records something machine-specific or
account-specific. Ignoring does not untrack - a file already in the index stays there until
`git rm --cached`.

# Maintain CLI - command surface

A clap-shaped CLI over the Chrome DevTools Protocol. One file per command, PascalCase, nested by
domain. Every command prints exactly one JSON object.

## Invocation

```
pnpm maintain <group> <command> [options] [--json] [--schema]
```

`pnpm maintain` is the package script `node Maintain/Target/Index.js`, so `pnpm run Build` (capital
B) has to have compiled the tool layer first - `pnpm run tool` is the _runner_ (the same
`node Target/Index.js`), not the compiler. From source, the same entry point is
`node Maintain/Source/Index.ts` (Node >= 22.18 strips the types).

`--json` is implied when stdout is not a TTY. `--schema` prints the command's JSON Schema (draft
2020-12) instead of running it. `--help` renders the same table the parser was built from.
`--transport cdp|view` is accepted by every command and defaults to `cdp`.

Every command speaks through a **transport**: CDP is primary and the only one that may mutate;
`--transport view` answers read commands from the shadow store with identical JSON shapes. See
`Reference/Transport.md`.

## Environment

| Variable                  | Default                                                 | Meaning                                          |
| ------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| `MAINTAIN_CDP_PORT`       | `9222`                                                  | Port of the browser's debugging endpoint         |
| `MAINTAIN_CONFIG`         | `Maintain/Configuration/Local/Configuration.local.json` | Identifier map                                   |
| `MAINTAIN_STORAGE`        | `Maintain/Storage/Shadow`                               | Shadow store root                                |
| `MAINTAIN_VOTE_STORAGE`   | `Maintain/Storage/Vote`                                 | Where `vote sync` parks the counts it pulled     |
| `MAINTAIN_VOTE_TRANSPORT` | unset (`firebase` when configured, else `none`)         | Vote transport; `none` forces the read-only path |
| `MAINTAIN_VOCABULARY`     | `Configuration/Keyword/Keyword.ts` (tracked default)    | Keyword vocabulary, `{slug: [term, …]}`          |
| `MAINTAIN_RULES`          | `Maintain/Configuration/Rules/Rules.json`               | Weighted rules for `author classify`             |
| `MAINTAIN_MODEL_URL`      | unset (required by `author classify infer`)             | OpenAI-compatible chat-completions URL           |
| `MAINTAIN_MODEL_KEY`      | unset                                                   | Bearer token for that endpoint                   |
| `MAINTAIN_MODEL`          | unset                                                   | Model id to ask for, when the endpoint needs one |
| `MAINTAIN_MODEL_TIMEOUT`  | `120`                                                   | Seconds before one request is abandoned          |
| `MAINTAIN_DEBUG`          | unset                                                   | Print a failure's stack trace to stderr          |

Missing config exits 2 with
`{error:"no-config", expected:"<path>", copy:"<copy command>", next:"maintain config init"}`. No
command reads identifiers from argv.

## Commands

| Command                   | Options                                                                 | Result                                                                  |
| ------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `config init`             | `--profile`, `--list <slug>=<id>` (repeatable), `--cdp-port`, `--force` | `{written,overwritten,profile,lists,cdp,next}`                          |
| `config show`             | `--reveal`, `--list <slug>`                                             | `{path,profile,cdp,lists,routes,content,storage}`                       |
| `tab list`                | -                                                                       | `{tabs:[{id,title,url,active}]}`                                        |
| `tab focus`               | `--id`                                                                  | `{focused:true,id}`                                                     |
| `post extract`            | `--id` \| `--url` \| `--tab --index`                                    | `{post:{id,url,author,text,postedAt,media,metrics},source}`             |
| `post like`               | `--id` \| `--url` \| `--tab --index`, `--dry-run`                       | `{liked:true,post:{id,url},was:bool}`                                   |
| `post like remove`        | same                                                                    | `{liked:false,…}`                                                       |
| `post bookmark add`       | same                                                                    | `{bookmarked:true,…}`                                                   |
| `post bookmark remove`    | same                                                                    | `{bookmarked:false,…}`                                                  |
| `page bookmarks open`     | `--tab`                                                                 | `{navigated:true,url,count}`                                            |
| `page bookmarks scrape`   | `--limit`, `--max-idle`, `--tab`                                        | `{source,scraped,new,updated,events}`                                   |
| `page list open`          | `--name <slug>`                                                         | `{navigated:true,slug,url}`                                             |
| `page list member add`    | `--name`, `--handle`, `--apply`                                         | `{added:true,handle,list}`                                              |
| `store scrape`            | `--source bookmark\|like\|history`, `--limit`, `--max-idle`, `--tab`    | `{source,scraped,new,updated,events}`                                   |
| `store publish`           | `--id` \| `--source` \| `--since` \| `--all`                            | `{published,unchanged,hidden}`                                          |
| `store hide`              | `--id`                                                                  | `{hidden:true,id,removed,unchanged}`                                    |
| `store status`            | -                                                                       | `{shadow:{…},public:{…}}`                                               |
| `store push`              | `--source bookmark\|like\|history`, `--limit`, `--dry-run`, `--url`     | `{pushed,skipped,failed,source,url}`                                    |
| `vote nominate`           | `--id` \| `--url`, `--list` (repeatable), `--title`, `--note`           | `{nominated,id,status,lists,unchanged}`                                 |
| `vote queue`              | `--limit`                                                               | `{count,shown,totals,entries:[…]}`                                      |
| `vote sync`               | -                                                                       | `{transport,synced,changed,unchanged,at}`                               |
| `vote approve`            | `--id`, `--rank`                                                        | `{approved,id,rank,votes,approvedAt,unchanged}`                         |
| `vote reject`             | `--id`, `--reason`                                                      | `{rejected,id,status,unchanged}`                                        |
| `vote rank`               | `--id`, `--rank`                                                        | `{ranked,id,rank,was,unchanged}`                                        |
| `author evidence build`   | -                                                                       | `{archive,posts,authors:[…],skipped}`                                   |
| `author classify rules`   | -                                                                       | `{rules,threshold,lists,counts,decisions,ambiguous,preserved}`          |
| `author classify infer`   | `--limit`, `--dry-run`                                                  | `{counts,batches,asked,decisions,unanswered,rejected,failed,preserved}` |
| `author distribute apply` | `--apply`, `--dry-run`                                                  | `{counts,plan,written,added,failed,remaining,stopped}`                  |
| `event append`            | `--kind`, `--subject`, `--payload`                                      | `{written:true,path}`                                                   |
| `event tail`              | `--follow`, `--dir shadow\|public`, `--since`, `--interval`             | `{directory,count,events}` or JSON lines                                |

`--tab` takes a target id from `tab list` or its zero-based index in that list. A tab a browser
extension currently holds a debugger on is never selected: `tab list` reports it as a candidate, and
matching skips to the next one.

`--dry-run` prints `{dryRun:true,action,post:{id,url},was}` - the resolved post, no click. A
mutating command reads the control's state first, so a second run reports `was:true` instead of
toggling back.

`page list member add` inverts that default on purpose: it writes nothing unless `--apply` is
passed, because it is the command a distribution pass calls in a loop. A dry run reads the handle's
"Pick a List" dialog and prints `{dryRun:true,action,handle,list,member,wouldAdd}`; `--apply` prints
`{added:true,…}` or, when the handle is already on the list, `{added:false,alreadyMember:true,…}`
without pressing Save. A limit is reported as `{error:"rate-limited"}`, so a caller looping over
handles stops instead of retrying. A profile whose header has no "Add/remove from Lists" control -
the account's own profile is the common case - is `no-list-menu`; a dialog that opens with no rows
is `no-list-surface`. The two are reported apart because they send a caller looking in different
places.

A command that waits for a page to be ready gets one answer when it never is: `page-not-ready` with
`{expression,timeout,url}`. `page bookmarks open`, `page list open` and `page list member add` stop
there, because a count or a membership write against a page that never arrived would describe
something that is not on screen. Scraping is the exception: `page bookmarks scrape` and
`store scrape` warn on stderr and read what did render, and end as `no-post` only when nothing did.

## Ingest: three sources, two stores

A saved post and a post that is safe to show the world are different facts, so ingest writes to an
archive and publishing is a separate, explicit step.

| Source     | Route             | What it is                                                          |
| ---------- | ----------------- | ------------------------------------------------------------------- |
| `bookmark` | `/i/bookmarks`    | posts saved explicitly                                              |
| `like`     | `/<handle>/likes` | posts liked, including old likes not saved                          |
| `history`  | `/i/history`      | the container page: walked tab by tab, **Bookmarks** then **Likes** |

`/i/bookmarks` redirects to `/i/history`, which presents `Bookmarks` and `Likes` as tabs; `history`
follows those tabs, so it is the union of the other two. Navigation is confirmed by the page's own
load event, not by the URL, because the redirect would never match the requested prefix.

A post observed twice is one record with two observations. Identity is the status id;
`observations[]` carries one entry per source that showed it, and `firstSeenAt` is the first scrape
that saw it. The interface never exposes when a post was saved, so nothing in this pipeline may
claim `bookmarkedAt` - `firstSeenAt` is a lower bound and is described as one.

Scraping writes **only** to `Maintain/Storage/Shadow/` (gitignored). The whole `Maintain/Storage/`
tree is ignored, so the code that reads and writes it lives next door in `Maintain/Source/Store/` -
a file dropped under `Storage/` would never be committed.

```
Post/<statusId>.json                       one record per post, merged across sources
Observation.jsonl                          append-only {at,source,statusId,action}
Index.json                                 statusId -> file
Event/<ISO>-<kind>-<slug>-<digest8>.json   scrape + publish + hide events
```

The slug is the readable half of an event name and the digest is the identifying half: eight hex
characters of the subject's SHA-256, because `a/b` and `a?b` both flatten to `a-b` and would
otherwise name one file. Files written before the digest existed (`<ISO>-<kind>-<slug>.json`) are
still read.

`store publish` and `store hide` are the only commands that write to `Source/Content/`, and both are
idempotent: publishing a published post rewrites the same bytes, hiding a hidden post changes
nothing. `hidden` is a tombstone checked before every publish, so a later re-scrape cannot resurrect
a withheld post.

`store status` answers the three questions worth asking before a publish: how much is archived, how
much is out, and which channel each post came from.

## Projection: the archive into SpacetimeDB

`store push` copies the archive into the local SpacetimeDB database, so an observation is queryable
the moment it is scraped. The JSON files stay the source of truth: this is a projection, never a
move, and nothing under `Maintain/Storage/` changes.

```bash
pnpm maintain store push --source bookmark --limit 200
# {"pushed":200,"skipped":0,"failed":0,"source":"bookmark","url":"http://127.0.0.1:3010"}
```

Every post becomes one `observe` call carrying its current metrics, at most four in flight. The
reducer keys the observation on `<postId>:<source>:<at>`, so `at` is the record's `lastScrapedAt`
and never the wall clock - a clock here would append a row per run and make `pushed` a synonym for
`duplicated`. That is what makes a second run a repair: `pushed` counts the calls that ran,
`select count(*) from observation` does not move.

- `--source` narrows to the posts that channel showed. The channel a post is pushed as is its
  _earliest_ observation, so one post selected by two `--source` values lands on two rows naming two
  channels - and the same row whichever of the two selected it.
- `skipped` counts a record the projection cannot represent (no permalink, no author handle). It
  never counts a post the flags excluded.
- `--dry-run` counts what would be pushed and contacts nothing: it does not read the token, so it
  answers with the server down.
- A partial run is still a failure: `pushed` and `failed` say how far it got and the first
  rejection's server words ride along in `body`.

Every row lands as `visibility:"shadow"`, because the reducer takes no visibility argument - this
command has no way to make a post public, and `store publish` remains the only step that does.

The server's address and database name come from the identifier map (`spacetime: {url, database}`);
`--url` overrides the address only. The token is read from `~/.config/spacetime/cli.toml`, never
from a flag, and is never printed. A server that is not answering is `spacetime-unreachable`, a
rejected token `spacetime-auth`, and a refused call `spacetime-reducer` - each one object, exit 2.

## Voting: a public ranking, a private gate

`vote *` fills the site's Voted index and writes the Curated index the homepage leads with. A
visitor's vote ranks a candidate and publishes nothing; approval is `pnpm maintain vote approve`,
run by the owner. Rejection is a tombstone that stays on disk, so a later scrape, nomination or vote
cannot resurrect it.

Ranks are positions, not scores: every write renumbers the Curated index to 1..N with no gaps and no
duplicates, and `--rank` beyond the end means "last". `vote sync` is the only command that touches a
network, and it fails `no-transport` - changing nothing on disk - when no project is configured. The
setup, the security rules and the anti-abuse caveat are in `Reference/Voting.md`.

## Events

`scrape.started` and `scrape.finished` frame a run (`subject` is the source, the payload carries the
counts). `bookmark.added` is written once per post that is new to the archive - `payload.source`
says which channel showed it first, so a like-discovered post is not misreported as a bookmark.
`bookmark.published` and `bookmark.hidden` record what left the shadow store.

`event tail` reads the directory rather than a socket: the directory is the broker, so nothing needs
a daemon. Without `--follow` it is one object; with it the command never returns and prints one
compact JSON line per event.

## Distribution: evidence without a model

`author evidence build` folds the archive into one compact record per author - the only input the
distribution stage ever hands a model, and the reason that stage can be priced before it is run:

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

The command reads the shadow store and nothing else, so it makes no network call: two runs on an
unchanged archive print the same bytes. Nothing in the record is a timestamp, a metric or a path, so
a re-scrape that only moves counters cannot churn it.

- `domains` ranks at most five hosts, most-linked first, counting one host once per post.
  Redirectors (`t.co`, `is.gd`, ...) are dropped: a shortener hides where a link goes, so ranking it
  would say nothing about the author.
- `keywords` counts occurrences per bucket on word boundaries - `ai` never counts inside `said`. The
  vocabulary lives in `Maintain/Source/Configuration/Keyword/Keyword.ts`; weights and thresholds
  belong to the classifier, not here.
- `excerpts` holds up to three posts, shortest prose first, each at most 200 characters and cut with
  `…` rather than past the cap. An author with one post has one excerpt; a post with no text has
  none.

Three kinds of post are left out and counted in `skipped` instead of vanishing: `hidden` (a
tombstone - text withheld from the site is not sent to a model either), posts no bookmark observed,
and posts with no handle.

## Distribution: the rules decide first

`author classify rules` scores every author's evidence against the tracked weights in
`Maintain/Configuration/Rules/Rules.json` and places only the ones those weights can explain:

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

The identifier map decides which slugs exist; the rules file only says how to weigh them. A weight
for a slug the map does not declare is dropped with a warning, so a map of `reading` and `recipes`
never receives a decision naming `CODE`. With no map - or a map that declares no lists - there is
nothing to narrow to, so the rules file's own keys are the list vocabulary and the command says so
on stderr. `lists` in the output is the set actually in force.

A placement needs both halves of the threshold. `score` is the best list's total; `gap` is that
list's lead over the runner-up. `threshold.score` and `threshold.gap` are read from the rules file,
never from the TypeScript - a cut-off living in code is a cut-off nobody can tune. Both are
required: a file without a threshold is a `schema-invalid` failure, not a default.

Everything that clears neither is reported in `ambiguous` with `list: null` and the same arithmetic
in `reason`, so the model pass has exactly the work the rules could not do. An author no weighted
term or host matched scores `0` and says so.

- A keyword weight applies to the evidence bucket of the same name, so a list whose slug has no
  vocabulary scores on domains only. The loader says so on stderr rather than leaving the weight
  silently inert.
- A domain key covers its subdomains - `figma.com` matches `blog.figma.com` - and never a host that
  merely ends the same way, so `notfigma.com` scores nothing for `figma.com`.
- A bad weight (a string, a negative number) is dropped with a warning naming the key: one typo in a
  long weights list must not stop a run.

A decision already marked `decision.by: "manual"` is never scored and never rewritten. It is
reported in `preserved` with the reason on file, including when its author no longer appears in the
archive. `rule` and `model` answers are previous guesses, so this pass may supersede them.

The command reads the shadow archive and the Author collection and writes neither, so a dry run
stays dry and two runs print the same bytes.

## Distribution: the model breaks the tie

`author classify infer` is the second half of the same pass: it takes exactly the authors the rules
left in `ambiguous` and asks a model about them, then caches every answer. It is the only command in
this tool that spends money, so it is built to spend as little as possible.

```bash
export MAINTAIN_MODEL_URL=http://127.0.0.1:8642/v1/chat/completions
export MAINTAIN_MODEL_KEY=<token>          # when the endpoint wants one
export MAINTAIN_MODEL=<model-id>           # when the endpoint wants one
pnpm maintain author classify infer
# {"counts":{"authors":175,"ambiguous":159,"asked":159,"cached":0,"manual":1,
#  "placed":53,"declined":106,"unanswered":0,"rejected":0,"failed":0,"deferred":0},
#  "batches":7,"asked":["<handle>",…],"decisions":[…],"preserved":[…]}
```

Four things bound the spend, in order of how much they save:

- **A cached answer is never asked for twice.** Every decision is written to
  `Source/Content/Author/<handle>.json` with `decision.by: "model"`, so a second run over an
  unchanged archive makes no request at all and prints `"asked": 0`. Nothing is cached for a reply
  that could not be trusted, which is what makes a re-run ask again instead of inheriting a guess.
- **A manual decision is not a question.** `decision.by: "manual"` is never asked about, never
  scored and never written over - it is reported in `preserved` with the reason on file, even when
  the model volunteers an answer for that handle in the same batch.
- **At most 25 authors per request.** One reply has to be read whole, so the cap is what keeps a
  large ambiguity from becoming one answer a model truncates halfway through. It is not an option: a
  caller that could raise it could also make a batch unanswerable.
- **A failed batch costs one batch.** A reply that is not JSON, an endpoint that refuses, or a batch
  that times out is reported in `failed` with its handles, and the next batch still runs. Every
  batch failing is a `model-error` failure instead of a report, so `"asked": 0` can never be
  mistaken for a cache hit.

`--limit <n>` prices a partial run: it asks about at most `n` authors and reports the rest in
`counts.deferred`. `--dry-run` asks about nothing and prints the handles a real run would have asked
about, with the batch count.

The request is per author, over the aggregated evidence record - top domains, keyword hits per
bucket, up to three capped excerpts - and never per post. A mixed timeline is normal, so the
question is about the account's body of work; a prompt that listed every post would spend the
batch's budget on one prolific account and invite an answer about a post instead of about the
account.

The reply must be JSON only, in the same shape the rules classifier emits:

```json
{
	"decisions": [
		{
			"handle": "<handle>",
			"list": "<slug>",
			"score": 6,
			"gap": 3,
			"reason": "one line"
		}
	]
}
```

- `list` must be a slug the identifier map declares - the rules file's own keys when no map is set -
  or `null` for "none of them". A slug nobody configured is rejected rather than cached: it is a
  decision nothing could ever apply. A decline is a decision like any other: it is cached too, so
  the same account is not asked about on every run, and it leaves the record's `lists` alone.
- `score` and `gap` are the model's own numbers and are optional; they are recorded, never checked
  against the rules' arithmetic - the rules already refused to decide, so there is nothing here to
  verify them against.
- `reason` is required and is flattened to one line. A decision nobody can explain is a decision
  nobody can review.
- An entry naming an unknown handle, a slug that is not configured, or no reason is **rejected**: it
  is reported in `rejected` with the reason, it is not cached, and the rest of the reply still
  counts. A malformed entry therefore cannot become a permanent one.

A record written here carries every field the site's Author schema requires - `firstSeenAt` and
`postCount` from the record already on file, so a classification never restamps an author's history,
and `confidence` from the model's own score.

## Distribution: applying the decisions

`author distribute apply` is the last stage: it turns the decisions into the site's author records,
and then - only with `--apply` - into list memberships on X. Without the flag it prints the plan and
changes nothing at all, so the safe thing for a gated launch to do by accident is nothing.

```bash
pnpm maintain author distribute apply
# {"dryRun":true,"apply":false,"lists":["<slug>",…],"spacing":3000,
#  "counts":{"authors":175,"handles":16,"memberships":16,"manual":1,"declined":0,
#  "unresolved":159,"skipped":1,"records":0,"added":0,"already":0,"failed":0,
#  "remaining":16},
#  "plan":[{"handle":"<handle>","list":"<slug>","by":"rule","reason":"…"}],
#  "preserved":[…],"declined":[],"unresolved":[…],"skipped":[…],"stopped":null}
```

The three sources keep the precedence the earlier passes set, and this command re-decides none of
it:

| Source   | Where it lives                        | This stage               |
| -------- | ------------------------------------- | ------------------------ |
| `rule`   | in memory, from the weighted rules    | writes the record        |
| `model`  | `Source/Content/Author/<handle>.json` | reads it, writes nothing |
| `manual` | the same file, `decision.by:"manual"` | never writes it          |

- A **rule** decision exists only in memory - `author classify rules` writes nothing - so its record
  is created here, before any membership.
- A **model** decision was cached by `author classify infer`. The record's `lists` is the filing it
  decided, and an empty `lists` is a decline: reported in `declined`, and nothing is added.
- A **manual** decision is the person's own answer. The record is never written again, and the
  filing is distributed like any other - a decision this stage declined to carry out would be one
  the person has to re-enter by hand.
- An author the rules left ambiguous with no decision on file is `unresolved`:
  `author classify infer` has not run for them, and this stage does not guess.
- A list the identifier map does not declare is `skipped`. A membership is named by the map's slug,
  and a row the dialog cannot offer is not a decision.

`--apply` needs the identifier map, because the map is what names a list; a dry run needs only the
rules file. It writes every decision record first and then adds one membership at a time through the
same primitive `page list member add` uses, waiting three seconds between writes (`"spacing": 3000`,
a floor on top of the profile load in front of every add). The order is the safety story: a record
is the durable statement of what this run decided, so a run that stops halfway leaves a plan on disk
that the next run reads instead of re-deriving, and every membership that exists is one a record
explains.

A rate limit stops the run on the first answer, and is never retried - a retry loop against a limit
is what makes it longer. The report says how far it got:

```json
{
	"counts": { "memberships": 52, "added": 11, "remaining": 41 },
	"stopped": {
		"reason": "rate-limited",
		"handle": "<handle>",
		"list": "<slug>",
		"error": "rate-limited",
		"detail": "You are over the daily limit for adding people to Lists.",
		"attempted": 12
	},
	"remaining": [{ "handle": "<handle>", "list": "<slug>", "by": "rule" }]
}
```

The same error three times in a row stops the run as well (`"reason": "repeated-failure"`): a
control that moved or a list X renamed repeats for every handle, and continuing would spend one
profile load per author proving the same point. A single failure is recorded in `failed` and the
next handle runs, because one unreachable profile must not end a distribution. Both stops still exit
0 - the summary is the deliverable - with one line on stderr naming where the run stopped.

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

Known codes: `no-config`, `config-exists`, `unknown-list`, `no-list-menu`, `no-list-surface`,
`no-tab`, `no-post`, `page-not-ready`, `rate-limited`, `schema-invalid`, `no-rules`, `no-model`,
`model-error`, `model-reply`, `cdp-unreachable`, `cdp-error`, `spacetime-unreachable`,
`spacetime-auth`, `spacetime-reducer`, `no-transport`, `read-only-transport`,
`unsupported-transport`, `vote-unreachable`, `no-entry`, `not-curated`, `already-curated`,
`tombstone`, `io-error`, `usage`, `internal`. A code is a contract; the `detail` string is not.
`--help` and `--schema` are rendered from the same table the parser matches against, so a command
cannot drift from its own documentation.

## Tests

The parser, the target selector and both stores run without a browser:

```bash
pnpm --filter timeline-maintain test
# node --test "Maintain/Target/Test/*.test.js", after `pnpm run Build`
```

`check` is the gate, and it runs the same suite with no build behind it: `node Script/Test.ts` reads
the `Configuration/Content.ts` the build reads and hands those values to the test process, so every
file under `Maintain/Source/Test` runs on a fresh clone. The command above stays the post-build run,
which is what proves the bundle behaves the same.

```bash
pnpm --filter timeline-maintain run check
# tsc --noEmit -p tsconfig.json && node Script/Test.ts
```

Everything else is verified against the live endpoint - the claim-to-test table in
`Documentation/Plan/Bookmark-Pipeline.md` is the checklist.

## Why one file per command

A command's path states its domain - `Command/Post/Bookmark/Add.ts`. When the site renames a
control, exactly one file changes, and the diff names the domain. Shared behaviour lives in
`Browser/`, `Store/` and `CLI/`; commands stay thin.

# Storage Model - shadow store and public projection

Two stores, one direction of flow. Scraped data lands in the shadow store and
stays there until something is explicitly published.

## Why

A saved post and a post that is safe to show the world are different facts. The
archive should hold everything, the website should hold only what was chosen.
Making "private" the default means an accidental build cannot leak a like, and
"hide this one" is a state, not a deletion.

## Layout

```
Maintain/Storage/Shadow/            # gitignored, never built
  Post/<statusId>.json              # one record per post, merged across sources
  Observation.jsonl                 # append-only: {at, source, statusId, action}
  Index.json                        # statusId -> file, for cheap lookups
  Event/<ISO>-<kind>-<subject>.json # scrape + publish + hide events
Source/Content/                     # tracked, rendered by Astro
  Bookmark/<statusId>.json          # published posts only
  Event/<ISO>-<kind>-<subject>.json # published events only
```

`Post/<statusId>.json`:

```json
{
	"id": "…",
	"url": "https://…/status/…",
	"author": { "handle": "…", "name": "…", "verified": false },
	"text": "…",
	"postedAt": "…",
	"media": [{ "kind": "image", "url": "…" }],
	"metrics": { "replies": 0, "reposts": 0, "likes": 0, "views": 0 },
	"observations": [
		{ "source": "bookmark", "at": "…" },
		{ "source": "like", "at": "…" }
	],
	"firstSeenAt": "…",
	"lastScrapedAt": "…",
	"visibility": "shadow",
	"lists": []
}
```

`visibility` is the only field that decides whether anything leaves the shadow
store.

| Value    | Meaning                                                   |
| -------- | --------------------------------------------------------- |
| `shadow` | default - archived, never published                       |
| `public` | published; a file exists in `Source/Content/Bookmark/`    |
| `hidden` | explicitly withheld; survives re-scrapes, never published |

## Commands

| Command                                                        | Effect                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| `store scrape --source bookmark\|like\|history`                | write observations and posts to shadow only              |
| `store publish --id <id>` / `--source like` / `--since <date>` | copy to the public collection, set `visibility:"public"` |
| `store hide --id <id>`                                         | delete any public file, set `visibility:"hidden"`        |
| `store status`                                                 | counts per store, per visibility, per source             |

`store publish` and `store hide` are the only commands that write to
`Source/Content/`. Both are idempotent: publishing a published post rewrites the
same bytes, hiding a hidden post is a no-op.

## Invariants

- A post's identity is its status id. Two sources observing it produce one
  record with two observations.
- Shadow writes are append-only for observations and merge-only for posts.
- Nothing in the shadow store is ever imported by the site build - the site's
  content config globs `Source/Content/` only.
- `Maintain/Storage/` is ignored by git; a leaked shadow path in a tracked file
  is a bug.
- **Paths are repository-relative.** Every path a tool records - in a content
  file, an event payload, an index, a log line - is written as
  `Source/Content/Bookmark/<id>.json`, never as `file:///…` and never as an
  absolute path. The repository is public, so an absolute path publishes the
  machine's directory layout and account name. Astro's own cache (`.astro/`)
  writes `file://` URLs, which is exactly why it is gitignored and never
  committed.
- Hiding beats scraping: `hidden` is checked before any publish, so a later
  re-scrape cannot republish something withheld.

## Claim → test

| Claim                     | Test                                                                     |
| ------------------------- | ------------------------------------------------------------------------ |
| Shadow store is untracked | `git check-ignore -v Maintain/Storage/Shadow/Post/x.json`                |
| Scrape does not publish   | after `store scrape`, `Source/Content/Bookmark/` is unchanged            |
| Publish is explicit       | `store status` shows `shadow: n, public: 0` until `store publish` runs   |
| Hide is durable           | `store hide --id X`, re-scrape, `store status` still reports X as hidden |

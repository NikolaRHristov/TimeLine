# URL map and site shell

Sibling repositories are referred to as **Site A** … **Site D**. Their real locations are private
and stay out of this repository: the label → path map lives in
`Maintain/Configuration/Local/References.json`, which is gitignored. A public document never names a
private origin.

## What the siblings have

| Site  | Redirect machinery                                                                                                               | Headers                                                                                                                                                                                                  | Service worker                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **A** | route map module (canonical set + semantic aliases) → a generator script writing `Public/_redirects` **and** `Target/_redirects` | -                                                                                                                                                                                                        | -                                                                        |
| **B** | none                                                                                                                             | `Public/_headers` - `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` | `astrojs-service-worker` 2.0.3                                           |
| **C** | none                                                                                                                             | -                                                                                                                                                                                                        | `astrojs-service-worker` 2.0.3, wired conditionally in `astro.config.ts` |
| **D** | none                                                                                                                             | -                                                                                                                                                                                                        | -                                                                        |

## What this site does

The pattern taken from Site A: one source of truth, one generator, two emitted copies.

| Piece          | Where                                                        | What it does                                                                                                              |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Route map      | `Source/Function/Route/Map.ts`                               | `CanonicalPath` (the PascalCase set), `SemanticAlias` (lowercase synonyms), and the derived lookups built from both       |
| Link registry  | `Source/Library/Link.ts`                                     | `Route`, `BookmarkHref`, `ListHref`, `Primary`, `Sitemap` - every internal URL a page prints                              |
| Generator      | `Maintain/Script/GenerateRedirects.ts`                       | writes `Public/_redirects` and `Target/_redirects` in host syntax                                                         |
| Dev redirects  | `Source/Function/Route/Integration.ts`                       | answers the same aliases with `301` on `astro dev`, so they are testable before a deploy                                  |
| Headers        | `Public/_headers`                                            | the four security headers, plus an immutable cache rule for `_astro/*`                                                    |
| Service worker | `astro.config.ts` + `Source/Layout/Base.astro`               | `astrojs-service-worker` generates the worker on build; the shell registers it at scope `/` behind `import.meta.env.PROD` |
| Shell          | `Source/Layout/Base.astro`, `Source/Stylesheet/Layout/*.css` | skip link, sticky header with brand and primary navigation, content column, footer with sitemap                           |
| Components     | `Source/Stylesheet/Component/*.css`                          | `Note` (empty state), `Roster` (one row per entry), `Pill` (a list slug as a link)                                        |

## The canonical routes

| Route            | Page file                             |
| ---------------- | ------------------------------------- |
| `/`              | `Source/pages/index.astro`            |
| `/Bookmark`      | `Source/pages/Bookmark/index.astro`   |
| `/Bookmark/<id>` | `Source/pages/Bookmark/[...Id].astro` |
| `/List`          | `Source/pages/List/index.astro`       |
| `/List/<slug>`   | `Source/pages/List/[Slug].astro`      |
| `/Voted`         | `Source/pages/Voted/index.astro`      |
| `/Activity`      | `Source/pages/Activity/index.astro`   |

## Regenerating the redirects

```sh
node Maintain/Script/GenerateRedirects.ts
```

Node strips the types on the way in, so the file runs with no build step and no flags. It imports
`Source/Function/Route/Map.ts` by its real `.ts` path, which is why the map has no imports of its
own: bare Node evaluates it exactly as written, and Vite bundles the same text for the page build.

The output is byte-identical for identical input - rules are sorted by code unit rather than by
locale, and the column widths are computed from the widest value rather than fixed. That is what
makes "delete the file and re-run" a check instead of a diff.

Never edit `Public/_redirects` by hand. The next run overwrites it.

## Invariants

- Every public URL is PascalCase; a lowercase or semantic alias exists only as a redirect, never as
  a second page.
- Redirects are generated, never hand-written - a hand-edited `_redirects` is a bug because the next
  generation overwrites it.
- Aliases point at canonical paths, never at other aliases: no chains. `Verify()` in the route map
  refuses a map that would emit one.
- The service worker must never cache the redirect map or content JSON beyond one version; a stale
  cache that keeps serving a retired path is worse than no cache. The precache glob lists extensions
  only, and `_redirects`, `_headers` and `**/*.json` are ignored explicitly.
- The service worker's cache name is derived from the route map, so adding or retiring a path
  produces a different cache and `cleanupOutdatedCaches` deletes the previous one on activate.
- No absolute machine paths and no private origin names anywhere in the emitted files or in this
  documentation (see `Storage-Model.md`). "Private" is measured by `scripts/audit-leaks.sh`, which
  subtracts the public namespaces listed in `Maintain/Configuration/Local/Origin.public.txt` - the
  build toolchain's npm scope and the maintainer contact - from the origin wordlist before grepping.
  Those names are public by construction, so subtracting them keeps the sweep mechanical over every
  tracked file instead of narrowing it to a few paths; the reason is recorded in
  `Documentation/README.md`.

## Claim → test

| Claim                   | Test                                                                                                | Result                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Redirects are generated | delete `Public/_redirects` and `Target/_redirects`, run the generator, compare hashes               | pass - both files return byte-identical (`ff910a69…`)                                  |
| Aliases are 301s        | `curl -sI http://localhost:9999/bookmarks` → `301` + `Location: /Bookmark`                          | pass                                                                                   |
| Canonical is served     | `curl -s -o /dev/null -w '%{http_code}' http://localhost:9999/Bookmark` → `200`                     | pass                                                                                   |
| Prefix aliases resolve  | `curl -sI http://localhost:9999/bookmark/example-post` → `301` + `Location: /Bookmark/example-post` | pass                                                                                   |
| Canonical is PascalCase | `grep -E '^/[a-z]' Public/_redirects` matches alias sources only                                    | pass - 42 of 42 rule sources are lowercase; no canonical path appears as a rule source |
| Headers are present     | `Public/_headers` lists the four security headers and the `_astro/*` immutable rule                 | pass                                                                                   |
| SW is production-only   | `astro build` emits `Target/service-worker.js` and a registration script; `astro dev` emits neither | pass                                                                                   |
| SW precache is scoped   | the emitted precache manifest contains no `_redirects`, `_headers` or `*.json`                      | pass - 16 entries: 7 pages, 8 assets, `robots.txt`                                     |
| No private origin named | `scripts/audit-leaks.sh .` → `== private origins` `PASS none`, exit 0                               | pass                                                                                   |

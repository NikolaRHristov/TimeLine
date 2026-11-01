# URL map and site shell - what the sibling sites do

Sibling repositories are referred to as **Site A** … **Site D**. Their real
locations are private and stay out of this repository: the label → path map
lives in `Maintain/Configuration/Local/References.json`, which is gitignored. A
public document never names a private origin.

## What is actually there

| Site | Redirect machinery | Headers | Service worker |
|---|---|---|---|
| **A** | route map module (canonical set + semantic aliases) → a generator script writing `Public/_redirects` **and** `Target/_redirects` | - | - |
| **B** | none | `Public/_headers` - `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` | `astrojs-service-worker` 2.0.3 |
| **C** | none | - | `astrojs-service-worker` 2.0.3, wired conditionally in `astro.config.ts` |
| **D** | none | - | - |

This repository already depends on `astrojs-service-worker` 2.0.3 and already
wires it in `astro.config.ts` for production builds - so the service worker is
present but unconfigured, not missing.

## The pattern worth taking from Site A

One source of truth, one generator, two emitted copies:

1. **Canonical paths are PascalCase** and live in one set
   (`/Download`, `/Doc`, `/Blog`, `/Account/SignIn`, `/Legal/Privacy` …).
2. **Aliases are lowercase and semantic** (`/downloads`, `/get`, `/install` →
   `/Download`; `/login`, `/auth` → `/Account/SignIn`; `/gdpr`,
   `/privacy-policy` → `/Legal/Privacy`).
3. **A script generates `_redirects`** for the host into both `Public/`
   (served) and `Target/` (built output), so a static host honours them without
   runtime code.
4. The route map is imported by pages, so a link and its redirect cannot
   disagree.

## The shape to adopt here

| Piece | Take from | Applied to this site |
|---|---|---|
| Route map | Site A | `/Bookmark`, `/Bookmark/<id>`, `/Activity`, `/List/<Slug>` - PascalCase; aliases `/bookmarks`, `/saved`, `/activity`, `/lists/ai` |
| Generator | Site A | `Maintain/Script/GenerateRedirects.ts`, writing `Public/_redirects` + `Target/_redirects` |
| Headers | Site B | same four headers, plus a cache policy for `_astro/*` |
| Service worker | Sites B and C, `astrojs-service-worker` | already wired - add precache scope + version bump on build |
| Shell and formatting | Site C | `Source/Layout/Base.astro` shell, `Source/Stylesheet/{Layout,Component}/` split, `prettier.config.mjs` |

## Invariants

- Every public URL is PascalCase; a lowercase or semantic alias exists only as a
  redirect, never as a second page.
- Redirects are generated, never hand-written - a hand-edited `_redirects` is a
  bug because the next generation overwrites it.
- Aliases point at canonical paths, never at other aliases: no chains.
- The service worker must never cache the redirect map or content JSON beyond
  one version; a stale cache that keeps serving a retired path is worse than no
  cache.
- No absolute machine paths and no private origin names anywhere in the emitted
  files or in this documentation (see `Storage-Model.md`).

## Claim → test

| Claim | Test |
|---|---|
| Redirects are generated | delete `Public/_redirects`, run the generator, file returns byte-identical |
| Aliases are 301s | `curl -sI http://localhost:9999/bookmarks` → `301` + `Location: /Bookmark` |
| Canonical is PascalCase | `grep -E '^/[a-z]' Public/_redirects` matches only alias sources |
| Headers are served | `Public/_headers` exists and lists the four security headers |
| SW is production-only | `Target/` build contains a registered worker; dev server does not |
| No private origin named | `grep -rniF -f Maintain/Configuration/Local/Origin.txt Documentation/` returns nothing |

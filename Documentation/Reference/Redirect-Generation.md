# Redirect generation - what to borrow from Site A

Reference notes for `Maintain/Script/GenerateRedirects.ts`. Site A is the sibling site whose route
integration does the most work; its labels resolve through
`Maintain/Configuration/Local/References.json`, which is gitignored.

## The shape worth copying

Site A does not generate redirects from a standalone script alone. It ships one Astro integration
(`Source/Function/Route/Integration`) that owns five jobs, and that grouping is the part worth
borrowing:

1. **Route redirect** - variant URLs (lowercase, semantic aliases) redirect to the PascalCase
   canonical.
2. **Network-first page cache** - HTML is fetched, then cached, so an offline visit still renders.
3. **Cache-first asset cache** - `_astro/*`, `Asset/*`, `Favicon/*` are served from cache first;
   they are content-addressed and never change under the same name.
4. **`_redirects` generation** - written into both the served directory and the build output, so the
   host honours it without runtime code.
5. **Sitemap canonicalization** - lowercase URLs in the sitemap are rewritten to the canonical
   spelling.

## The ordering constraint that bites

The integration **must run after `@astrojs/sitemap`**. Its sitemap post-processor rewrites the URLs
that sitemap just emitted; registered before the sitemap, it rewrites nothing and the sitemap
silently keeps the variant URLs.

## The build-hook trick

`GenerateRouteMap` runs in `astro:build:done`, which fires _after_ Vite closes. Anything it needs
from the filesystem must be imported at module evaluation time, before the hook:

```ts
// Pre-import at module evaluation time (while Vite module runner is alive).
// GenerateRouteMap runs in astro:build:done AFTER Vite closes.
const { readdir: ReadDirectory } = await import("node:fs/promises");
const { join: Join, relative: Relative } = await import("node:path");
```

A plain `import { readdir } from "node:fs/promises"` inside the hook body is the failure mode: the
hook runs in a dead module graph.

## The canonical set

`CanonicalPath` is a `Set<string>` of PascalCase paths, and page files are named in PascalCase so
Astro builds those paths directly. Everything else - variants, aliases, redirects, sitemap
rewrites - is _derived_ from that set rather than maintained beside it. One source of truth, four
consumers.

## What to take here, and what to skip

| Feature                                | Take it? | Why                                                  |
| -------------------------------------- | -------- | ---------------------------------------------------- |
| Canonical set + derived aliases        | yes      | one list, no drift between page, link and redirect   |
| `_redirects` into served + built dirs  | yes      | works on any static host, including Cloudflare Pages |
| Sitemap canonicalization               | yes      | otherwise the sitemap advertises the variant URLs    |
| Ordering after the sitemap integration | yes      | it is the whole point of the rewrite step            |
| `build:done` with pre-imported fs      | yes      | the hook fires after Vite closes                     |
| Network-first page cache               | optional | duplicates what the service worker already does here |
| Cache-first asset cache                | optional | same; the service worker owns caching in this repo   |
| Mermaid/Tailwind vendor sync scripts   | no       | this site has neither dependency                     |

## Invariants for the port

- Redirects are generated, never hand-written - a hand-edited `_redirects` is overwritten by the
  next build.
- An alias points at a canonical path, never at another alias: no chains.
- The canonical set is the only list; a page without an entry is a bug, and a link built from a
  string literal instead of the set is the same bug.
- Both copies are written from one buffer, so the served file and the built file cannot disagree.

## Claim → test

| Claim                   | Test                                                              |
| ----------------------- | ----------------------------------------------------------------- |
| Generator is idempotent | delete both `_redirects`, regenerate, `diff` the pair             |
| Ordering is right       | a variant URL appears canonicalized in `sitemap-index.xml`        |
| Aliases resolve         | `curl -sI <host>/<alias>` → `301` with the canonical `Location`   |
| No chains               | every `Location` in `_redirects` is also a key in `CanonicalPath` |

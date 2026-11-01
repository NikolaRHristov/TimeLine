# Build - workspace, turbo, and `@playform/build`

The repository holds two things that build differently: a static Astro site that
Cloudflare Pages builds, and a local-only tool layer that must never run in CI.

## Layout

```
pnpm-workspace.yaml        # packages: "." and "Maintain"
turbo.json                 # build / check / run pipelines
package.json               # root: the site (Astro) + workspace scripts
Maintain/
  Source/**/*.ts           # tool layer sources
  Target/**/*.js           # compiled output (gitignored)
  Configuration/ESBuild.ts # esbuild options for @playform/build
```

`@playform/build` is already a dependency (`0.3.4`). It is driven the same way
the sibling packages drive it:

```json
{
	"scripts": {
		"Build": "Build 'Maintain/Source/**/*.ts' --ESBuild Maintain/Configuration/ESBuild.ts",
		"Watch": "Build 'Maintain/Source/**/*.ts' --Watch --ESBuild Maintain/Configuration/ESBuild.ts"
	}
}
```

`Maintain/Configuration/ESBuild.ts` mirrors the reference configuration:
`format: "esm"`, `platform: "node"`, `target: "esnext"`,
`outdir: "Maintain/Target"`, `tsconfig: "tsconfig.json"`, `minify`, `metafile`,
and an `onStart` plugin that removes the output directory so a rename never
leaves a stale file behind.

## Two pipelines that must not mix

| Pipeline                    | Runs where                    | May it scrape?                             |
| --------------------------- | ----------------------------- | ------------------------------------------ |
| `turbo run build` → site    | Cloudflare Pages, and locally | **No.** Build reads `Source/Content/` only |
| `turbo run tool` → Maintain | the person's machine only     | yes - that is the point                    |

The rule is structural, not a promise: the site's build graph has no edge to
`Maintain/`, and `Maintain/` is a separate workspace package with its own
`build` task. A CI run that only asks for the site cannot reach the scraper,
because nothing depends on it.

`turbo.json`:

```json
{
	"$schema": "https://turbo.build/schema.json",
	"tasks": {
		"build": { "outputs": ["Target/**", "Maintain/Target/**"] },
		"tool": { "cache": false, "persistent": false },
		"check": { "dependsOn": ["build"] }
	}
}
```

`tool` is deliberately uncached: it drives a live browser and writes to a
gitignored store, so replaying a cached result would be a lie.

## Cloudflare Pages

| Setting          | Value                                                     |
| ---------------- | --------------------------------------------------------- |
| Build command    | `pnpm build` (site only - no `tool`)                      |
| Output directory | `Target`                                                  |
| Environment      | no `MAINTAIN_*` variables; the tool layer is absent in CI |

## Invariants

- The site build never imports from `Maintain/`.
- Scraping never runs in CI; a workflow that calls `store scrape` is a bug.
- `Maintain/Target/` is generated, gitignored, and never hand-edited.
- Both pipelines are reachable from the root: `pnpm build` (site) and
  `pnpm tool` (Maintain), and `turbo run build` builds what it is asked for and
  nothing else.

## Claim → test

| Claim                    | Test                                                           |
| ------------------------ | -------------------------------------------------------------- |
| Maintain compiles        | `pnpm run Build` then `ls Maintain/Target/**/*.js`             |
| Output is clean          | touch a stale file in `Maintain/Target`, rebuild, it is gone   |
| Site build cannot scrape | `turbo run build --dry=json` lists no `Maintain` task          |
| CI is static             | the Cloudflare Pages build command contains no `tool`/`scrape` |
| Workspace resolves       | `pnpm -w ls --depth -1` shows the root and `Maintain`          |

# Build - workspace, turbo, and `@playform/build`

The repository holds two things that build differently: a static Astro site that Cloudflare Pages
builds, and a local-only tool layer that must never run in CI.

## Layout

```
pnpm-workspace.yaml          # packages: "." and "Maintain"
turbo.json                   # build / Build / check / tool
package.json                 # root: the site (Astro) + workspace scripts
Maintain/
  package.json               # @nikolarhristov/timeline-maintain
  Source/**/*.ts             # tool layer sources; the CLI entry is Source/Index.ts
  Target/**/*.js             # compiled output (gitignored); Index.js is the bin
  Configuration/ESBuild.ts   # esbuild options for @playform/build
  Configuration/ESBuild.js   # its emit, the file @playform/build imports (gitignored)
```

## Commands

| From the root                 | What it does                                      |
| ----------------------------- | ------------------------------------------------- |
| `pnpm build`                  | `astro build` - the site, nothing else            |
| `pnpm Build`                  | compiles the tool layer into `Maintain/Target/**` |
| `pnpm maintain <group> <cmd>` | runs the compiled CLI                             |
| `pnpm tool <group> <cmd>`     | the same, through the Maintain package's `tool`   |
| `pnpm Run`                    | `astro dev --host`                                |

`Maintain/package.json`:

```json
{
	"scripts": {
		"Prepare": "esbuild Configuration/ESBuild.ts --format=esm --platform=node --target=esnext --outfile=Configuration/ESBuild.js",
		"Build": "pnpm run Prepare && Build 'Source/**/*.ts' --ESBuild Configuration/ESBuild.ts",
		"Watch": "pnpm run Prepare && Build 'Source/**/*.ts' --Watch --ESBuild Configuration/ESBuild.ts",
		"check": "tsc --noEmit -p tsconfig.json",
		"tool": "node Target/Index.js"
	}
}
```

`Prepare` is not an npm lifecycle hook: `prepare` is lowercase, `Prepare` is the package's own name
for the step, matching `Build`/`Watch`/`Run`.

### The config is emitted before it is imported

`@playform/build` imports the `--ESBuild` path after rewriting `.ts` to `.js` (`Function/File.js` in
the package does `pathToFileURL(path).toString().replace(".ts", ".js")`). `Configuration/ESBuild.ts`
is the source of truth and `Configuration/ESBuild.js` is the file actually imported, so `Prepare`
writes the second from the first and the two cannot drift. Both the emit and `Target/` are
gitignored.

### Why `bundle` is on

The sources import each other with `.ts` specifiers (`from "./CLI/Parser/Parser.ts"`), which is the
same form `node Maintain/Source/Index.ts` runs directly with no toolchain. A non-bundled emit would
copy those specifiers into `Target/`, where only `.js` files exist, so
`node Maintain/Target/Index.js` could not resolve its own imports. `bundle` plus `splitting`
rewrites them and emits shared code once as `Target/chunk-*.js`.

`Configuration/ESBuild.ts` mirrors the sibling packages: `format: "esm"`, `platform: "node"`,
`target: "esnext"`, `outdir: "Target"`, `tsconfig: "tsconfig.json"`, `minify`, `metafile`, and an
`onStart` plugin that removes the output directory so a renamed or deleted source never leaves a
stale file behind. It also sets `lib: ["ESNext", "DOM"]` in `Maintain/tsconfig.json`, because the
selector modules are `inPage` functions whose source is sent to the page and therefore name
`document`, `window` and `Element` directly.

## Entry points

| Path                       | What it is                                                          |
| -------------------------- | ------------------------------------------------------------------- |
| `Maintain/Source/Index.ts` | the CLI, uncompiled; `node Maintain/Source/Index.ts --help` runs it |
| `Maintain/Target/Index.js` | the same program compiled; `bin.maintain` points here               |
| `pnpm maintain --help`     | the compiled entry, through the workspace                           |

The mapping is one-to-one: `Source/**` is the entry base, so `Source/Index.ts` becomes
`Target/Index.js` and `Source/CLI/Parser/Parser.ts` becomes `Target/CLI/Parser/Parser.js`.

## Two pipelines that must not mix

| Pipeline                                      | Runs where                    | May it scrape?                             |
| --------------------------------------------- | ----------------------------- | ------------------------------------------ |
| `turbo run build` → site                      | Cloudflare Pages, and locally | **No.** Build reads `Source/Content/` only |
| `pnpm maintain` / `turbo run tool` → Maintain | the person's machine only     | yes - that is the point                    |

```json
{
	"$schema": "https://turbo.build/schema.json",

	"globalEnv": ["NODE_ENV"],

	"tasks": {
		"build": { "outputs": ["Target/**"] },

		"Build": { "outputs": ["Target/**"] },

		"check": { "outputs": [] },

		"tool": { "cache": false, "dependsOn": ["Build"] }
	},

	"ui": "stream"
}
```

The rule is structural, not a promise. Task names are case-sensitive, and that is the guard: the
site's task is `build`, the tool layer's is `Build`. `turbo run build` therefore matches one
package - the root - and cannot reach `Maintain`, which has no `build` script at all.
`turbo run build --dry=json` still prints a `timeline-maintain#build` slot marked `<NONEXISTENT>`
with no dependencies and no dependents: that is turbo reporting the task does not exist there, not
an edge. `turbo run build --filter=timeline-bookmarks --dry=json` is the site graph on its own, a
single node.

`tool` is deliberately uncached: it drives a live browser and writes to a gitignored store, so
replaying a cached result would be a lie. It depends on `Build`, so `pnpm tool` never runs a stale
`Target/`.

`packageManager` is pinned in the root `package.json` because turbo refuses to resolve a workspace
without it.

## Cloudflare Pages

| Setting          | Value                                                     |
| ---------------- | --------------------------------------------------------- |
| Build command    | `pnpm build` (site only - no `tool`)                      |
| Output directory | `Target`                                                  |
| Environment      | no `MAINTAIN_*` variables; the tool layer is absent in CI |

`MAINTAIN_DEBUG`, `MAINTAIN_CONFIG`, `MAINTAIN_STORAGE` and `MAINTAIN_CDP_PORT` are read by the CLI
at run time. None is declared in `globalEnv` or in a task's `env`, and `ESBuild.ts` defines nothing
from the environment, so no `MAINTAIN_*` value can reach a build.

## Invariants

- The site build never imports from `Maintain/`.
- Scraping never runs in CI; a workflow that calls `store scrape` is a bug.
- `Maintain/Target/` and `Maintain/Configuration/ESBuild.js` are generated, gitignored, and never
  hand-edited.
- A path stays tracked after it is added to `.gitignore`; `git rm -r --cached Target` is what makes
  the rule apply to site output committed before the rule existed.
- `pnpm check` is the type-check backlog, not a build gate: the tool layer predates the strict base
  `tsconfig`, so `tsc --noEmit` reports errors that `@playform/build` logs and continues past. The
  build does not depend on it.
- `-w` narrows `pnpm ls` to the root project; without it both workspace projects are listed.

## Claim → test

| Claim                    | Test                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Maintain compiles        | `pnpm run Build` then `ls Maintain/Target/*.js`                                         |
| Output is clean          | `touch Maintain/Target/STALE.txt`, rebuild, it is gone                                  |
| The compiled CLI runs    | `node Maintain/Target/Index.js --help`                                                  |
| Site build cannot scrape | `turbo run build --filter=timeline-bookmarks --dry=json` lists one task                 |
| CI is static             | `.github/workflows/Node.yml` runs `pnpm run prepublishOnly` → `astro build`             |
| Workspace resolves       | `pnpm ls --depth -1` shows `timeline-bookmarks` and `@nikolarhristov/timeline-maintain` |
| No build-time env        | `grep -r MAINTAIN_ turbo.json pnpm-workspace.yaml Maintain/Configuration/ESBuild.ts`    |

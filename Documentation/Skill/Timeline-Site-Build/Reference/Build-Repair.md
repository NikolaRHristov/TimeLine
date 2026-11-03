# Build repair: the four config-layer failures

The worked instances behind the rules in `../SKILL.md`. Each one cost a build cycle, and each one
reports a message that names something other than the defect.

## 1. An ESM-first PostCSS plugin needs `.default`

`postcss-combine-duplicated-selectors` v11 ships ESM-first: its CommonJS `require()` returns
`{ __esModule, default }`, so calling the module object throws `require(...) is not a function`
while PostCSS loads the config and the build never starts.

Probe every plugin in one pass, from the site root so the site's `node_modules` resolve:

```
node -e 'for (const P of ["postcss-import","postcss-url","tailwindcss/nesting","tailwindcss","postcss-combine-media-query","postcss-combine-duplicated-selectors","autoprefixer","cssnano","postcss-reporter"]) { const M = require(P); if (typeof M !== "function") console.log(P, typeof M, "default=" + typeof (M && M.default)); }'
```

Print only the non-functions. A full listing of every module shape gets truncated by output
compression and hides the one bad entry. The call site becomes `Require("pkg").default(...)` for the
package the probe named, and `postcss.config.js` is the only file that changes.

## 2. tsconfig `paths` do not reach a CSS `@import`

`@playform/build`'s tsconfig defines `@Stylesheet/*`, `@Script/*` and the rest. TypeScript and Vite
resolve those for JS and TS imports; a CSS `@import "@Stylesheet/Global.css"` inside
`<style is:global>` is resolved by Vite's STYLESHEET pipeline, which does not read tsconfig `paths`.
The build reports `Unable to resolve @import ... from Source/Layout` and then
`ENOENT ... open '@Stylesheet/Global.css'`.

`astro.config.ts` builds an `Aliases` table with absolute paths from `resolve(Here, "Source", ...)`
and registers it as `vite.resolve.alias`. Adding only the `postcss-import` `resolve` option is NOT
sufficient - keep both, since the postcss resolver also covers the standalone PostCSS path.

An alias table typed against `vite`'s own types, or any helper imported from `vite`, makes
`astro.config.ts` import a package the site never declared: the local tree still builds and the
clean install dies with `Cannot find module 'vite' imported from '<root>/astro.config.ts'`. After
adding a Vite alias, confirm `vite` is a declared dependency at the version `astro` depends on.

## 3. `@import` in a `lang="scss"` global block

A `<style is:global lang="scss">` block that loads stylesheets with `@import` emits a Dart Sass
deprecation per file on every build
(`Sass @import rules are deprecated and will be removed in Dart Sass 3.0.0`).
`@use "../Stylesheet/Layout/Shell.scss" as *;` is the global-scope equivalent, and `@use` must
precede every other rule in the block.

An `@use` that silently loads nothing is indistinguishable from a working build until a page renders
unstyled, so verify: grep the emitted HTML for one declaration unique to each sheet (`.page{`,
`.page--wide{`) and assert zero `Deprecation Warning` lines in the build log.

## 4. A failure that only happens in CI is dependency resolution

A local build that passes proves nothing about CI when the local `node_modules` is older than the
lockfile: a hoisted copy left by an earlier install satisfies an import a clean install cannot
resolve. The signature is `[astro] Unable to load your Astro config` followed by
`Cannot find module '<pkg>' imported from '<root>/astro.config.ts'`, where `astro.config.ts` does
not import that package at all - `astro/config` does, and Vite's module runner resolves it from the
project root.

Under pnpm's strict layout a transitive dependency is not at the root, so an undeclared package is
unresolvable no matter which Node version CI uses. Declare it at the version the framework declares
(`node_modules/astro/package.json` → `dependencies`), then prove it in a clean tree with
`CI-Reproduction.md`.

## The shape all four share

The error names the wrong thing. The config file loads fine and a plugin is the defect; the import
resolves fine for TypeScript and the stylesheet pipeline is the defect; the tree builds fine and the
lockfile is the defect. Read the innermost bracket and the file:line frame, fix that one thing, and
re-run - the config loads before CSS resolution, so a broken config hides an alias problem behind
it. Expect two rounds, not one.

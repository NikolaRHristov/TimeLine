# RFC-0044 - Toolchain upgrade policy

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the root
`package.json`, `Scripts/Compatibility.mjs`, `pnpm run check`, the Node workflow, every dependency
the site builds with **Decision class:** methodology **Supersedes:** none **Superseded by:** none
**Task dependencies:** RFC-0009 (build, release and toolchain), t_344b78d0

## Decision

The toolchain floor is recorded once, in the root `package.json` under `engines.node`, and enforced
by `Scripts/Compatibility.mjs`, which `pnpm run check` runs before anything else.

Four rules follow from that.

1. **A patch or minor inside a recorded major is taken as it ships.** It is one edit to
   `package.json` and needs no record.
2. **A major is taken when the ecosystem in `package.json` has published against it** - not when the
   major is announced, and not on a schedule. Until then it is reported by the guard and deferred
   here.
3. **Every direct dependency is an exact version.** No `^`, no `~`, because no lockfile is tracked
   and a range is the only thing a clean install could drift on.
4. **The floor rises only when a dependency's own `engines` forces it.** A new Node line is adopted
   when it reaches LTS; it becomes the recorded floor when something in the tree refuses to build
   below it.

The browser baseline is not a policy and is not gated this way: it is derived from the CSS the
components use, and it moves only when a stylesheet adds a feature. It is recorded in
`Documentation/Reference/Compatibility.md` with the `caniuse-lite` query that reproduces it.

## Context

The stack was unpinned in practice. `@astrojs/solid-js`, `solid-js` and `sass` were added with caret
ranges while every other dependency was exact, `astro` sat at 7.4.4 with no statement anywhere about
which major was supported, and no page recorded a browser baseline at all. Four measured facts made
the gap concrete.

**The Node floor is real, and one tool enforces it.** `astro` 7.4.4 declares `engines.node`
`>=22.23.4` (`node -p "require('./node_modules/astro/package.json').engines.node"`) and refuses to
build below it - `Node.js v22.23.0 is not supported by Astro!` - while `pnpm run Build` (esbuild)
and the tool layer's type-check both exit 0 on that same interpreter. The floor was known to the
site build and to nothing else; the check path said nothing about the runtime at all.

**A major is already behind and reported nowhere.** `pnpm outdated --format json` answers with one
entry: `tailwindcss` 3.4.19 against 4.3.3. Nothing in the repository said whether that was a debt, a
deferral, or an oversight.

**The baseline was derivable all along.** `overflow: clip` appears in four sheets, `100dvh` in the
workspace sheet, `@layer` in the base sheet, and CSS nesting appears in `.css` sources but is
flattened by `tailwindcss/nesting` before the output. The highest requirement across those is Chrome
108, Firefox 101, Safari 16.0, and no file said so.

**A Sass major would break the build today.** Every build prints `DEPRECATION WARNING [import]` for
`Source/Layout/Base.astro:80` and `:81`, which import the two `.scss` sheets with `@import`; Dart
Sass 3.0 removes that rule. The deferral is a migration to `@use`, measured by the warning rather
than assumed.

RFC-0009 fixed the workspace and the pipelines. It left two questions open - whether the tool
package needs its own Node floor, and what a clean install proves without a lockfile. This record
answers both.

## Alternatives considered

| Option                                                     | Why not chosen                                                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Record the floor in the reference page only                | prose does not fail a build; the number and the enforcement would drift within a release                                                               |
| Record it in a `.nvmrc` / `.node-version` and stop there   | a version manager only helps a machine that has one, and the file is silent to `pnpm run build`                                                        |
| Set `engine-strict=true` in `.npmrc`                       | pnpm's own refusal arrives during `install`, before anything can explain why, and it blocks work unrelated to the build                                |
| Fail `pnpm run check` on any outdated dependency           | turns every upstream release into a red build and forces the major decision on the release's schedule                                                  |
| Follow every major immediately                             | an Astro major before `@astrojs/solid-js`, `@astrojs/sitemap`, `astrojs-service-worker` and the `@playform/*` integrations ship is an unbuildable site |
| Commit the lockfile to make installs reproducible          | `pnpm-lock.yaml` is ignored by a machine-wide rule the owner set; exact specifiers get most of the value at no cost                                    |
| Pin the browser floor with a build target (down-levelling) | Astro's client build already targets `esnext`; adding a transpile target to satisfy a policy would hide which CSS features actually set the floor      |

## Consequences

- A wrong interpreter now produces one sentence naming the version, the floor and the file, before
  the type-checker's output rather than after it.
- A major that is available and untaken is visible on every `pnpm run check`, so a deferral cannot
  quietly become an oversight.
- Deferring a major is a written decision with a reason, and taking it amends this record rather
  than editing the reference page into disagreement with it.
- The reference page and the manifest cannot disagree: the page states the number and the guard
  reads it from `engines.node`.
- Adding a CSS feature means re-deriving the browser baseline, because the baseline is a consequence
  of the stylesheets, not a promise about them.
- A clean install is reproducible only to the exact specifiers. Nothing here makes it byte-identical
  across machines while the lockfile stays untracked.

## Verification

| Claim                                  | Test                                                                                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The floor is recorded once             | `node -p "require('./package.json').engines.node"` → `>=22.23.4`                                                                                                                     |
| The guard enforces the floor           | `node Scripts/Compatibility.mjs` under Node 22.22.1 → `FAIL`, exit 1                                                                                                                 |
| The guard passes a supported Node      | the same command under Node 26.5.1 → `PASS`, exit 0                                                                                                                                  |
| A major behind is reported, not failed | the same run prints `INFO 1 behind a major` with `tailwindcss 3.4.19 -> 4.3.3` and exits 0                                                                                           |
| An absent pnpm does not fail the check | `env -i PATH=/usr/bin:/bin node Scripts/Compatibility.mjs` → `SKIP`, exit 0                                                                                                          |
| `pnpm run check` runs the guard first  | `pnpm run check` prints the `== record` section above the `tsc` output                                                                                                               |
| Every direct dependency is exact       | `node -e "const p=require('./package.json');for(const d of [p.dependencies,p.devDependencies])for(const [k,v] of Object.entries(d))if(/[~^*]/.test(v))console.log(k,v)"` → no output |
| The baseline matches the stylesheets   | the `caniuse-lite` query in `Documentation/Reference/Compatibility.md`                                                                                                               |
| Nesting is compiled, not shipped       | `grep -c '&' Target/_astro/*.css` → `0` in every file                                                                                                                                |
| A clean clone builds                   | `rm -rf node_modules Target && pnpm install && pnpm run build` → exit 0 for both                                                                                                     |

## Open questions

- Whether to commit `pnpm-lock.yaml` and drop the machine-wide ignore, which is what would make
  `--frozen-lockfile` meaningful. It is the owner's rule, so it stays their call.
- Whether the Node workflow should test the floor (22.23.4) and the development line (24) as a
  matrix, or only the floor. It currently names both; the cost of the second job is a duplicated
  install.
- What a Tailwind 4 migration costs. It removes `tailwindcss/nesting` and moves the theme into CSS,
  so the estimate needs a spike against `postcss.config.js`, not a version bump.
- What the Sass `@import` to `@use` migration costs across `Source/Layout/Base.astro` and the two
  sheets it pulls in, and whether the sheets should instead be imported by the components that read
  them.
- Whether `astro check` belongs in `pnpm run check` beside the guard, and what it would report
  today.

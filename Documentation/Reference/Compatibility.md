# Compatibility - the toolchain floor and the browser baseline

Two floors hold the site up: the runtime that builds it, and the browser that reads it. Both are
written down here. The first is recorded once, in the root `package.json` as `engines.node`, and
stated nowhere else; the second is derived from the stylesheets.

## The floor

| Component  | Floor                                | Recorded in                        |
| ---------- | ------------------------------------ | ---------------------------------- |
| Node       | `>=22.23.4` (line 22; 24 and 26 too) | `package.json` → `engines.node`    |
| pnpm       | `11.18.0`                            | `package.json` → `packageManager`  |
| Astro      | `7.4.4`                              | `package.json` → `dependencies`    |
| Solid      | `1.9.18`, `@astrojs/solid-js` 7.1.2  | `package.json` → `dependencies`    |
| Sass       | `1.107.1`                            | `package.json` → `devDependencies` |
| TypeScript | `7.0.2`                              | both manifests                     |
| Vite       | `8.3.5`                              | `package.json` → `dependencies`    |

The Node floor is not a policy choice. `astro` 7.4.4 declares `engines.node` `>=22.23.4` itself, and
below it it refuses to build, by name:

```
Node.js v22.23.0 is not supported by Astro!
Please upgrade Node.js to a supported version: ">=22.23.4"
```

That message is clear, but it comes from the only tool in the chain that has the check.
`pnpm run Build` (esbuild) and `tsc --noEmit -p Maintain/tsconfig.json` both exit 0 on the same
interpreter - measured, not assumed - so nothing else in the tree states the floor. The repository
records the number once, in `engines.node`, and `astro build` is what a wrong interpreter runs into.
The commands that print it:

```sh
node -p "require('./package.json').engines.node"              # >=22.23.4
node -p "require('./node_modules/astro/package.json').engines.node"  # >=22.23.4
```

Every direct dependency is an exact version, with no `^` or `~`, and that is load-bearing: no
lockfile is tracked in this repository (`pnpm-lock.yaml` is ignored by the machine-wide global
ignore), so a clean clone resolves every range from the registry at install time. An exact specifier
is what keeps a clean install from being a different install. The consequence is recorded under
_Known gaps_ below.

The floor is a floor, not a pin. Patch releases above it are taken, and an odd major satisfies the
range without being supported. Only the LTS lines - 22 from 22.23.4, 24, 26 - are supported.

## Enforcement

`.npmrc` does not set `engine-strict`, so `pnpm install` succeeds on a Node below the floor, and
neither `pnpm run Build` nor `tsc` reads `engines.node`. `astro build` is the one step that refuses:
it prints the message above, names the version and the floor, and stops. The floor is therefore a
statement about the build, not about the install.

## The browser baseline

The baseline is derived from what the source actually uses, not from a policy. The highest version
each engine needs is the floor for that engine.

| Feature                                             | Where                                                       | Chrome | Firefox | Safari |
| --------------------------------------------------- | ----------------------------------------------------------- | ------ | ------- | ------ |
| `color-mix()`                                       | `Component/Provenance.scss:88`                              | 111    | 113     | 16.2   |
| `overflow: clip`                                    | `Component/{Bento,Drawer,Provenance}.scss`, `Material.scss` | 90     | 81      | 16.0   |
| Logical properties (`margin-block`, `inset-inline`) | `Component/{Bento,Pill}.scss`                               | 89     | 66      | 15     |
| Flex `gap`                                          | `Component/Pill.scss` and the other flex rows               | 84     | 63      | 14.1   |

**Baseline: Chrome 111, Firefox 113, Safari 16.2.** `color-mix()` is the binding constraint on all
three engines; `overflow: clip` is the next.

Two features that have been in these sheets are no longer requirements at all:

- **CSS nesting** is compiled away. `tailwindcss/nesting` in `postcss.config.js` flattens every `&`
  before `autoprefixer` runs, and Sass does the same for the `.scss` sheets, so no `&` reaches the
  output and native nesting imposes nothing.
- **Container queries** are not used anywhere: no `@container`, no `container-type`, and
  `@tailwindcss/container-queries` is not a dependency.

`100dvh` and `@layer` were both in the sheets when this page was first written and neither survives
in the source - the workspace no longer sizes itself in dynamic viewport units, and the base sheet
holds Tailwind directives rather than a cascade layer. Both are re-derivable, and a reintroduction
is what the commands below are for.

The numbers come from two data sets, both already present or fetchable without a browser:
`caniuse-lite` (the data `autoprefixer` carries) for the four CSS features except `color-mix()`,
which caniuse has no entry for, and MDN's browser-compat-data (`css.types.color.color-mix`) for that
one. Re-derive the caniuse half when a new feature is added to a stylesheet:

```sh
node -e "const P=require('path'),R=require('module').createRequire(P.dirname(require.resolve('autoprefixer/package.json'))),C=R('caniuse-lite'),E=(U,e)=>Object.keys(U.stats[e]||{}).filter(v=>U.stats[e][v].startsWith('y')).sort((a,b)=>parseFloat(a)-parseFloat(b))[0];for(const n of ['css-overflow','css-logical-props','flexbox-gap']){const U=C.feature(C.features[n]);console.log(n.padEnd(20),'chrome',E(U,'chrome'),'firefox',E(U,'firefox'),'safari',E(U,'safari'))}"
```

The site ships JavaScript at `esnext`: Astro's client build sets `vite.build.target` to `esnext`
(`node_modules/astro/dist/core/build/vite-build-config.js`), so nothing is down-levelled and the
baseline above is the only thing keeping the bundle readable. A browser older than the baseline
receives the markup and the stylesheet and may fail to hydrate the workspace island - the drawer and
the grid - while the published canvas still renders. That is a deliberate failure mode: the static
half of the site is the half that must always work.

## The upgrade policy

Stated in full in RFC-0044; the rule a person needs at the keyboard is here.

- **Patch and minor, within a recorded major** - taken as they ship. A bump is one edit to
  `package.json`.
- **A major** - waits until the ecosystem in `package.json` publishes against it, then it is taken
  in one commit with the RFC amended. Astro is the case that matters: `@astrojs/solid-js`,
  `@astrojs/sitemap`, `astrojs-service-worker`, `@astrojs/ts-plugin` and the three `@playform/*`
  integrations all import Astro's integration API, so an Astro major that lands before its
  integrations is an unbuildable site.
- **Tailwind is deliberately deferred at 3.4.19 against 4.3.3.** Version 4 removes the
  `tailwindcss/nesting` entry `postcss.config.js` imports and moves the theme from
  `tailwind.config.js` into CSS, so taking it is a stylesheet migration, not a version bump. The
  deferral is recorded in RFC-0044.
- **Sass is deferred at 1.107.1 against 3.0.** Every build prints `DEPRECATION WARNING [import]` for
  `Source/Layout/Base.astro:80` and `:81`, which pull the two `.scss` sheets in with `@import`. Dart
  Sass 3.0 removes `@import` outright, so a Sass major is a migration to `@use` (or to the component
  styles importing their own sheet), not a version bump.
- **Node majors** - adopted when the new line reaches LTS, and the recorded floor rises only when a
  dependency's own `engines` forces it. Raising the floor early costs every clone a runtime upgrade
  for no build it could not already do.

The decision lives in `Documentation/RFC/proposed/RFC-0044-toolchain-upgrade-policy.md`. A change of
policy supersedes that record; it does not edit this page into disagreement with it.

## Known gaps

- **No tracked lockfile.** `pnpm-lock.yaml` is ignored by a machine-wide global ignore, so it is
  never committed and a clean clone resolves fresh. RFC-0009's verification row for
  `pnpm install --frozen-lockfile` therefore cannot pass in a clean clone; the substitute is the
  exact specifiers plus a build proof, below. Committing the lockfile would make installs
  reproducible at the cost of a machine-wide rule, and that trade is the owner's, not a worker's.
- **One floor for both packages.** `Maintain/` carries no `engines` of its own and runs on the same
  interpreter as the site. It has no build-time runtime requirement beyond Node's own ESM support,
  and `@types/node` 26.6.6 is a type package, not a runtime.
- **No version-manager file.** No `.nvmrc` or `.node-version` is tracked; `engines.node` is the
  record, and `astro build` is what a wrong interpreter runs into.

## Claim → test

| Claim                            | Test                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| The floor is recorded once       | `node -p "require('./package.json').engines.node"` → `>=22.23.4`                              |
| Nesting is compiled, not shipped | `grep -c '&' Target/_astro/*.css` → `0` for every file                                        |
| Container queries are unused     | `grep -rn "@container\|container-type" Source/` → no match                                    |
| The baseline matches the sheets  | the `caniuse-lite` query above reproduces the three caniuse rows; MDN BCD gives `color-mix()` |
| A clean clone builds             | `rm -rf node_modules Target && pnpm install && pnpm run build` → both exit 0                  |
| Sass `@import` is still in use   | `pnpm run build` prints `DEPRECATION WARNING [import]` for `Source/Layout/Base.astro:80`      |

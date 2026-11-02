# RFC-0009 - Build, release and toolchain

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the workspace, turbo,
`@playform/build`, the Cloudflare Pages build **Decision class:** methodology **Supersedes:** none
**Superseded by:** none **Task dependencies:** t_17031e18 (workspace, done), t_6e510f8e (content
layer)

## Decision

One workspace, two packages, two pipelines that never share a task.

- The site builds with `astro build` and deploys from a push. It reads `Source/Content/` only and
  never imports the tool layer.
- The tool layer compiles with `@playform/build` from `Maintain/Source/**` into
  `Maintain/Target/**`, and is never built in CI.
- Turbo runs both, but the site's graph has no edge to `Maintain`, so a CI job asking for the site
  cannot reach the scraper.

Every dependency a config file imports must be a declared dependency of the package that imports
it - a bare import resolved only by hoisting is a CI failure waiting for a clean install.

## Context

The Cloudflare build failed on a clean install with `Cannot find module 'vite'` while loading
`astro.config.ts`, because `astro/config` needs `vite` resolvable from the project root and no
`package.json` declared it. It built locally only because an earlier install had left a resolvable
copy. Declaring `vite@8.3.5` fixed it, verified in a clean clone on Node 24.19.0.

That failure is the general case, not a one-off: pnpm's strict layout turns any undeclared
transitive import into an install-order-dependent bug.

## Alternatives considered

| Option                                                | Why not chosen                                         |
| ----------------------------------------------------- | ------------------------------------------------------ |
| `shamefully-hoist` to paper over missing declarations | hides every such bug at once and inflates the tree     |
| A separate CI job that builds the tool layer          | nothing in CI needs it; the site must not depend on it |
| Building the site inside the tool package             | inverts the dependency and drags the scraper into CI   |

## Consequences

- A clean-install build is the only build that counts; a local pass proves nothing on its own.
- Adding a config-level import means adding a dependency, even if it is already present
  transitively.
- The two pipelines can be reasoned about separately, which is what makes the static guarantee
  checkable.

## Verification

| Claim                         | Test                                                                      |
| ----------------------------- | ------------------------------------------------------------------------- |
| Clean install builds          | fresh copy, `pnpm install --frozen-lockfile`, `pnpm run build`            |
| Site cannot reach the scraper | `turbo run build --dry=json` lists no `Maintain` task                     |
| Tool layer is local-only      | CI configuration contains no `tool` or `scrape` invocation                |
| Declared, not hoisted         | every bare import in a config file appears in that package's dependencies |

## Open questions

- Whether the site build should run `astro check` in CI, and what that costs.
- Whether the tool package should pin its own Node floor separately from the site.

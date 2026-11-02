# AGENTS.md

Orientation for an agent working in this repository. The rules live here; the procedures live in
`Documentation/Skill/`, one directory per skill, each with a `SKILL.md`. **Read the skill before the
task, not after it fails.**

## The skills, and when to load them

| Task                                                                       | Load                                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Reading or refreshing the saved-post archive                               | `Documentation/Skill/Timeline-Bookmarks/SKILL.md`          |
| Driving a browser tab over CDP (click, type, scroll, scrape)               | `Documentation/Skill/Timeline-Browser-Transport/SKILL.md`  |
| Anything about the shadow store, publishing, or the build/workspace layout | `Documentation/Skill/Timeline-Hermes-Maintenance/SKILL.md` |
| Running or editing the SpacetimeDB module                                  | `Documentation/Skill/SpacetimeDB-Local/SKILL.md`           |
| Several agents working the same tree at once                               | `Documentation/Skill/Parallel-Epic-Execution/SKILL.md`     |

These are boilerplate: they describe _how this kind of repository works_, never a particular
account, project or machine. Anything specific belongs in `.env`.

## Repository shape

```
Maintain/            tool layer (TypeScript, compiled with @playform/build)
  Source/            sources; Target/ is generated and gitignored
  Spacetime/         local SpacetimeDB module
  Storage/           shadow archive, gitignored - the source of truth
  Configuration/     tracked defaults; Local/ is gitignored identifiers
Source/              Astro site: pages, layouts, styles
  Content/           published collection JSON, rendered at build time
Target/              site build output, gitignored
Documentation/       Reference/ (how it works), Skill/ (how to work)
```

## Standing rules

1. **Do not commit unless asked.** Leave changes in the working tree; the owner sweeps them.
2. **Nothing machine-specific in tracked files.** No project ids, account names, absolute paths, or
   tokens. They go in `.env`, `.firebaserc`, or `Maintain/Configuration/Local/` - all gitignored.
3. **The site is hosted elsewhere and deploys on push.** Never add a hosting block to
   `firebase.json`; Firebase is the backend (Auth, Firestore, Storage) only.
4. **Scraping is local.** It never runs in CI, and the site build never imports the tool layer.
5. **PascalCase everywhere; acronyms fully uppercase** - `CLI`, `URL`, `API`, `JSON`, `CDP`.
   Folders, files, identifiers, prose.
6. **Shadow data stays shadow** until something explicitly publishes it. A post marked hidden must
   never reappear after a re-scrape.
7. **Builds belong at the epic boundary.** A worker runs the narrowest check for its own change; the
   full pass runs once, when the tree stops moving.
8. **The repository is public.** No internal process artifacts, no scraped page bodies, no
   third-party docs pasted into tracked files.
9. **Write documentation, not transcripts.** Ideas arrive in conversation; they are restated as
   declarative prose, never quoted back. No quotation marks around a phrase borrowed from the owner,
   no first-person voice, no attributed fragments - a document states what is true, not who said it.

## Verifying a change

| Change                             | Check                                             |
| ---------------------------------- | ------------------------------------------------- |
| TypeScript under `Maintain/Source` | `pnpm run check`                                  |
| SpacetimeDB module                 | `spacetime build` in `Maintain/Spacetime`         |
| Documentation only                 | `pnpm exec prettier --check <file>`               |
| A CLI command                      | run that command with `--dry-run` where it exists |

## Local setup, once per clone

```sh
pnpm install
cp .env.example .env      # fill in your own Firebase project values
firebase login            # one time; the refresh token stays in the configstore
```

`pnpm-workspace.yaml` must keep `re2: true` under `allowBuilds`: firebase-tools depends on it, and
an unapproved native build makes `pnpm install` exit 1, which takes every `pnpm run` down with it.

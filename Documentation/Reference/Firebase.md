# Firebase - backend only

Firebase is the backend for this site, not its host. The site itself is served by
Cloudflare Pages and deploys automatically on every push to the repository - no
`wrangler`, no `firebase deploy` for the front end. Firebase supplies the pieces
a static site cannot have: Auth, Firestore, Storage.

## What runs where

| Concern | Where | Deployed by |
|---|---|---|
| The site (`Target/`) | Cloudflare Pages | git push, automatically |
| Auth, Firestore, Storage | Firebase project `nikola-timeline` | rules via `pnpm run Deploy:Rules` |
| Scraping and the archive | local machine only | never deployed |

`firebase.json` therefore has **no `hosting` block**. If one reappears, something
is trying to publish the site to the wrong host.

## Project

This repository is a template: the Firebase project identifiers are **not**
tracked. They live in a gitignored `.env` (template in `.env.example`) and are
read at build time, so a fresh clone points at its own project.

| Item | Where it comes from |
|---|---|
| Project ID | `FIREBASE_PROJECT_ID` in `.env`, or `.firebaserc` |
| Project number | `FIREBASE_MESSAGING_SENDER_ID` |
| Web app ID | `FIREBASE_APP_ID` |
| Auth domain | `FIREBASE_AUTH_DOMAIN` |
| Storage bucket | `FIREBASE_STORAGE_BUCKET` |

Fetch them for a project you own:

```sh
firebase apps:sdkconfig web --project <your-project-id>
```

`.firebaserc` pins the default project so no command needs `--project` - and
because it names a project, keep it local too (it is gitignored here).

## CLI

Installed twice, deliberately:

- globally - `npm install -g firebase-tools`, so `firebase` works anywhere;
- as a devDependency - `pnpm add -Dw firebase-tools`, so CI and scripts pin a
  version instead of trusting whatever is global.

Version verified: `15.34.2` both ways. Authentication is a one-time
`firebase login`; the refresh token lives in
`~/.config/configstore/firebase-tools.json` and is the only real secret here.

`pnpm-workspace.yaml` must keep `re2: true` under `allowBuilds`. firebase-tools
depends on `re2`, and an unapproved native build makes `pnpm install` exit 1 -
which takes down every `pnpm run` in the workspace, because pnpm runs the
dependency precheck first.

## The web config is not a secret

`firebase apps:sdkconfig web --project nikola-timeline` prints the client config.
Its `apiKey` is a public project identifier that ships in the page bundle by
design; access is enforced by Security Rules, not by hiding it. Those values live
in a gitignored `.env`, with `.env.example` as the template.

## Rules

| File | Enforces |
|---|---|
| `Firestore.rules` | `/users/{uid}/**` owner-only; `/public/**` read-all, owner-write; everything else denied |
| `Storage.rules` | same shape for files |
| `Firestore.indexes.json` | empty until a query needs a composite index |

Deploy them with `pnpm run Deploy:Rules`. The emulator (`pnpm run Emulators`)
runs Auth on 9099, Firestore on 8080, Storage on 9199 and the UI on 4000.

## Known state

The Firestore API is **not enabled** on the project yet - `firebase
firestore:databases:list` answers HTTP 403 "Cloud Firestore API has not been used
in project nikola-timeline before or it is disabled". Until it is enabled in the
console, `Deploy:Rules` has no database to accept rules; the emulators still work
because they run locally.

## Claim → test

| Claim | Test |
|---|---|
| CLI installed globally | `firebase --version` |
| Pinned locally | `node_modules/.bin/firebase --version` |
| Project wired | `firebase use` prints `nikola-timeline` |
| No hosting block | `jq -e '.hosting' firebase.json` exits non-zero |
| Config parses | `jq -e . firebase.json .firebaserc` |
| Web config available | `firebase apps:sdkconfig web --project nikola-timeline` |
| Rules deployable | `pnpm run Deploy:Rules` (blocked until Firestore API is enabled) |

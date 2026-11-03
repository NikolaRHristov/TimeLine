---
title: Client surface
rfc: 0017
category: Architecture/Surface
kind: rfc
date: 2026-11-02
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: the Astro site, the service worker, the vote subsystem, the room client
supersedes: none
superseded_by: none
depends:
    - RFC-0001 (publication is the only layer the build reads)
    - RFC-0003 (the transport seam)
    - RFC-0012 (audiences)
    - RFC-0018 (a queued write is a run)
    - "RFC-0007 (the client holds the keys); t_7936cc8e (transport seam)"
    - t_6e510f8e (content layer)
    - |-
        t_406cc8ab (voted index); implementing card to be created: "Room client - live feed, ratings and comments over the static shell"
statuses:
    - name: Static, always
      state: open
      evidence: the rule names no file or command
    - name: Live, only when a room is joined
      state: open
      evidence: the rule names no file or command
    - name: The feature gallery is the existing pages
      state: open
      evidence: the rule names no file or command
    - name: A rating is a vote record
      state: open
      evidence: the rule names no file or command
    - name: "A comment is a post with `replyTo`, addressed to `typed` (RFC-0012)"
      state: open
      evidence: the rule names no file or command
    - name: Offline is a first-class state
      state: open
      evidence: the rule names no file or command
---

## Decision

The site stays static. Rooms add a live layer that is optional and additive, and the build never
waits on it.

- **Static, always:** the published archive in `Source/Content/`, the lists, the curated index, the
  vote counts as of the last sync, the redirect map and the shell. `astro build` passes with no
  database running.
- **Live, only when a room is joined:** the room feed, membership and grants, propagation state and
  presence. Served by a subscription over the module's per-member view. No static page blocks on it.
- **The feature gallery is the existing pages.** A published post is a card; `/Bookmark/[...Id]`,
  `/List/[Slug]`, `/Voted/` and `/` are the gallery. A room's gallery is the same card component
  over a different source, never a second implementation.
- **A rating is a vote record.** The existing vote subsystem (`nominate`, `approve`, `reject`,
  `rank`, `sync`) produces the number. What is displayed is the published aggregate plus the count
  of voters - never a star average, because an average hides whether one person or a hundred voted.
- **A comment is a post with `replyTo`**, addressed to `typed` (RFC-0012). A comment renders on the
  static site only when published, and a comment's audience can never be wider than its parent's.
- **Offline is a first-class state.** The service worker caches the shell and the last snapshot of
  the pages a person visited. A queued write is signed at authoring time (RFC-0013), not at send
  time, and replayed on reconnect. A queued write that fails permanently surfaces as a named
  failure; it is never dropped in silence.

## Context

The site is seven page files over five content collections - `Bookmark`, `Author`, `Event`, `Voted`,
`Curated` - with `astrojs-service-worker` wired for production only, and RFC-0003's transport seam
already separating a CDP-backed transport from a read-only view of the shadow store. Voting is
already asynchronous: `maintain vote sync` pulls counts from Firebase into `Maintain/Storage/Vote/`.
Rooms would be the second asynchronous surface in a client that was built around one.

That matters because the two surfaces fail differently. A vote sync failure is a stale number; a
room subscription failure is an empty screen that looks like a room with nothing in it. The client
has to distinguish "nothing published" from "not connected" from "joined but not granted", and the
third is a new state that no page has today.

## Alternatives considered

| Option                                      | Why not chosen                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A single-page app reading only the database | breaks the static guarantee and the deploy-on-push model (RFC-0001)                                     |
| Server-side rendering per request           | a running service at build and at read time, which RFC-0001 forbids for the build                       |
| Comments through a third-party embed        | content leaves the trust boundary of RFC-0007 and the export of RFC-0015 cannot include it              |
| Ratings as a five-star average              | unverifiable without server-side content checks, and a hidden vote is indistinguishable from a lost one |
| A second card component for rooms           | the two renderings drift within a month, and the gallery stops being one thing                          |
| Optimistic send without a local queue       | an offline write is lost, and the person cannot tell whether it was written                             |

## Consequences

- Two data paths in one client, so the interface must say which one produced what without making the
  person learn the architecture.
- The service worker's cache policy becomes load-bearing for offline reads and must be versioned
  with the shell; a stale shell over fresh data is the failure mode to design against.
- Comments widen the module's schema: a `replyTo` column and a parent-audience check at write time.
- A queued write needs an authoring timestamp and a nonce, so RFC-0018's run id and RFC-0013's nonce
  are visible in the client's queue file.
- The cache holds ciphertext, not plaintext: the client decrypts on read, so a shared device does
  not leak the archive through the service worker cache.

## Verification

| Claim                               | Test                                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| The static build needs no database  | `pnpm build` with `spacetime start` not running passes (true today; keep it as a check)                                    |
| Unpublished comments stay out       | `pnpm maintain store publish`, then `grep -r <comment text> Source/Content` finds nothing                                  |
| A comment cannot outrank its parent | publish a `typed` comment on an `internal` post: refused with `audience-wider-than-parent` (intent)                        |
| The gallery is one component        | the diff that adds a room page adds no second card component (review rule, intent)                                         |
| The shell renders offline           | `npx serve Target`, load once, go offline, reload: the shell renders from cache (intent until the worker caches the shell) |
| A queued write survives a reload    | author a post offline, reload, reconnect: one post, one authoring timestamp, one run id (intent)                           |
| The cache holds no plaintext        | `grep -r <post text> Target/` finds nothing after a live room visit (intent)                                               |

## Open questions

- Whether a subscription can express "everything I may read" in one query or needs one per audience
  tier. This is RFC-0005's open question, inherited here because the client's connection strategy
  depends on the answer.
- Whether `astrojs-service-worker` supports cache versioning tied to the build, or whether the shell
  cache must be hand-versioned. UNKNOWN; spike: read its options in
  `node_modules/astrojs-service-worker`.
- Whether a joined-but-ungranted room shows its member count. The count is metadata a non-granted
  member may read (RFC-0014), and showing it is the difference between "waiting" and "empty".
- Whether ratings need a per-person cap to stay meaningful once votes are public, or whether the
  aggregate and the voter count are enough.

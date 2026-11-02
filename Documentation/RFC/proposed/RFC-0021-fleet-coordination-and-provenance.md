# RFC-0021 - Fleet coordination and observation provenance

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the observation log,
the `observation` table, harvest assignments, `maintain fleet status` **Decision class:** policy
**Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0006 (the read-only posture
this record attributes), RFC-0014 (a grant is how an assignment is expressed), RFC-0015 (a member
exports what they observed), RFC-0004 (a job belongs to an identity); implementing card to be
created: "Observation provenance column and the fleet status report"

## Decision

A fleet is a set of identities holding assignments, not a shared account, and every observation
names the identity that produced it.

1. **One identity per harvester.** A person harvesting for a network uses their own identity and
   signs their own writes (RFC-0013). There is no fleet credential, no service account and no
   impersonation of a member by the network: an observation attributed to a shared account cannot be
   revoked for one person, and cannot be exported by one person.
2. **Provenance is a column, not a convention.** The observation row carries `observer` (an
   identity) and `job` (the RFC-0004 job that produced it) beside the existing `at`, `source`,
   `statusId` and `action`. A log line without an observer is not an observation; the writer refuses
   to append one.
3. **An assignment is a grant.** `harvest:<source>:<selector>` is a grant row (RFC-0014) carrying a
   cadence and a window. Removing the grant stops the harvester at its next claim, and the host
   reconciles against the grant list rather than against a roster kept somewhere else.
4. **Reconciliation is per observation and never last-writer-wins.** The projection keeps one post
   row per status id. The row is built from the newest observation by `at` across observers; when
   two observers report different `contentHash` values inside one window, a `divergence` event is
   appended naming both observers and neither value overwrites the other in silence.
5. **Completeness is a number per identity.** Assigned cadence multiplied by the elapsed window,
   against observations received, per member. A fleet's health is the minimum of those numbers,
   never the mean: one member covering a third of their assignment is a gap, and averaging it
   against two healthy members hides the gap.
6. **A member keeps what they observed.** Export (RFC-0015) is scoped by `observer` as well as by
   room, so a person leaving a fleet takes their own observation history and nothing another member
   produced.

## Context

The posture is decided (RFC-0006) and the attribution is not. The observation log is the only place
harvest history lives, and it records four fields:

```sh
head -1 Maintain/Storage/Shadow/Observation.jsonl
# {"at":"2026-11-01T22:44:59.658Z","source":"bookmark","statusId":"2117001899253657894","action":"observed"}
wc -l Maintain/Storage/Shadow/Observation.jsonl
# 344
```

No field names the harvester. The module repeats the shape: the `observation` table is keyed
`<postId>:<source>:<at>` and the writer skips the insert when that key already exists - the
`observe` reducer guards it with `if (ctx.db.observation.id.find(observationId) === null)` in
`Maintain/Spacetime/spacetimedb/src/index.ts`. Two identities observing the same post in the same
millisecond therefore produce one row, and the second observer's contribution disappears without an
error - which is the failure this record exists to prevent, and it arrives exactly when more than
one person harvests.

The product shape is many small networks of a handful of people each (RFC-0005). At that size the
same public timeline is observed by several members of the same room, so duplication is the normal
case rather than an edge case, and "who saw this, when" is the question a member asks when a post
changes.

## Alternatives considered

| Option                                           | Why not chosen                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| A shared harvesting account per network          | one revocation removes everyone; no member can export only their own history; attribution is a claim |
| One identity per network, members behind it      | the network becomes the author of every observation, so a member cannot leave with what they saw     |
| Attribution in a separate audit log              | a second record that drifts from the observations it describes; the column is the cheaper invariant  |
| Last-writer-wins reconciliation                  | a stale observation silently replaces a fresh one, which is the divergence a fleet exists to surface |
| Mean completeness across members                 | one member at a third of their assignment averages away against two healthy members                  |
| Derive the observer from the connection identity | `ctx.sender` binds a connection, not an author (RFC-0013, RFC-0020); it is not evidence of who wrote |

## Consequences

- Every observation write carries an identity, so the module's insert path grows a signature check
  (RFC-0013) and the shadow store's writer grows a field it did not have.
- The observation key changes from `<postId>:<source>:<at>` to `<postId>:<observer>:<source>:<at>`,
  which is a schema migration for the existing 344 rows: the observer for history is UNKNOWN and is
  written as `unknown`, not guessed.
- Reconciliation becomes a read over several observations per post rather than a lookup of one,
  which is a real cost per post in a room with a fleet.
- Divergence events give a room something to argue about: two members disagreeing about what a post
  said is visible rather than averaged.
- Fleet completeness is a report the operator must run, not a dashboard that runs itself, so the
  failure mode of not looking is a quiet gap.

## Verification

| Claim                               | Test                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every observation names an observer | `jq -r 'select(.observer == null)' Maintain/Storage/Shadow/Observation.jsonl` prints nothing                                                     |
| Two observers do not collide        | two identities observe one post in the same second; `select count(*) from observation where status_id = '<id>'` is 2 (intent, needs the new key) |
| The projection takes the newest     | replay an older observation for a post; the post row's `observedAt` does not move (intent)                                                       |
| Divergence is recorded              | two observers report different hashes in one window; one `divergence` event names both and no row is overwritten                                 |
| Completeness is per identity        | `maintain fleet status --json \| jq -r '.members[] \| [.identity, .completeness] \| @tsv'` prints one line per member                            |
| A member exports only their own     | `maintain export --identity <id>` yields observation lines whose `observer` is that identity and no others                                       |
| A revoked grant stops harvesting    | delete the `harvest:` grant; the next job claim for that identity is refused (intent)                                                            |

## Open questions

- Whether an observation may be attributed to an identity that no longer holds the grant, and how a
  room renders history observed by someone who has left. The record keeps the row and keeps the
  attribution; whether the client shows the name is a client question (RFC-0017).
- Whether divergence should ever be resolved automatically - two observers disagreeing about a
  deleted post is common and harmless, and one about an edited post is not. UNKNOWN whether a
  threshold is defensible or whether every divergence must be a human decision.
- How a fleet's assignments are authored in bulk: one grant per member per source is explicit and
  tedious at fifty members. A template that expands into grants is a convenience this record does
  not decide, because a template that silently grants more than intended is the failure mode
  RFC-0014's grants exist to avoid.
- UNKNOWN whether the engine indexes a table by a compound key that includes an identity column
  cheaply enough for the observation lookup to stay a find rather than a scan. Spike: publish a
  local module with the new key and time 100,000 inserts.

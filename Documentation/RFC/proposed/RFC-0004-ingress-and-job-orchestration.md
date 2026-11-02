# RFC-0004 - Ingress and job orchestration

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the SpacetimeDB
module, the scraping worker, `store scrape` **Decision class:** architecture **Supersedes:** none
**Superseded by:** none **Task dependencies:** RFC-0001 (storage), RFC-0003 (transport)

## Decision

All work enters through the database, and the database owns the schedule.

- A `Job` table carries what to do, for which source, and a `ScheduleAt` column. A scheduled reducer
  fires when that time arrives.
- A `JobRun` table records each attempt: start, finish, outcome, error text.
- A worker process outside the module claims a due job, performs the browser work over the transport
  seam, and reports results by calling reducers.

The module schedules and records; the worker drives the browser. Nothing else decides when scraping
happens.

## Context

Scheduling currently lives in whatever invokes the CLI - a human, a cron entry, an agent turn - so
there is no durable record of what was attempted, no retry policy, and no way to observe a run
without reading a log file. SpacetimeDB already provides the primitives: scheduled reducers
(`ScheduleAt`), reusable submodules with cron-style and interval scheduling plus retry (v2.13.0),
and outbound HTTP from procedures (v2.10.2).

What it does not provide, as far as the module API shows, is an outbound WebSocket. Driving a
browser over CDP needs a long-lived socket to the debug port, so the browser work cannot live inside
a reducer or a procedure. That single constraint is why a worker remains.

## Alternatives considered

| Option                      | Why not chosen                                                      |
| --------------------------- | ------------------------------------------------------------------- |
| Cron invoking the CLI       | no durable record, no retry policy, no observable queue             |
| Reducer drives CDP directly | reducers cannot hold a socket; determinism forbids the side effects |
| Procedure drives CDP        | outbound HTTP is confirmed, WebSocket is not; revisit if it is      |
| External queue (Redis, SQS) | a second service to run, when the database already holds the state  |

## Consequences

- A scrape becomes an auditable object rather than a process exit code.
- Retries, backoff and circuit breaking move into the module, where they are transactional and
  visible.
- The worker must be idempotent: claiming a job twice must not double-write, which the
  content-derived observation keys already guarantee.
- A stopped worker means jobs accumulate, not that jobs are lost - the visible failure mode is a
  growing queue.

## Verification

| Claim                         | Test                                                                  |
| ----------------------------- | --------------------------------------------------------------------- |
| Jobs are durable              | stop the worker, enqueue three jobs, restart, all three run           |
| Retries are recorded          | force a failure, `JobRun` shows attempt 1 failed and attempt 2 ran    |
| Claiming is exclusive         | two workers started together do not both claim one job                |
| Work is idempotent            | replay a completed job; observation count is unchanged                |
| Scheduling is in the database | `select * from job` shows the next run time without any crontab entry |

## Open questions

- Whether a job may target a specific browser tab, or always opens its own.
- How a job's `max_runtime` interacts with a worker that hangs on a page.
- Whether procedures can reach CDP over WebSocket; if they can, the worker shrinks to a supervisor
  and this RFC is revisited.

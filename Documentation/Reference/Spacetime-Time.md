# Time in the Module

A reducer cannot read the host clock - that is what makes it replayable. So every time value in this
database comes from one of two places: the reducer context, or a caller. Keeping those apart is the
whole design.

## Four timestamps, three authorities

| Name          | Meaning                                 | Who produces it                            |
| ------------- | --------------------------------------- | ------------------------------------------ |
| `T_event`     | when the thing happened in the world    | the worker, from the page                  |
| `T_ingest`    | when the reducer accepted it            | the module, from the reducer context       |
| `T_scheduled` | when a scheduled run was **due**        | only if the row is persisted as a one-shot |
| `T_run`       | when the scheduled reducer actually ran | the module, from the reducer context       |

The module is authoritative for `T_ingest` and `T_run` and for nothing else. `T_event` is a claim by
the worker and needs provenance - which scrape, which page, which reading. `T_scheduled` is not
free: see intervals below.

## Three lags, none of them a physical duration

- **ingestion lag** = `T_ingest − T_event` - how stale the world was when we read it
- **scheduler lateness** = `T_run − T_scheduled` - how late the scheduler was
- **post-ingest delay** = `T_run − T_ingest` - how long the row waited inside

Each is a difference between timestamps that may come from different clock authorities. Wall-clock
adjustment can make any of them negative, and that is information, not an error to be clamped: store
the signed value, keep the provenance, and flag the anomaly.

## Intervals do not give you an occurrence

`ScheduleAt.Interval` stores the _interval_, so the schedule row does not tell you an absolute
`T_scheduled` for any particular run. Two consequences:

- If per-occurrence lateness must be auditable, persist intended occurrences - one-shot rows -
  rather than an interval.
- Never reconstruct `T_scheduled` as "previous actual run + interval". That reproduces the drift you
  are trying to measure.

Where an interval is acceptable, document the phase: how the first occurrence is chosen and what a
skipped tick means.

## Testing time without sleeping

Since 2.12.0 the module test utilities provide an in-memory datastore and a **controllable clock**;
in TypeScript the harness plus `test.clock.set` / `advance` supplies the reducer timestamp, starting
at the Unix epoch and moving only when the test moves it.

The harness stores scheduling rows but never fires timers, so a scheduled reducer is tested by
invoking it directly with its row at a clock time the test chose - covering just before, exactly at,
and after the deadline, plus a deliberately late invocation.

What that establishes is the reducer's _decision_ at a supplied time. It does not establish dispatch
timing, schedule-row lifecycle, missed-tick handling, or that the server clock is monotonic. Those
need a running server, and no assertion should depend on millisecond-exact wakeups.

## What this repository already does

`observation.at` is event time - the moment the reading was taken, supplied by the scraper, and the
reason replaying a scrape rewrites a row instead of appending a second one. `post.lastScrapedAt` is
the same claim at post level. Neither is a reducer clock reading, and neither should become one.

When the agentic layer adds tasks and leases, those carry the module's own `T_ingest`/`T_run`
values, and the difference between a lease's expiry and the clock at write time is the only honest
source of "time to execution".

## What the catalog tables carry

The six catalog tables - `capability`, `generation`, `lease`, `probe`, `belief`, `trace` - apply the
four names by one rule rather than by one column set, because a table that is not scheduled has no
due instant and a column invented for it would be a null pretending to be a fact.

- **A column belongs to exactly one authority.** No column holds a time whose producer depends on
  who wrote the row: a reader cannot recover that afterwards, and the lag it enables would be
  measuring two different things in one field.
- **A claim is paired with its receipt.** Where the writer states the instant - `probe.at`,
  `trace.at` - the same row carries `ingestedAt` from the reducer context, so the ingestion lag is
  `ingestedAt − at` and is computable from one row.
- **A module-produced instant stands alone.** `capability.declaredAt`, `generation.boundAt` and
  `lease.acquiredAt` are the reducer's own reading, so they carry no companion and have no ingestion
  lag to state; pairing them with an `ingestedAt` would be two columns for one instant.
  `lease.expiresAt` is not a fourth kind either: it is `acquiredAt` plus the granted ttl, a deadline
  the clock is compared against, so it belongs to no authority of its own.
- **A computed row has no event time.** `belief.at` is when the reducer derived the row. Nothing
  happened in the world, so there is no `T_event` for it to be late against, and inventing one would
  give a lag a meaning it does not have.
- **`T_scheduled` and `T_run` exist only on `trace`.** It is the one catalog table that can record a
  scheduled run. Both columns are optional, and absent is the honest value for a row that was never
  scheduled - not zero, and never the previous run plus the interval.

The three lags are therefore differences a reader computes, not columns: an ingestion lag on `probe`
and on `trace`, and on `trace` a scheduler lateness (`ranAt − scheduledAt`) and a post-ingest delay
(`ranAt − ingestedAt`). Where a lag is stored at all it is stored signed, because a wall clock that
stepped makes any of them negative and clamping it to zero deletes the only evidence that it
happened.

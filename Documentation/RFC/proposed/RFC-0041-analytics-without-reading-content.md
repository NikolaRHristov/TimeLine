# RFC-0041 - Analytics without reading content

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the countable set, the
published aggregate, the suppression floor **Decision class:** policy **Supersedes:** none
**Superseded by:** none **Task dependencies:** RFC-0007 (the module reads the envelope), RFC-0016 §4
(the host's enumeration is not analytics), RFC-0021 §5 (completeness per identity), RFC-0035 §7 (no
read receipts); implementing card to be created: "Room metrics view and the cohort floor"

## Decision

What is measured is envelopes, and the aggregate is published to the room that produced it - never
to the operator alone.

1. **The countable set is envelope columns.** Rows by audience, by action class and by action;
   envelope sizes; the interval between a row's acceptance and its first propagation
   acknowledgement; membership and grant changes; vote records, because a vote is a row (RFC-0017,
   RFC-0027 §2); and observation completeness per identity (RFC-0021 §5). Every one is derived from
   RFC-0007's cleartext field table.
2. **What is deliberately not measured.** Content topics, sentiment, keywords, per-post read counts,
   per-identity behavioural sequences, dwell time and click-through. Each is either unreadable
   (anything in the payload) or a row that does not exist - a read is not a write, and RFC-0035 §7
   already refuses to invent a read event because the host would see it.
3. **An aggregate is computed where the key is.** A room-level count over envelope fields is
   computed by the module, which holds the envelope. A count that needs content - how many posts
   mention something - is computable only by a client holding the epoch, and is then that client's
   local number and not a service metric. The two are never merged into one figure, because a figure
   computed in two places cannot be audited.
4. **The aggregate belongs to the room and is published in it.** A room's counts are rows the room
   may read, delivered by a per-member view (RFC-0025 §5), so every member sees the same numbers the
   host sees. The host's own view is RFC-0016 §4's enumeration - metadata it already has by running
   the database - and calling that analytics would be renaming an observation as a product.
5. **A metric that would identify a person is not published.** With five members, "posts per member"
   is a person, not a statistic. The floor is a minimum cohort size below which an aggregate is
   suppressed
    - a room term (RFC-0011) - and the suppression appears as a suppressed cell rather than a
      missing row, so a reader can tell "too few to publish" from "nothing happened".
6. **Engagement is counted as acts, not as attention.** A vote, a reply, a propagation and an export
   all leave rows. Attention does not leave a row, and this system chooses not to manufacture one,
   which is what lets it claim it does not profile.
7. **Every published metric names its predicate**, by the same rule RFC-0039 §7 applies to a bill: a
   number without its query is not a measurement, and an unmeasurable number is not published.

## Context

The specification asks for analytics in a system whose central claim is that the host cannot read.
The answer has to come from what is visible, and RFC-0007's table is short: identity, audience,
action class and target, timestamp, nonce, size, signature. That is enough to count acts, volumes,
rates and reciprocity - and not enough to say anything about what a post is about.

The engine's shapes constrain where counting can happen. A per-user view delivers rows the viewer
may read (`AGENTS.md:617`), so a room's metrics can be a view like any other; a private table is
readable by reducers and the database owner (`AGENTS.md:46`), so the host can always read a metric
table even if no client can. That asymmetry is why rule 4 publishes the same numbers rather than
keeping a private dashboard.

The small-room case is the hard one and it is already load-bearing elsewhere in the set. RFC-0027 §2
displays a vote aggregate plus a count of voters, because an average hides whether one person or a
hundred voted - the same reasoning applies here: with five members, any per-member figure is a
reconstruction of a person's behaviour.

## Alternatives considered

| Option                                     | Why not chosen                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Server-side content analytics              | requires a plaintext projection, which is a second copy of the content the host promised not to read (RFC-0007, RFC-0029 §4)    |
| Read receipts to count engagement          | manufactures a traffic record the host sees and changes how people behave; RFC-0035 §7 already refuses it                       |
| A private operator dashboard over metadata | the host has the metadata either way; publishing the same figures to the room is what makes them checkable rather than asserted |
| Per-member dashboards                      | with five members a per-member figure is a person, and no consent model in the set covers that                                  |
| Sampling client behaviour with telemetry   | telemetry is a channel the member did not ask for and the host cannot scope to an audience (RFC-0016 §4)                        |
| Publishing every count with no floor       | a suppressed cell is information too; the floor and the visible suppression are the compromise the set can defend               |

## Consequences

- The product's analytics story is thin by design: counts of acts, volumes and reciprocity, and
  nothing about meaning. A growth team would find it insufficient and a privacy claim requires it.
- Publishing the room's metrics to the room means the operator cannot quietly hold a better picture
  than its members. That is the point, and it also means a member can check the operator's claims.
- The cohort floor is a room term, so a room can set it to one and publish per-person figures. The
  decision is the room's, which is consistent with RFC-0027 §7 giving the room its own powers.
- Suppression makes a small room's metrics nearly useless, which is correct: a five-person room does
  not have statistics, it has people.
- Every metric is a new predicate and therefore a protocol change (RFC-0034), so the metric set
  grows deliberately rather than by adding a dashboard field.

## Verification

| Claim                                    | Test                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| No metric reads a payload column         | inspect each metric's predicate; none references a ciphertext column (RFC-0007, intent)                              |
| The room sees what the host sees         | compare the metrics view's output with the host's own count for the same room; they match (intent)                   |
| A small cohort is suppressed             | set the floor to three in a two-member fixture room; the cell reads suppressed and the row still exists (intent)     |
| No read event exists in the schema       | `spacetime describe <room> tables --json` lists no read, view or impression table (RFC-0035 §7, intent)              |
| A vote is counted as a row               | nominate twice in a fixture room; the vote count is two and the voter count is two (RFC-0017, RFC-0027 §2)           |
| Completeness is per identity, not a mean | leave one fixture identity with no observations; the room's completeness reads that identity's minimum (RFC-0021 §5) |

## Open questions

- Whether a metric should be signed by the module, so a member can prove what the room reported at a
  given time. A view is computed on read, so a signed metric would be a stored row and a retention
  question of its own (RFC-0028).
- Whether the operator may compute fleet-wide aggregates across rooms it hosts, where every room's
  contribution is above the floor but the combined figure could isolate a small room. The floor is
  per room and the composition problem is real, and nothing in this record addresses it.
- Whether "engagement" should include an export. It is an act and it leaves a row, but counting
  exports turns a privacy action into a metric, which is the one measurement that might make a
  member hesitate.
- Whether a view can return an aggregate without materialising every row it counts. A procedural
  view reads through `ctx.db` and returns a materialised value (`AGENTS.md:617`), so a count over a
  large table is a full scan per read; whether the engine pushes a count down is UNKNOWN. Spike:
  time the metrics view against a table of a million rows and compare with `spacetime sql` on the
  same count.

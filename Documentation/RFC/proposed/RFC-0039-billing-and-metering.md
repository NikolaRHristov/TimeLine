---
title: Billing and metering
rfc: 0039
category: Policy/Economy
kind: rfc
date: 2026-11-02
status: proposed
horizon: next
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: the meter, the room's bill, the cap, the invite price
supersedes: none
superseded_by: none
depends:
    - "RFC-0016 §1 (the unit model is published)"
    - "RFC-0027 §6 (the paid product is hosting, never content)"
    - "RFC-0032 §5 (exhaustion degrades)"
    - |-
        RFC-0005 (the tenancy unit is the database); implementing card to be created: "Meter rows and the room bill view"
statuses:
    - name: Five meters, all envelope
      state: open
      evidence: the rule names no file or command
    - name: Content is never metered
      state: open
      evidence: the rule names no file or command
    - name: A room is priced, not a person
      state: open
      evidence: the rule names no file or command
    - name: The bill shows units, price and headroom
      state: open
      evidence: the rule names no file or command
    - name: Cap behaviour is degrade, never destroy
      state: open
      evidence: the rule names no file or command
    - name: An invitation has a price
      state: open
      evidence: the rule names no file or command
    - name: Every line item names the query that produced it
      state: open
      evidence: the rule names no file or command
---

## Decision

What is metered is what the host can count without reading - rows, bytes, time, identities and
invocations. A bill names units, a price and a cap, and reaching the cap degrades the room rather
than deleting it.

1. **Five meters, all envelope.** Rows written, stored bytes over time, monthly active identities,
   reducer invocations and egress bytes. Every one is counted from envelope columns or the engine's
   own counters (RFC-0016 §1 names the same four dimensions), and none needs a payload (RFC-0007).
2. **Content is never metered.** Not per post, not per read, not per member's read. RFC-0027 §6
   already fixes that the paid product is hosting and that content is never sold or held hostage;
   this record makes that operable by giving the meter a list that contains no content dimension.
3. **A room is priced, not a person.** One room, one bill, one unit set, because the tenancy unit is
   the database (RFC-0005, RFC-0016). Members are not billed and their exports cost nothing, which
   is what keeps exit free in practice as well as in policy.
4. **The bill shows units, price and headroom.** Each meter appears as a line with quantity, unit
   price and total, and the cap appears as a number the room's authority sets with the remaining
   headroom beside it. A member of the room may read the bill, because the room pays and RFC-0027 §7
   gives a room's authority - not the operator - the powers inside a room.
5. **Cap behaviour is degrade, never destroy.** At the cap, writes are refused with
   `quota-exhausted` (RFC-0032 §6), reads continue, nothing is deleted, and the export stays free
   (RFC-0015). At the cap plus a grace window the room is suspended (RFC-0014's `suspended` state,
   RFC-0016 §5) with the export window running. A bill never causes a row to be dropped, because a
   room that deletes to fit a bill has destroyed the thing the bill was pricing.
6. **An invitation has a price.** A membership row is a metered row, so an invitation costs the room
   a membership-month. That is what makes RFC-0032 §3's sybil cost real rather than theoretical: an
   attacker pays the same price a member's seat does, per identity, per room, per month.
7. **Every line item names the query that produced it.** Each meter states the table and predicate
   it counts, so a room can recompute its own bill from an export (RFC-0015) and dispute a line with
   a number instead of an opinion. A meter whose query is not published is not a meter.

## Context

The unit model is already published in RFC-0016 §1 as rows x row size, plus storage, plus monthly
active identities, plus reducer invocations, with the prices published beside the units. What that
record does not decide is the operational half: how the numbers are read, what a room sees, and what
happens at the edge.

The edge is the part that matters for this product. Everywhere else, a provider at a billing limit
suspends an account and the data sits there; here the data is unreadable, so the member's only
guarantee is the export - and RFC-0027 §6 already promises that exit is free. Degrading to read-only
is the reading that keeps both promises: the room is still there, the export still works, and the
operator is still owed.

The engine's own costs are a separate question this record does not answer. The README's research
notes that `spacetime.com/space-race` names 2,500 TeV per referral and a monthly free energy for a
Maincloud account, which is a price signal without a per-database counter; nothing read describes
how a database's energy consumption is observable. That is left open below rather than guessed.

## Alternatives considered

| Option                                        | Why not chosen                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Price per post or per message                 | a content meter is a meter that reads content, and RFC-0027 §6 forbids selling content                                     |
| Price per member seat                         | a seat price punishes a room for being a room; the database is the tenancy unit (RFC-0005)                                 |
| Suspend immediately at the cap                | takes away reads from people who did nothing wrong and makes the export the only thing left; degrade first, suspend later  |
| Delete the oldest rows to stay inside a quota | destroys the archive the product exists to keep, and does it silently                                                      |
| A free tier with no cap                       | RFC-0016 §1 refuses a free-tier claim without a number beside it                                                           |
| Bill each member through the host             | splits the payer from the room that made the cost, and gives the host a relationship with a person it has no contract with |

## Consequences

- A room's authority is its treasurer, so a room that cannot collect from its members cannot stay
  hosted. That is a real governance burden the product imposes and it follows from pricing the room.
- Read-only degradation makes a billing failure look like a moderation act to a member who does not
  read the bill, so the room's state has to say which one it is - a named code, not a grey banner.
- Publishing the meter query makes the bill auditable and makes a pricing change visible, which is
  the same property RFC-0016 §1 wants for unit prices.
- Membership-month pricing ties RFC-0032's sybil defence to the bill, so an invitation is expensive
  in exactly the currency an attacker has to spend.
- The engine's own energy cost is a cost of goods the operator carries and cannot attribute per room
  until the open question below is settled.

## Verification

| Claim                                 | Test                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Every meter is envelope-only          | inspect each meter's query; no predicate reads a payload column (RFC-0007, intent)                                                          |
| A bill is reproducible from an export | recompute each line from an RFC-0015 export and compare with the host's bill; the totals match (intent)                                     |
| The cap degrades rather than deletes  | fill a fixture room past its cap; writes refuse with `quota-exhausted`, every prior row still reads, and the export completes (RFC-0032 §5) |
| A member can read the room's bill     | query the bill view as a member with no authority role; the lines and the cap are returned (intent)                                         |
| An invitation is metered              | accept an invitation in a fixture room; the membership-month line increases by one (RFC-0032 §6, intent)                                    |
| Suspension follows the grace window   | hold a room at the cap past the window; the room's state reads `suspended` and the export still completes (RFC-0014, RFC-0016 §5)           |

## Open questions

- What the engine itself charges per database, and whether that figure is observable through the CLI
  or the host's dashboard. The only numbers read are a referral reward and a monthly free energy
  (`spacetime.com/space-race`, recorded in the index's research table); no per-database counter is
  documented. UNKNOWN. Spike: read a local database's energy from the CLI, then compare with the
  dashboard for the same database.
- Whether a room's cap should be set by its authority, by the payer, or by both. A room whose
  authority is not its payer can spend someone else's money up to a cap that person set, and the set
  has no vocabulary for that split.
- Whether storage-time should be metered per row-age or as an average, which differ by orders of
  magnitude for a room that archives and never deletes.
- Whether an unpaid bill should ever reach the data. Rule 5 says no, which means an abandoned room
  occupies a host indefinitely - and what happens to it after a very long time is a retention
  question RFC-0028 does not answer.

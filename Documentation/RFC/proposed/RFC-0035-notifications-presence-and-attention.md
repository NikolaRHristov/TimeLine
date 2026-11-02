# RFC-0035 - Notifications, presence and attention

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the client's attention
layer, presence rows, digests **Decision class:** product **Supersedes:** none **Superseded by:**
none **Task dependencies:** RFC-0025 §5 (live rows are a per-member view), RFC-0007 (the host cannot
compose a message), RFC-0016 §4 (what the host observes), RFC-0011 (attention terms); implementing
card to be created: "Attention budget and the derived digest"

## Decision

The host never sends a notification, because it cannot compose one. Attention is derived on the
client from rows the member may read, and presence is a grant rather than a broadcast.

1. **Presence is a permission.** A presence row is audience-scoped like any other row (RFC-0025 §5):
   a member publishes presence to a declared audience or not at all. A member without the grant sees
   nothing, and the client says the room does not broadcast presence - not that everyone is away,
   because those two states are indistinguishable to the reader and only one of them is true.
2. **A notification is derived, never pushed.** The client watches the rows it may read through a
   subscription (RFC-0025 §5) and decides what deserves attention. The host cannot compose a
   notification because it cannot read the event (RFC-0007), and a push service that could would be
   either a second reader or a metadata leak beyond RFC-0016 §4's enumeration.
3. **Notification classes are envelope facts.** A new row by an author the member follows, a reply
   to the member's row (`replyTo`), a grant change naming the member, a redaction naming the
   member's row, an appeal deadline. Every one is derivable from cleartext fields (RFC-0007's
   table), so the attention layer never needs the text to decide that something happened.
4. **A small room has a budget, not a stream.** The default is one digest per room per day, with
   immediate delivery reserved for a row addressed to the member personally - a reply to their row,
   a grant naming them, a redaction of their row. A member may raise a room to immediate; a room may
   set a floor. Both are room terms (RFC-0011), so the trade is visible where it is made.
5. **A digest is a count and a list of envelope lines.** It renders from metadata alone, and expands
   into text locally when the member holds the epoch. This is what makes a digest possible for a
   five-person room without the host reading five people's messages.
6. **Silence is a state that is shown.** A room with nothing new says so, rather than showing a
   badge that never clears. RFC-0017 already requires a queued write to surface as a named failure
   rather than disappear; the same rule applies to a missed notification, which is the same failure
   with a different cause.
7. **Three things are deliberately not built.** Read receipts, because a row per read is a traffic
   record the host sees and it changes how people behave. Typing indicators, because they are an
   ephemeral broadcast with no audience row to inherit visibility from. A server-side unread
   counter, because it is a per-member counter the host can read and therefore a presence signal for
   someone who chose not to publish presence.

## Context

The live layer is already decided and it constrains this record completely. RFC-0025 §5 makes a live
room an event table plus a per-member view, and names presence as one of the things that travels
that way. What it does not decide is whether presence is published at all, or what a member is told.

The engine's delivery shapes rule out the obvious design. An event table delivers only to `onInsert`
callbacks and keeps nothing in the client cache (`AGENTS.md:68`), so it cannot carry a backlog; a
per-user view delivers the rows it returns and drops them when a dependency row is deleted
(`AGENTS.md:617`), so it can carry a backlog but only for rows the member may read. A notification
about a row the member cannot read would have to come from the host, and the host has nothing to put
in it.

Notification fatigue is the specification's own concern for a small room. With five people, every
row is from someone the member knows, so a per-row alert is five times louder than the same design
in a large room - the budget is a product answer to a scale fact, not a preference.

## Alternatives considered

| Option                                    | Why not chosen                                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Host-composed push notifications          | the host cannot read the event, so the notification would carry either nothing or metadata it should not amplify (RFC-0007)      |
| Presence broadcast to the room by default | presence is a disclosure; RFC-0014's join-without-seeing establishes that visibility is granted, not defaulted                   |
| One alert per row                         | five people produce a stream that reads as noise, and the member's answer is to mute the room, which loses the important row too |
| A server-side unread counter              | a per-member counter the host reads is a presence signal for a member who chose not to publish presence                          |
| Email or web-push as the delivery path    | both require the host to hold an address and a body, and the body would have to be content the host cannot read                  |
| Typing indicators                         | an ephemeral broadcast that no audience row can scope, so it leaks activity timing the room did not grant (RFC-0016 §4)          |

## Consequences

- A member only learns about something when their client is running or on next launch, so this
  system cannot alert someone who is away. That is a real product limitation and it follows directly
  from the host not reading.
- The attention layer is client code, so two clients may disagree about what is unread. Since unread
  state is local by rule 7, disagreement is expected and each device is right about itself.
- A digest is cheap to build and cheap to read, so the default is a low-cost state rather than an
  opt-in; a member who wants immediacy pays for it in noise, which is the correct default direction.
- Presence as a grant means a room can be quiet by design, so a five-person room's default
  experience is a page that does not claim to know where anyone is.
- Every notification class is a new cleartext predicate, so adding one is a protocol change
  (RFC-0034) and not a client-only release.

## Verification

| Claim                             | Test                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Presence requires a grant         | join a fixture room with `grant = none`; no presence row arrives and the empty state says presence is not broadcast (intent)                 |
| The host sends no notification    | inspect the module's exports for any push, mail or webhook procedure; none exists outside a declared egress (RFC-0022 §2, intent)            |
| A digest renders from metadata    | render the daily digest for a fixture room without any epoch; counts and envelope lines appear and no text does (intent)                     |
| Personal rows arrive immediately  | post a reply to a member's row; that member's client shows it before the digest window (intent)                                              |
| A room's floor overrides a member | set a room's minimum interval and a member's preference to immediate; the member's effective interval is the room's floor (RFC-0011, intent) |
| No read receipt row exists        | `spacetime describe <room> tables --json` lists no read, seen or unread table (intent)                                                       |

## Open questions

- Whether a member should be able to publish presence to a narrower audience than the room's
  default, per contact. RFC-0012's tiers are per type, not per person, so a per-contact presence
  would need a new audience shape - and that shape would be the first per-person visibility rule in
  the set.
- Whether the digest should be signed by the client that produced it. A digest is local, so signing
  it adds nothing for the member and something for a member who wants to prove what they were told.
- Whether an attention budget should be per room or global. A global budget protects the person; a
  per-room budget protects the room. With many small rooms the global reading is the one a person
  wants and the per-room one is what a room can set, so the two need a rule this record does not
  give.

# Effects and State - what belongs in the database, and what belongs in a process

Two questions arrive the moment a pipeline grows a scheduler: which part of a new behaviour belongs
in a table, and which part belongs in the process that is running. This file answers both, and then
states the rule that stops the answer being undone by the order in which two processes act.

None of it is new policy. The archive has followed it since its first scrape - `observe` is the only
path that writes a post - and the catalog tables were declared with the columns this file argues
for. What is new is writing it down before a scheduler makes the question urgent.

---

## The question

Ask one thing about any new piece of behaviour: **does it touch the outside world?**

A socket, a browser process, a file on disk, a DOM evaluation - that is an **effect**. It lives in
the process that owns the transport, and nowhere else.

A decision, a phase, a counter, a lease, a retry, a cancellation request, or the record of any of
them - that is **state**. It lives in a table, changed by a reducer, and nowhere else.

The test is not importance, frequency or speed. A scrape that runs once a week is still an effect; a
`pending` flag that changes a thousand times a second is still state. The only question is whether
the thing has an observable effect outside the database.

Three examples settle it.

- **A scrape** navigates a tab, scrolls it and reads the DOM. Every part of that is a socket and a
  page, so a scrape is an effect end to end. The posts it produced are state, but the act of reading
  them is not.
- **A render** reads `Source/Content/` and writes `Target/`. The site build is a filesystem effect
  with no database in it at all, which is why the build never imports the tool layer and why a
  published record has to exist as a file before the site can show it.
- **A publish** decides that one post may be public, writes the post's file into the public
  collection, and calls the reducer that records the change. The decision is state, the file write
  is an effect, and the two are ordered by the command rather than by the database.

---

## The rule for effects

**An effect belongs to the process that owns the transport.** One owner per transport, because a
second process reaching for the same socket is a second writer with a second set of retry rules, and
neither can tell what the other already sent.

Where effects already live here:

- **`Maintain/Source/Browser/CDP/Client.ts`** holds the connection. It is the only file in the
  repository that opens one; everything else that reads a page goes through it.
- **`Maintain/Source/Transport/CDP/Transport.ts`** is the only file that knows both halves - the
  command surface above and the browser below - which is what makes it the seam rather than a
  convenience wrapper.
- **`Maintain/Source/Browser/Session/Scrape.ts`** navigates, scrolls and evaluates. It is the page
  read itself, and it returns a value rather than writing one.
- **`Maintain/Source/Store/Public/Public.ts`** writes into `Source/Content/`. That is a filesystem
  effect, and it is confined to the two commands allowed to publish.

A reducer cannot make a network or filesystem call. That is not a limitation to route around - it is
what makes a reducer replayable, and it is why a separate process exists at all. The database can
record that a browser tab is claimed; only the process holding the socket can prove it is alive.

---

## The rule for state

**State is a row, and one path writes it.** The archive is the precedent, not an exception.

- **`observe` in `Maintain/Spacetime/spacetimedb/src/index.ts`** is the single reducer that writes a
  post. Four commands call it - `store push`, `store publish`, `store hide` and the ingest run - and
  none of them writes a post row itself.
- **Observations and events are append-only, keyed by content.** An observation's id is
  `<postId>:<source>:<at>:<action>`, so replaying a scrape rewrites the same row instead of
  appending a second one.
- **`visibility` is the only field that decides what may reach the public site.** It is a value in a
  row, not a judgement made again at build time.
- **The file store states the same discipline.** `Maintain/Source/Store/Shadow/Shadow.ts` is
  merge-only for posts and append-only for observations, and `store hide` writes a tombstone rather
  than deleting, so a later scrape folds it back instead of resurrecting the post.

The reason is not tidiness. A second write path is a second set of rules waiting to disagree with
the first: one path grows a default the other does not, and the disagreement surfaces months later
as a row nobody can explain. `store publish` shows the alternative in practice - it decides, then
calls `observe` with `visibility: "public"`, so a published row and a scraped row cannot end up with
different shapes.

---

## The straddle: a scrape is three things

A scrape is the case that makes the rule hard, because it is all three at once.

1. **A decision.** Which source, which tab, which limit, and whether this resource is already being
   read. That is state. Today it is carried in the command's flags and forgotten when the process
   exits.
2. **A page read.** Navigation, scrolling, DOM evaluation. That is an effect, and it belongs to the
   process that owns the connection.
3. **A write.** The post row and its observation lines. That is state, and it goes through
   `observe`.

Split it into two transactions, with the gap between them visible as a held lease.

- **Transaction one: claim.** The scheduler asks the database for the resource. The reducer grants
  it only when no live lease holds it, and writes the row that says who holds it, when the grant was
  accepted and when it expires. Commit.
- **The gap: read the page.** The socket opens, the tab scrolls, the DOM is evaluated, the socket
  closes. The database knows a lease is held; it cannot know whether the process holding it is still
  alive. That ignorance is the honest boundary, not a defect to paper over.
- **Transaction two: write.** The rows go in through `observe`, carrying the lease and the fence
  they were granted under. Commit.
- **Release.** A release marks the lease released; nothing deletes. Two grants over one resource
  stay tellable apart, which is what makes a late write identifiable rather than merely wrong.

One transaction is not an option. A reducer cannot hold a socket open across a transaction, and a
transaction held open across a page read would make every reader wait on the network. The lease is
what the design buys in exchange for the gap: an interval the database can describe even though it
cannot observe it.

The `lease` table in `Maintain/Spacetime/spacetimedb/src/Schema.ts` already carries the columns this
needs - `resource`, `holder`, `fence`, `acquiredAt`, `expiresAt`, `state`. No reducer reads or
writes it yet. This section states the shape those reducers must take, not a behaviour that exists;
the columns are the only part that can be pointed at today.

---

## The destination is the guarantee

A check performed before an effect runs says nothing about the instant it writes. The caller can
verify that its lease is live, open the socket, and then spend four seconds on a page while a
takeover happens. The write that lands afterwards was authorised by a lease that no longer exists.

**The guarantee is the reducer, not the caller: every write that arrives after an effect must carry
the lease and the fence it was authorised under, and the reducer that records it compares that fence
against the live one and refuses the row - so an effect admitted while a lease was live cannot land
after the lease ended.**

For a database whose reducers are the only writers, that means four things.

- **The fence travels as an argument.** The write names the resource, the lease id and the fence. It
  does not name them as provenance for a log line; it names them as the terms of its own admission.
- **The reducer re-reads the table.** The comparison happens inside the transaction that writes the
  row, against the lease row as it stands at that moment. It cannot be against a value the caller
  passed as "the live fence", because a caller that could state the live fence could state any
  fence.
- **A stale write is refused with a name, and the refusal is recorded.** `trace` is the one place a
  refused write still leaves a mark. Dropping it silently would leave the archive unable to tell a
  late write that was refused from one that never arrived.
- **Expiry is a comparison, never a column a timer maintains.** A lease stays `held` with a past
  `expiresAt`; whether it is live is the reducer's clock compared to that column. The difference
  between the expiry and the clock at write time is the only honest source of time to execution, as
  `Documentation/Reference/Spacetime-Time.md` states.

The alternative - a caller that checks and a reducer that trusts - is a design where the check and
the write are separated by exactly the interval the check was meant to cover.

---

## What it rules out

- **A second scheduler in the process.** A timer that decides what to scrape next is state held in a
  process: a restart loses it, and two processes disagree about what is due. The schedule belongs in
  a table, where it is a row a reducer reads; the process only executes what the row says.
- **A dashboard that polls a REST projection.** A polled projection is a second read path with its
  own staleness, and any write it triggers arrives without the fence of the moment it was read - so
  the dashboard reports a state that was already gone when the click landed. Subscribe to the table,
  or call a reducer that re-reads and decides.
- **State that exists only in a process and is synced later.** An in-memory queue, a counter in a
  module variable, a `pending` map that is flushed at the end. If the process dies, the record of
  what was attempted dies with it, and the archive cannot tell a job that never started from one
  that ran and was lost. A write that matters is committed before the effect it describes, not after
  it.

---

## Claim → test

| Claim                                   | Test                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| The connection has one owner            | `grep -rln "WebSocket" Maintain/Source` → `Maintain/Source/Browser/CDP/Client.ts` alone                  |
| `observe` is the only post writer       | `grep -n "ctx\.db\.post" Maintain/Spacetime/spacetimedb/src/index.ts` → three hits, all inside `observe` |
| Every caller uses that one reducer      | `grep -rln '"observe"' Maintain/Source` → four commands, one reducer                                     |
| Reducers cannot reach the outside world | `grep -nE "fetch\|node:fs\|node:http" Maintain/Spacetime/spacetimedb/src/index.ts` → no hits             |
| Observation ids are content-derived     | `grep -n "observationId" Maintain/Spacetime/spacetimedb/src/index.ts` → one template literal             |
| The lease table is declared, unwritten  | `grep -n "ctx\.db\.lease" Maintain/Spacetime/spacetimedb/src/index.ts` → no hits                         |
| Publish is a projection, not a writer   | `grep -n "client.call" Maintain/Source/Command/Store/Publish/Publish.ts` → one call, to `observe`        |

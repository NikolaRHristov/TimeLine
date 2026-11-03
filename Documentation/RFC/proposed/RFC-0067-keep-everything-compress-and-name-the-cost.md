# RFC-0067 - Keep everything, compress, and name the cost

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the shadow store's
layout, the compression codec, payload deduplication, the cost statement **Kind:** policy
**Subject:** data **Horizon:** now **Supersedes:** none **Superseded by:** none **Task
dependencies:** RFC-0001 (the store is the authority and never loses history), RFC-0028 (the room's
retention, which this record does not touch), RFC-0039 (what a room pays, kept separate from what a
member pays), RFC-0059 (the duplicates that make deduplication worth doing), RFC-0015 (the export,
which stays uncompressed); implementing card to be created: "Store codec, payload area and the cost
view"

## Decision

The archive is never tiered by age and never deleted to save space. It is compressed at rest,
deduplicated by content, and its growth is stated to the member as a measured rate rather than a
quota.

1. **No age tiering of the archive.** RFC-0028's retention windows govern a _room_; they never
   govern the member's own store, which is the authority (RFC-0001). An archive that moves its
   oldest records to a cold tier is an archive whose oldest records are unavailable when someone
   asks, and the oldest records are the reason an archive exists.
2. **Compression is a codec with a version, applied per record.** Records are compressed with a
   declared codec and level, recorded per file, and readable by any client that reads the store. The
   codec is part of the store's format version (RFC-0034), so a codec change is a migration rather
   than a surprise.
3. **Deduplication is by content hash, and it is exact.** Two records with the same bytes are stored
   once with two references. RFC-0059's cross-room duplicates are the common case: a post in five
   rooms is one payload and five rows. Deduplication is content-addressed and never heuristic,
   because a near-duplicate merge would silently join two people's words.
4. **The media half is separate and is the expensive half.** Text compresses well and is small;
   media does not and is not. Media is stored by content hash once, referenced by every record that
   uses it, and may be kept as a reference only (RFC-0062 §4) when the member chooses not to keep
   bytes. The choice is per store, recorded, and reversible only by re-fetching.
5. **Growth is a measured rate, not a quota.** `maintain store cost` reports bytes now, bytes per
   month over the trailing window, and the projected year - three numbers a member can act on. There
   is no cap: a cap on an archive is a deletion policy with a nicer name.
6. **The cost statement separates what the member pays from what a room pays.** A member's store is
   local disk and costs them nothing but their own hardware. A room's rows are the host's units
   (RFC-0039) and the room's bill. One number that mixes them tells a member their archive is
   expensive when the expense belongs to a room they may not pay for.
7. **A member is told what keeping everything costs before they choose it.** At keystore creation
   (RFC-0057) and in the cost view the statement is: text is negligible, media is the archive, and
   the archive is the only complete copy (RFC-0001). A person who deletes media has chosen a thinner
   archive, and the client says so once.
8. **Compression and deduplication are invisible to every other record.** RFC-0015's export is
   uncompressed JSONL regardless of the store's codec, so an export stays readable by anything and
   the store's internal economy never becomes a compatibility surface. This is the rule that keeps
   the economics from becoming a format.

## Context

The archive grows forever by design: RFC-0001 makes the store the only complete history, RFC-0028 §3
keeps the last good snapshot of a post the source deleted, and RFC-0059 stores a copy per room.
Nothing in the set says what that costs or how it stays affordable, and the topic asks the question
directly.

What exists is small, flat and uncompressed. `du -sh Maintain/Storage/Shadow` prints 1.9M for 209
post files plus `Observation.jsonl`, `Index.json` and an `Event/` directory - one JSON object per
status id, no codec and no shared payload area. The engine's own compression is unavailable as well:
the features board listed ZSTD for websocket messages as a _request_ rather than a capability (the
index's research table records it), so nothing at the transport layer will compress this for free.

The other half of the context is the distinction this record draws. A room's retention is a policy
about what a community keeps (RFC-0028); a member's archive is a policy about what a person keeps,
and the two answer to different owners. Merging them would make the operator's retention term decide
how long a member's own history lasts, which is the shape of every product that deletes a user's
data to fit a quota.

## Alternatives considered

| Option                            | Why not chosen                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Delete old records after a window | the archive's purpose is the record nobody else kept (RFC-0028 §3); a window here is a retention policy on the authority |
| Tier by access frequency          | a local-first archive has no second copy to fetch from, so a cold tier is a slower read of the same disk                 |
| One compressed archive file       | no per-record access, no per-record integrity, and one bad byte costs the archive                                        |
| Compress the export too           | the export is the interop surface (RFC-0061) and must stay readable; the store's codec is an implementation detail       |
| A member quota                    | a quota is a deletion policy, and RFC-0039 §5 already refuses to delete to fit a bill                                    |
| Deduplicate by similarity         | joining two people's nearly identical posts is a silent rewrite of who said what                                         |
| Store media bytes always          | the store then grows by gigabytes of someone else's CDN, and a takedown there becomes a takedown here                    |

## Consequences

- The store's format gains a codec field and a content-addressed payload area, which is a migration
  of every existing record and the first schema change the store has had.
- Deduplication makes the file layout differ from the logical layout, so a person browsing
  `Maintain/Storage/Shadow/Post/` sees references and a human-readable index becomes necessary.
- A media-reference-only store is much smaller and cannot answer "what did that post look like"
  after the CDN drops it, so the choice is real and the cost view has to make it legible.
- The three-number cost view needs a trailing window, so the store records its own size over time -
  a small log about the store, and the first thing in the store that is about the store.
- Because the export ignores the codec, the compression gain is invisible to anyone receiving an
  export, which is exactly the point and also means a member cannot tell how much they saved by
  exporting.

## Verification

| Claim                            | Test                                                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| The archive is not tiered        | `maintain store verify` (RFC-0065) reads every record, including the oldest, with no fetch step (intent)                                           |
| Compression is recorded          | `jq -r .codec` on a stored record prints the codec and level (intent)                                                                              |
| Deduplication is exact           | store the same post in five fixture rooms; one payload blob and five references (intent)                                                           |
| Media is stored once             | two records with the same media hash produce one blob and two references (intent)                                                                  |
| Growth is measured               | `maintain store cost --json` prints `bytesNow`, `bytesPerMonth` and `projectedYear` (intent)                                                       |
| The two costs are separate       | the cost view names the member's local bytes and the room's bill as two lines, and a store with no room still reports the first (RFC-0039, intent) |
| The export ignores the codec     | export a compressed store; `unzip -p export.zip Payload.jsonl \| head -1` is plain JSON (RFC-0015, intent)                                         |
| Nothing is deleted to save space | fill a store past any configured size and confirm every record still reads (review rule)                                                           |

## Open questions

- Whether the store should deduplicate media by default as well as text. Media deduplication is the
  whole saving and it makes the layout unrecognisable to a person who browses it.
- Whether the cost view should project from the trailing month or from the archive's whole history.
  A trailing month reacts to a scrape; a whole history hides a change in behaviour.
- Whether compression should apply to the observation log, which is append-only and compresses well
  but must stay appendable - a compressed append-only log needs a chunked format.
- UNKNOWN how much a typical archive actually compresses. The record assumes text compresses well
  and does not measure it; the first implementation should record the ratio before a default codec
  is fixed.

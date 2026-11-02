# RFC-0062 - An import is an archive, not an account

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the adapter, the
ingest seam, the five-file format's foreign case **Decision class:** architecture **Supersedes:**
none **Superseded by:** none **Task dependencies:** RFC-0015 (the adapter and the five files; this
record extends it and does not restate the format), RFC-0006 (the harvesting posture an import stays
outside of), RFC-0040 (ordering applies to rows this system accepted), RFC-0028 §3 (a gone source is
a mark, not a delete), RFC-0060 §4 (`signature: null` as a chain with no head); implementing card to
be created: "Archive adapter and the fidelity manifest"

## Decision

Foreign content arrives as a data-export archive read as a file, never as a live account scraped by
the tool layer. The adapter translates an archive into RFC-0015's five files and states, in the
manifest, what the archive did not contain.

1. **The input is an archive a person downloaded, and it is theirs.** A platform export is a file
   the member requested. It is read once, locally, and never fetched by a running job - which keeps
   RFC-0006's posture out of the import path entirely: harvesting observes a source, importing reads
   a document.
2. **The adapter is a reader, not a client.** No credentials, no session, no pagination, no rate
   limit. A source that offers only an API and no export is not importable, and the answer to that
   is "request your data", not "we will scrape it".
3. **Fidelity is claimed per field, in the manifest.** The manifest carries a `fidelity` object
   naming, for each of text, media, timestamps, authorship, reply structure and metrics, one of
   `exact`, `approximate` or `absent`. An absent field is absent rather than zero: an import that
   writes `metrics: {likes: 0}` for an archive with no metrics has invented a number.
4. **Media arrives as references and is fetched only on request.** An export carries URLs or
   relative paths to blobs; the adapter records the reference and does not fetch. A reference that
   no longer resolves stays as a reference with a `gone` mark, because the archive is a record of
   what was said rather than a mirror of someone else's CDN - RFC-0028 §3's rule at the media layer.
5. **There is no observation log, and the format says so.** RFC-0015's `Observation.jsonl` is the
   shadow store's history of what a harvester saw. An import saw the archive once, so the file
   carries one synthetic line per record or none, and `complete` is meaningless for it. A field with
   no meaning in a case is marked rather than filled, or every later reader inherits the lie.
6. **Timestamps are two facts.** The platform's `createdAt` and the archive's `exportedAt` are both
   recorded, and neither is treated as a time this system observed anything. RFC-0040's ordering
   applies to rows this system accepted, not to a claim about when someone else's server saw a post.
7. **An import never becomes locally authored, and never becomes attributable.** `signature: null`
   with `origin: <platform>` (RFC-0015, RFC-0060 §4) means the row has no chain head. It can be
   read, exported and re-imported; it cannot be published as the member's own writing, showcased
   (RFC-0027 §5), or used to satisfy a moderation rule that cites authorship.
8. **A second import of the same archive is a no-op.** Records are keyed by the platform's id inside
   `origin`, so re-importing an overlapping export adds nothing and updates nothing: a changed post
   is a `conflict` line, reported and never merged (RFC-0015's import rule).

## Context

RFC-0015 already decides that foreign platforms arrive through an adapter emitting the same five
files with `origin` set and `signature: null`, and the index's residuals section records the topic
as covered by that decision. What that record does not decide is what the adapter's input is, what
fidelity it may claim, and what an archive does not contain - and those three decide whether an
import is honest or merely convenient.

The distinction matters because the two paths fail differently. A scrape can be re-run and observes
change over time; an archive is a single point-in-time document the member may have obtained months
ago, filtered by the platform's own rules. A post deleted before the export is not missing data - as
far as the archive knows it never existed - and no amount of fidelity work recovers it.

The tool layer has the seams and no adapter. `ls Maintain/Source/Command/Store/` lists Export, Hide,
Publish, Push, Scrape and Status: the only foreign-content path is Scrape, which is the live-account
path this record refuses for import. `store export` and `store push` round-trip (RFC-0001), so the
format a foreign adapter must emit already has a producer and a consumer.

## Alternatives considered

| Option                                                       | Why not chosen                                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scrape a live account to build the archive                   | it is the path RFC-0006 governs, it produces observations rather than the member's own record, and it needs credentials this system must not hold |
| Fetch media into the archive                                 | the archive grows by gigabytes of someone else's CDN, and a takedown there becomes a takedown here                                                |
| Write zeroes for absent metrics                              | an invented number is indistinguishable from a measured one a month later                                                                         |
| Treat `exportedAt` as an observation time                    | the member's client did not observe the platform; it read a file                                                                                  |
| Mark imported rows locally authored after a review           | the review is a person's word about bytes nobody signed, which is what `signature: null` exists to prevent                                        |
| Merge a changed record on re-import                          | RFC-0015 already refuses to overwrite; a conflict is a decision, not a bug                                                                        |
| Normalise every archive into a new intermediate format first | a third format between the platform's and RFC-0015's, versioned twice, for one adapter                                                            |

## Consequences

- An import is a batch job over a file, so it has no cadence, no assignment and no fleet row
  (RFC-0021) - it is a run (RFC-0018), and that is the whole of its provenance.
- The fidelity object is a promise per field, so a platform whose export loses reply structure
  produces an archive this system can hold without claiming a thread it does not have.
- An imported archive can be re-exported through RFC-0015's format, which makes this system a
  converter: a person leaves with what they arrived with, in a better format. That is a genuinely
  useful exit and the cheapest thing the product can offer a newcomer.
- Media references decay, so an imported archive's cards render broken media over time and the
  client needs a `gone` state for it.
- `complete` being meaningless for an import means RFC-0014's deletion gate cannot read an import's
  manifest - which is correct, since an import is not an export of this room.

## Verification

| Claim                          | Test                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| The adapter reads a file       | run the adapter with every network interface down and a fixture archive on disk; the five files are produced (intent)              |
| No credentials are needed      | the adapter's configuration schema has no secret term and `maintain config show` lists none (RFC-0011, intent)                     |
| Absent is absent               | import an archive with no metrics; `jq -r '.metrics' Payload.jsonl` on the first line prints `null`, not `{"likes":0}` (intent)    |
| Media is not fetched           | import an archive with ten media references and count the run's spans (RFC-0018); no HTTP span appears (intent)                    |
| Imported rows are unattributed | `jq -r '.signature' Provenance.jsonl` is `null` on every line and `origin` names the platform (RFC-0015's existing row)            |
| A second import is a no-op     | import the same archive twice; row counts and `rootHash` are unchanged (intent)                                                    |
| A changed record is a conflict | import an archive whose one post differs from the first import; the run reports `conflict` and writes nothing for that id (intent) |

## Open questions

- Whether the adapter should be one per platform or one over a normalised intermediate format. One
  per platform is N readers; an intermediate format is one more format to version, and it is the one
  a third party would target.
- Whether an import should be allowed to create a room. RFC-0015 permits it, and an import of a
  personal archive is not a room - the distinction between "my posts" and "a room of my posts" is
  undecided.
- Whether a member should be able to claim authorship of an imported row by signing it later. It
  would let a person consolidate their history under one key, and it would let a person sign
  something they did not write.
- UNKNOWN what the platform export contains at the field level - the format is not documented in
  anything read, and the tool layer's only source is X (`source: z.literal("x")` in
  `Source/content.config.ts`). Spike: request one export and inspect its file set before the
  fidelity table is fixed.

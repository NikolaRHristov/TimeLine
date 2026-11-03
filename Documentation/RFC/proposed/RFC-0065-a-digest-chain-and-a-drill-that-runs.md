---
title: A digest chain, and a drill that runs
rfc: 0065
category: Architecture/Data
kind: rfc
date: 2026-11-02
status: proposed
horizon: now
registry: Documentation/RFC/README.md
index: Documentation/RFC/README.md
owner: operator
applies_to: |-
    the shadow store's file format, `store verify`, the drill command, the archive's RPO and RTO
supersedes: none
superseded_by: none
depends:
    - RFC-0001 (the store is the only complete history)
    - "RFC-0015 (the `rootHash` this record gives a producer and a consumer)"
    - RFC-0018 (a drill is a run)
    - RFC-0011 (RPO and RTO are terms)
    - |-
        RFC-0066 (where a member sees the last drill); implementing card to be created: "Store hash chain, digests and the restore drill" This record covers two topics the wave named separately - archive integrity and disaster recovery drills - because a digest nobody restores proves the wrong thing and a restore nobody digests proves nothing.
statuses:
    - name: Every append extends a chain
      state: current
      evidence: Index.json
    - name: A digest is a checkpoint, not a replacement
      state: open
      evidence: Digest/NNNN.json
    - name: Verification is offline and total
      state: open
      evidence: the rule names no file or command
    - name: The chain proves non-alteration, not authenticity
      state: open
      evidence: the rule names no file or command
    - name: A drill is a restore into a fresh directory, verified, then removed
      state: open
      evidence: the rule names no file or command
    - name: RPO and RTO are declared numbers, and the drill measures them
      state: open
      evidence: the rule names no file or command
    - name: A failed drill is a defect with a card
      state: open
      evidence: the rule names no file or command
    - name: The drill runs on a schedule nobody has to remember
      state: open
      evidence: the rule names no file or command
---

## Decision

The archive carries a hash chain over its own files, and a scheduled drill restores a copy and
verifies the chain. RPO is the digest cadence and RTO is the drill's measured time.

1. **Every append extends a chain.** Each shadow-store write records `{prevHash, thisHash}` over the
   record's canonical bytes, and `Index.json` carries the head. The chain is per store rather than
   per post, so its head is one value a member can publish or pin.
2. **A digest is a checkpoint, not a replacement.** Weekly the client writes
   `Digest/NNNN.json = {at, count, headHash, rootHash}`, where `rootHash` is RFC-0015's sorted-line
   hash. A digest makes verification cost a file; the chain makes tampering localisable to one
   append.
3. **Verification is offline and total.** `maintain store verify` recomputes the chain and every
   digest and reports the first divergent index. It needs no server, no key and no network, which is
   what makes it a member's tool rather than an operator's.
4. **The chain proves non-alteration, not authenticity.** Anyone who can rewrite the store can
   rewrite the chain. Authenticity comes from publishing the head: a member may pin it to a room
   event, to a published page, or to a key-signed statement (RFC-0060), and a store whose head does
   not match the pinned one has been rewritten.
5. **A drill is a restore into a fresh directory, verified, then removed.** `maintain store drill`
   exports, restores into `Maintain/Storage/Drill/`, runs `store verify` there, compares counts and
   `rootHash` against the newest digest, and records a run (RFC-0018). A drill that writes nothing
   and reports nothing is not a drill.
6. **RPO and RTO are declared numbers, and the drill measures them.** RPO is 7 days - the digest
   cadence, which is the most a member can lose and still notice. RTO is 1 hour for an archive up to
   a size the drill records. Both are configuration terms (RFC-0011) with those defaults, and the
   drill's run row carries the measured restore time so drift is visible.
7. **A failed drill is a defect with a card.** A drill that does not verify opens an issue rather
   than a warning, because an unverifiable archive is the one failure this product cannot ship with.
   The card is the drill's output, not a line in a log.
8. **The drill runs on a schedule nobody has to remember.** A scheduled local job - not a room's
   reducer, because the archive is client-side (RFC-0001) - runs monthly, and the last drill's date
   and outcome appear in the member's status view (RFC-0066). A last run older than two intervals is
   itself a finding.

## Context

Two records already depend on this and neither specifies it. RFC-0015's export format carries
per-line hashes and a `rootHash` "so two exports of the same room compare equal", and RFC-0001 makes
the shadow store the only complete history. Neither says whether the store's own files are chained,
and nothing verifies either claim: `grep -rln "createHash\|sha256\|contentHash" Maintain/Source/`
prints nothing, so no file in the tool layer computes a hash at all.

The engine offers nothing to lean on. No page in `Maintain/Spacetime/AGENTS.md` documents a backup,
a snapshot or a restore - `grep -niE "backup|restore|snapshot|dump" Maintain/Spacetime/AGENTS.md`
prints nothing - and `spacetime delete` removes a database outright (`AGENTS.md:211`). A room's
recoverability is therefore RFC-0015's export and nothing else, which makes the archive's own
integrity the last line.

The drill half exists because the set has a habit of asserting properties it has never exercised.
RFC-0001's verification table already asks for an export-wipe-push round trip; that is a test, and a
drill is the same operation on a schedule with a measured time and a recorded outcome. The store is
small enough that the drill is cheap today: `du -sh Maintain/Storage/Shadow` prints 1.9M.

## Alternatives considered

| Option                                    | Why not chosen                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Merkle tree over every file             | logarithmic proofs and a far more complex writer; the chain is one hash per append and localises a divergence to one record                       |
| A digest only, no chain                   | a digest says the store changed and not where, which turns every finding into a full manual diff                                                  |
| A chain only, no digest                   | verification costs a full scan every time, so nobody runs it                                                                                      |
| Sign the chain head with the member's key | it proves the member wrote the chain, not that the chain describes the files; a signature over the head plus a published head is the cheaper pair |
| Trust the host's backups                  | no backup, snapshot or restore is documented in the engine reference, and the archive is client-side by design                                    |
| A drill described in a runbook            | the set's own rule is that an intent row is an untested claim; a drill that is not run is a paragraph                                             |
| RPO of zero (continuous replication)      | a second live copy is a second thing to secure and a write-path dependency; seven days is what a member can lose without losing the archive       |

## Consequences

- Every write grows the store by one hash pair, so overhead is proportional to the append count
  rather than the archive's size - the cheap half of the trade.
- A rewritten store is undetectable unless the head was published, so pinning the head is a step the
  ceremony has to teach. A member who never pins has integrity without authenticity.
- A drill needs free disk equal to the archive, so the drill's own size becomes a configuration
  term, and a small machine may have to run a partial drill - which is a weaker drill and must be
  labelled as one.
- RTO grows with the archive, so the declared hour is a claim about today's size and the drill's run
  row is what keeps the claim honest.
- A failed drill blocking a release is friction that will be argued with, which is why rule 7 puts
  the finding on the board rather than in a log.

## Verification

| Claim                           | Test                                                                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| The chain verifies              | `maintain store verify` on an untouched store exits 0 and prints the head (intent)                                                 |
| Tampering is localised          | change one byte in one record; `store verify` names that record's index and the first divergent hash (intent)                      |
| A digest is a checkpoint        | `jq -r .headHash Maintain/Storage/Shadow/Digest/0001.json` equals the head `store verify` prints at that time (intent)             |
| A drill restores and verifies   | `maintain store drill` writes a run row with a measured restore duration, and the restored `rootHash` equals the digest's (intent) |
| A drill leaves no copy          | after a drill, `ls Maintain/Storage/Drill/` is empty (intent)                                                                      |
| RPO and RTO are terms           | `maintain config show` lists both with defaults of 7 days and 1 hour (RFC-0011, intent)                                            |
| An old drill is a finding       | set the last drill's date beyond two intervals; the status view reports it (RFC-0066, intent)                                      |
| The archive survives the server | stop `spacetime start`, then run the drill: it completes, because the store is client-side (RFC-0001)                              |

## Open questions

- Whether the chain should be per file or one append-only log for the whole store. A single log
  makes the chain trivial and puts every write in contention with one head; per file makes the head
  a composite.
- Whether a member should be able to pin the head somewhere public by default. Pinning to a room
  event is cheap and reveals the archive's size and cadence to that room.
- Whether the drill should restore from an export (RFC-0015) or from the store directory itself. An
  export is the real recovery path and is slower; the directory is faster and does not test the
  format.
- UNKNOWN whether a partial drill - a subset of the archive - is worth running on a machine without
  room for a full copy. It tests the machinery and not the archive, and calling it a drill is the
  kind of overclaim this record exists to avoid.

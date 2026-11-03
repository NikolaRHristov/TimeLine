# RFC-0033 - Room migration between hosts

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** export, the new host's
database, epoch rotation at cutover, the old host's deletion **Kind:** architecture **Subject:**
network **Horizon:** next **Supersedes:** none **Superseded by:** none **Task dependencies:**
RFC-0015 (the export is the only complete copy), RFC-0025 §1 (the artifact is content-addressed),
RFC-0013 (epochs travel wrapped), RFC-0014 (archive is the default close), RFC-0016 §5 (a provider
stopping is planned); implementing card to be created: "Migration record and cutover"

## Decision

Migration is four steps any member can perform - export, publish, create, import - and a room's
identity survives the move because it is the room's key chain, not the host's address.

1. **A room's identity is its epoch chain plus its founding signature.** Not the host, not the
   database name, not the URL. A migrated room is the same room because the same epochs wrap the
   same content and the content hashes verify (RFC-0015). Everything else about a room - host,
   module hash, member count - is state that can change while the identity does not.
2. **Migration is RFC-0015's export in full, taken by a member.** `Manifest`, `Payload`,
   `Provenance`, `Key`, `Observation`. The `Key` file is what makes migration possible at all:
   epochs wrapped per member travel, so a member's client opens the migrated room without a new
   invitation and without a new claim code (RFC-0014). A migration with an incomplete export
   (`complete: false`) is a partial room and the manifest says so.
3. **The new host publishes the artifact, creates the database, imports, and records the import.**
   The artifact is the same or a compatible version (RFC-0034); the import verifies every hash
   before writing and aborts on the first mismatch (RFC-0015); the import event carries the source
   `rootHash`, so the new room can always say where its rows came from.
4. **Authorship survives because signatures travel.** Provenance lines carry author and signature,
   so an imported row is authored by the identity that signed it and not by the importer. RFC-0015's
   `signature: null` case applies to foreign platforms only; a migration is not an import from
   elsewhere and must never take that path.
5. **Members re-point by room identity, not by invitation.** A client stores
   `{roomId, host, artifactHash}` per room. A migration adds a host entry for the same `roomId`, and
   the client offers both until the old room is archived. Grants are room rows and they travelled,
   so no member is re-granted and no member is re-invited.
6. **Cutover is a record, and writes stop at the old host when it lands.** A
   `migration{from, to, rootHash, cutoverAt, signature}` row is written in both rooms. The old room
   refuses a write once `cutoverAt` has passed, so a client that has not re-pointed fails loudly
   instead of writing into a room that is about to be archived. After the copy completes, the old
   room is archived - RFC-0014's existing state, which destroys nothing and stops new rows.
7. **The old host must delete, and must say it did.** The database (`spacetime delete`,
   `AGENTS.md:211`), the module instance, the room's backups and its logs. It records a deletion
   receipt naming the database identity and the time. The receipt is a claim, not a proof: nothing
   in this system verifies that a host destroyed a backup. What protects members is rule 8.
8. **Cutover rotates the epoch, so the old host's copy stops being openable to new writes.** A new
   epoch is issued at the new host and wrapped to the members; the old epochs stay readable to
   whoever holds them, which is the same forward-only rule RFC-0013 applies to revocation and
   RFC-0023 §5 to a revoked delegation. Rotation is the only lever the system actually holds over a
   host that keeps a copy, and it is honest about its limit: the old ciphertext is still there, and
   it is still readable by anyone who kept the old epochs.

## Context

The provider stopping is already a planned event (RFC-0016 §5): a 90-day export window, RFC-0015's
format, the module source published under the repository's licence. That record covers the provider
leaving. It does not cover a room leaving, which is the same operation from the other side and needs
the same guarantees.

The engine's own verbs show what is and is not available. `spacetime delete` removes a database
(`AGENTS.md:211`); `spacetime rename` changes a database's name on its current server;
`spacetime publish` deploys an artifact to a server. Nothing read describes copying a database
between servers, so the export is not a convenience - it is the only mechanism, and RFC-0015 was
written to make it complete.

The key half is already decided. RFC-0013 wraps an epoch to each member's public key, and RFC-0015
puts the wrapped epochs in `Key.json`. A migration therefore moves exactly what a member would
otherwise have to be re-invited to receive.

## Alternatives considered

| Option                                              | Why not chosen                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Copy the database file between hosts                | no such operation exists in the engine's CLI surface read; and a raw copy would not re-wrap epochs to the new host's members    |
| Re-invite every member to the new room              | loses the property that membership is a room row, and a member who is offline during the move is locked out                     |
| Let the importer become the author of imported rows | RFC-0015 forbids it for exactly this reason: a migration that rewrote authorship would let a host take credit for every post    |
| Keep the old host as a read replica                 | a second host serving the same room's rows is a replica and needs RFC-0026's rules, plus its own deletion story                 |
| Delete the old database without a receipt           | a member cannot tell a clean migration from a host that kept a copy; the receipt at least makes the claim auditable by omission |
| Rotate epochs before the copy                       | the copy would need the old epochs anyway; rotation is only meaningful after the new host holds the rows                        |

## Consequences

- A migration costs one full export plus one import, so a large room moves slowly and needs the old
  host to stay up for the duration. RFC-0016 §5's 90-day window is the budget.
- The room's timeline has a seam. Rows before cutover were ordered by the old host's clock and rows
  after by the new one, so RFC-0040 §6 requires the migration row to carry both readings - without
  that, a reader cannot tell a clock skew from an event order.
- Two artifact versions may be live during a move (RFC-0034), so a client has to speak both for the
  length of the window.
- A member who does not trust the new host keeps their export and their old epochs and leaves; exit
  is free (RFC-0027 §6), and this is the case that makes that rule load-bearing rather than a
  slogan.
- Deletion is a receipt, not a guarantee, and every document about retention has to say so
  (RFC-0028's open question is the same limit).

## Verification

| Claim                                     | Test                                                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| A round trip preserves every byte         | export a fixture room, import it into a fresh database, export again; the two `rootHash` values are equal (RFC-0015)                   |
| Authorship survives the move              | after import, `spacetime sql <new> "SELECT author, signature FROM provenance"` matches the old room row for row (intent)               |
| No member is re-invited                   | a member who joined before the move reads a post-cutover row without accepting a new invitation (intent)                               |
| Writes stop at the old host at cutover    | submit to the old room with `cutoverAt` in the past; the refusal is `action-refused` naming the migration, not a silent write (intent) |
| The old room archives rather than deletes | `spacetime describe <old>` still succeeds and the room's state reads `archived` (RFC-0014)                                             |
| A deletion receipt is recorded            | the host's receipt row names the database identity and the time; `spacetime describe <old>` then fails (engine, `AGENTS.md:211`)       |

## Open questions

- Whether the engine can copy a database between two servers without an export. `spacetime rename`
  moves a name, not a host, and no page read describes a cross-server copy. UNKNOWN, and a copy
  primitive would halve the cost of every migration. Spike: publish a fixture database to a second
  local server and look for a copy or snapshot verb.
- Whether a deletion receipt can be made verifiable - a host could sign a statement that it deleted,
  and a member could check only that the database no longer answers. UNKNOWN whether the engine
  exposes a tombstone for a deleted database.
- Whether a migration should be able to carry a room's _pending_ state: queued offline writes
  (RFC-0030 §5) and in-flight federated pushes (RFC-0012 rule 3) have no representation in the five
  export files, so a move can drop a write that had not yet landed.

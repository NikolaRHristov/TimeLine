# RFC-0061 - Bridges are out of scope; the export is the interface

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** federation scope, the
export format, versioning **Decision class:** product **Supersedes:** none **Superseded by:** none
**Task dependencies:** RFC-0015 (the export that is the whole interop story), RFC-0023 §3
(publication is a delegation out of the room, which is what a bridge would be), RFC-0034 (the format
version a bridge would depend on), RFC-0007 (the host cannot read, which is why a bridge cannot
carry an audience); implementing card to be created: none - this record decides that no card is
created

## Decision

No ActivityPub bridge and no ATProto bridge is in scope. Interoperability with another network is
RFC-0015's export, imported by whoever wants it, and the boundary is stated here so that no other
record has to hedge.

1. **The interop surface is a file, not a protocol.** A person leaves with an export and arrives
   with an import. Nothing in this system speaks a second network's wire protocol, and no module
   terminates one.
2. **A bridge could preserve three things and no more.** Content bytes, the authorship signature
   (RFC-0060's chain head maps to a key if the other network's actor is a key), and a creation time.
   Those three are what an export already carries.
3. **A bridge cannot preserve audience.** Both target protocols publish to a server or a follower
   set that the receiving server reads. This system's audiences are epochs wrapped to named keys
   (RFC-0013) read by a module that cannot read content (RFC-0007). A bridge is therefore a
   _publication_ (RFC-0023 §3), and only `public` content can cross it. `typed` and `internal`
   content has no bridge representation, and a bridge that claims one is lying.
4. **A bridge cannot preserve retraction.** RFC-0059's retraction is a signed message to copies; the
   other protocols' delete is a server-side act on a repository the server holds. A delete arriving
   as a retraction is best-effort; one arriving as a delete is a promise this system cannot make.
5. **A bridge cannot preserve blindness, and that is the reason for the boundary.** A post crossing
   into a public protocol is plaintext on someone else's server, indexed by someone else's search. A
   member who published `public` content has accepted that (RFC-0023 §3); a member who published
   `typed` content has not, and a bridge would break their expectation silently. That is a privacy
   failure rather than an interoperability gap.
6. **A third party may build one, and the cost is theirs.** The format is published and versioned
   (RFC-0015, RFC-0034), so anyone can write a bridge that reads an export and posts elsewhere. It
   runs outside this system, under another identity, with the member's explicit act; this system
   neither endorses nor detects it. What it must not do is present itself as a room.
7. **What would change this decision is named.** A target protocol that carried per-post content
   keys and a recipient set defined by keys would make a bridge a transport rather than a
   publication. Neither protocol in scope does, and a future one that did would be RFC-0034's
   problem - a second wire - rather than this record's.

## Context

The question is asked because every federated product is asked it, and the honest answer is a
boundary rather than a roadmap item. The set already holds both mechanisms a bridge would need, and
both are deliberately narrow: RFC-0015 makes an export the exit and the format a compatibility
surface, and RFC-0023 §3 makes publication a delegation out of the room. A bridge is those two
things in a loop with a foreign server.

The decisive constraint is architectural. This system's read path is a per-member view over
ciphertext whose audience is a wrapped epoch (RFC-0005, RFC-0013). ActivityPub's and ATProto's read
paths are a server that reads. A bridge must therefore either hold keys - which makes it a reader,
and RFC-0007 says the host is not one - or carry only content that was already published in the
clear.

Nothing in the tree speaks either protocol.
`grep -rln "activitypub\|atproto\|webfinger" Maintain/Source/ Source/` prints nothing, and the
module terminates no foreign protocol:
`grep -cE "httpHandler|httpRouter" Maintain/Spacetime/spacetimedb/src/index.ts` prints 0, so there
is no inbound route of any kind, let alone a federated one.

## Alternatives considered

| Option                                                 | Why not chosen                                                                                                                |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| A read-only bridge that imports from another network   | that is an adapter, and RFC-0015 already has it; importing stays in scope and this record does not remove it                  |
| A bridge that carries only `public` content            | permitted, and it is a publication: the member's, outside the system, under rule 6                                            |
| A bidirectional bridge that mirrors a room as an actor | the mirror is either a reader of every post or a publisher of plaintext; the first breaks RFC-0007, the second breaks `typed` |
| Speak one protocol natively inside the module          | a second wire with its own identity, moderation and delete semantics, and RFC-0034 would have to version both                 |
| Refuse to state a position and revisit later           | every downstream record would hedge; the set's own convention is that a boundary record exists so the others need not         |
| Build a bridge and call it federation                  | federation inside this system is RFC-0005's inter-database calls, which carry the same module and the same audiences          |

## Consequences

- A member who wants an audience beyond the network publishes to the static site (RFC-0027 §6) or
  exports; there is no one-click cross-post, and the product says why.
- The export format becomes more important rather than less: it is the whole interop story, so its
  version (RFC-0034) is a public commitment.
- A third-party bridge can exist and can misrepresent this system; the only defence is that a bridge
  cannot produce a valid chain head under a member's key.
- A future protocol with key-addressed audiences reopens the question, and rule 7 names the shape
  that would.
- No other record in the set needs an "except for the bridge" clause, which is the point of writing
  this one.

## Verification

| Claim                                     | Test                                                                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No protocol client exists                 | `grep -rln "activitypub\|atproto\|webfinger" Maintain/Source/ Source/` prints nothing (true today)                                                                        |
| The module terminates no foreign protocol | `spacetime describe <room> --json \| jq '.routes'` lists no federated route, and `grep -c "httpRouter" Maintain/Spacetime/spacetimedb/src/index.ts` prints 0 (true today) |
| Only published content can leave          | the export's `Provenance.jsonl` for a room with `typed` rows contains no `typed` line (RFC-0012, RFC-0015, intent)                                                        |
| A bridge cannot forge attribution         | a chain head signed by a foreign key fails verification against any member's key (RFC-0060, intent)                                                                       |
| The boundary is stated once               | the records that touch interop cite this one and do not restate it (review rule)                                                                                          |

## Open questions

- Whether an _import_ from ATProto should be an adapter in the tool layer, reading a repository
  export as a file, or a live reader of an HTTP endpoint. RFC-0015's adapter is written for files
  and the tool layer already has an ingest seam.
- Whether the static site should advertise a machine hint that its content is exportable. It is a
  discoverability question (RFC-0058) with no audience implications.
- UNKNOWN what an ATProto repository export contains at the fidelity rule 2 assumes - records,
  blobs, or both - and whether authorship survives it. Spike: fetch one public repository export and
  inspect its record types.
- Whether a bridge should be able to _receive_ a retraction from a foreign network and turn it into
  an RFC-0059 retraction for a copy that came from there. It is the one direction where the
  asymmetry helps, and it needs a mapping from a foreign actor to a key.

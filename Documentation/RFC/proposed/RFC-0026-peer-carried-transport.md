# RFC-0026 - Peer-carried transport

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the transport seam,
relays, replicas, the wire protocol **Kind:** architecture **Subject:** transport **Horizon:** next
**Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0003 (the seam a third
transport joins), RFC-0005 (one authority per room), RFC-0007 (a carrier sees ciphertext), RFC-0022
(a replica is a host), RFC-0023 (a peer is a holder), RFC-0025 (a replica runs the artifact);
implementing card to be created: "Peer transport: relay mode, and the replica decision gate"

## Decision

The transport is separable from the authority. A member may carry the connection for others, and
that changes who is on the wire, not who decides what a row means.

1. **A third transport joins the seam.** `peer` is admitted by RFC-0003 beside `cdp` and `view`, and
   like `view` it is read-only: a mutating command resolved to `peer` fails before any side effect.
   A carrier may forward a mutation to the authoritative room, and it may not perform one.
2. **Two modes, decided separately.**
    - **Relay** carries bytes between a client and the authoritative room. It needs no module, no
      key and no state. It learns who talks, when and how much, and nothing else, because everything
      it carries is ciphertext (RFC-0007).
    - **Replica** runs the room's module artifact (RFC-0025) and answers subscriptions from rows it
      holds. It needs the artifact and it serves ciphertext unless the member running it also holds
      the epochs (RFC-0013). A replica is a host for that room and inherits RFC-0022's rules:
      declared egress, an allowlist for cross-room calls, and no claim of isolation beyond the
      database.
3. **Relay is the default answer to "one member offers connectivity for the rest".** It is the
   cheapest form, it requires no trust in the carrier's code, and it is honest about what a carrier
   can do. A replica is a second-order choice made only when the authoritative room is unreachable
   and the members would otherwise lose read access.
4. **One authority per room, always.** A replica is not a second authority: a write is forwarded to
   the authoritative database and never accepted locally. A replica that cannot reach the authority
   serves reads only, says so in its transport metadata, and refuses a mutation with the same error
   a read-only transport gives.
5. **A carrier is a holder, so custody applies.** Carrying a room's rows is a delegation (RFC-0023)
   with its own revocation and expiry. Revoking it stops future delivery and cannot recall what was
   already carried, exactly as RFC-0013 states for a removed member.
6. **A relay sees the connection graph.** That is the metadata RFC-0016 §4 grants the host, now
   granted to a member: who talks to whom, when, and how much. It is undefended and stated. A relay
   therefore must be visible to the room's members as a carrier, never a silent proxy.

## Context

RFC-0003's seam was built for two transports and its own consequences say what a third would need:
"a future remote transport would need its own authorisation story". RFC-0005 fixes the authority as
the module in the transaction, and RFC-0016 puts the host in the middle. Nothing in the set allows a
transport that is not a hosted database, so a room is unreachable when its host is down and a
network of five people has exactly one point of failure.

The engine evidence bounds the options. The wire is the engine's own protocol: the feature-request
board lists a QUIC transport option and ZSTD compression for websocket messages as requests, not as
shipped features (`https://spacetimedb.com/features`, read 2026-11-02), so a carrier today speaks
the engine protocol or the room is not reachable through it. That is the constraint that makes relay
the practical form: a relay does not need to understand the protocol beyond proxying it, while a
replica must run the module and therefore must be a compatible engine version.

The isolation decision sharpens the choice. A replica is a host (RFC-0022) with a database owner who
can read every row it stores (`Maintain/Spacetime/AGENTS.md:46`), so a replica run by a member is a
member who can read the room's ciphertext and correlate its timing. That is acceptable for a room
whose alternative is being offline, and it is not acceptable as a default.

## Alternatives considered

| Option                                                       | Why not chosen                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| One hosted database only, no peer transport                  | a five-person network has one point of failure and no path when the host is down (RFC-0016's shutdown is 90 days)  |
| A replica in every member's client by default                | every member becomes a host with the metadata reach and the row access of a host (RFC-0022)                        |
| A relay that terminates and re-encrypts                      | it needs the keys, so it becomes a party that can read, which RFC-0007 exists to prevent                           |
| Split-brain: a replica accepts writes offline and reconciles | visibility is decided in the transaction (RFC-0005); two authorities decide it twice and disagree                  |
| Peer discovery in the protocol                               | a discovery service is a new server and a new metadata leak; invitations (RFC-0014) already carry a room's address |
| A second wire protocol for peers                             | a second protocol to secure, version and test, for a hop that proxies the first one                                |

## Consequences

- A room's availability decouples from one host: a relay can be run by any member with an address,
  and the room's authority stays where it is.
- Membership gains a visible role - carrier - with its own grant, revocation and expiry, which the
  client must render because a carrier is a party that sees metadata.
- A replica's version compatibility becomes an operational concern: a replica on an older engine
  version may not speak to the authoritative room, which is the same compatibility window RFC-0016
  already carries.
- The transport seam proves itself: a third transport that touches one directory rather than every
  command is the test RFC-0003 promised.
- "The host cannot tell two rooms are talking" remains unclaimed, and now "a member cannot tell" is
  unclaimed as well whenever a relay is in use.

## Verification

| Claim                            | Test                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `peer` is read-only              | `post like --id X --transport peer` exits 2 with `read-only-transport` (shared shape with RFC-0003)                     |
| A relay needs no key             | run a relay with no keystore; a client connects and reads a post it holds a grant for, and the relay holds no plaintext |
| A replica refuses a mutation     | stop the authoritative room, submit a mutation through a replica: `authority-unreachable`, and no local row is written  |
| A replica serves ciphertext only | inspect a replica's rows without an epoch: every payload is the same ciphertext the authority holds                     |
| Carrying is revocable            | revoke the carrier delegation; the replica stops serving the scope at its next read (intent, shares RFC-0023)           |
| A carrier is visible             | `select * from carrier` lists the member running the relay, and the client shows it on the room's status                |
| The seam holds                   | `grep -rn "Transport/Peer" Maintain/Source/Command` is empty, as RFC-0003 requires for every transport                  |

## Open questions

- Whether the engine's client can connect through an arbitrary proxy at all, or whether the
  websocket handshake pins a host and path that a relay cannot rewrite. UNKNOWN and decisive: if it
  pins, relay mode needs a protocol the engine does not expose and the whole record reduces to
  replica mode. Spike: point a local client at a byte-level proxy in front of `127.0.0.1:3010` and
  see whether the subscription completes.
- Whether a replica can be told it is a replica by the module, so the module can refuse a mutation
  locally with a named error rather than relying on the transport. UNKNOWN; a module row naming the
  authoritative database would be the mechanism.
- Whether a relay should be a member of the room at all, since it holds no grant and reads nothing.
  Membership gives it the metadata its presence already reveals and nothing more, which argues for
  membership as a label rather than a permission.
- How many relays a room tolerates before the connection graph becomes a way to map a network.
  UNKNOWN, and it interacts with RFC-0020's list of undefended threats.

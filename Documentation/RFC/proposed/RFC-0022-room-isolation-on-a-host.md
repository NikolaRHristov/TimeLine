# RFC-0022 - Room isolation on a host

**Status:** Proposed **Date:** 2026-11-02 **Owner:** operator **Applies to:** the host, the module's
egress surface, federation calls, per-room failure domains **Kind:** policy **Subject:** network
**Horizon:** next **Supersedes:** none **Superseded by:** none **Task dependencies:** RFC-0005 (the
room is the database), RFC-0007 (ciphertext is the boundary that holds against the host), RFC-0016
(the host contract this record extends), RFC-0020 (the threat model this record serves); t_1621cc5c
(substrate research); implementing card to be created: "Module egress gate and the federation
allowlist"

## Decision

A room's isolation is the database boundary plus an explicit egress allowlist. The engine's sandbox
is not assumed, because nothing read so far documents it.

1. **The isolation unit is the database.** One room, one database, one module instance, one identity
   (RFC-0005). Two rooms on one host share the host's kernel and its scheduler and share nothing
   else: no tables, no reducer namespace, no membership.
2. **Egress is off by default.** A module's only outbound capability is `ctx.http.fetch` inside a
   procedure (`Maintain/Spacetime/AGENTS.md:704`); reducers are deterministic and may not touch the
   filesystem, the network or a clock (`AGENTS.md:13-15`). A room that needs outbound HTTP declares
   it in its module version, and the host records the declaration. A room that declares none runs a
   build with no procedure that fetches. This is the decision that makes "a compromised room cannot
   reach out" true by construction rather than by trust: a module that cannot open a socket cannot
   exfiltrate what it can read.
3. **Cross-room calls pass an allowlist on both sides.** A room's module may call a reducer in
   another room only when a `federation` row in the calling room names the target, and the receiving
   room authorizes the caller. The allowlist is the containment, not the sandbox: the engine's
   inter-database call is the mechanism (RFC-0005), and an unlisted target is a build-time absence
   rather than a runtime refusal wherever the module can be generated that way.
4. **Private tables do not hide anything from the host.** A private table is "only accessible by
   reducers and the database owner" (`AGENTS.md:46`), and the host is the database owner. What the
   host cannot read is the payload, because the client encrypted it (RFC-0007). Table privacy is a
   property against other clients, never against the host, and this record says so where the
   specification previously implied otherwise.
5. **Timing is the channel a per-room boundary leaves open.** A host running many rooms can
   correlate activity between them by CPU, memory and connection timing even with perfect data
   isolation. That is undefended and stated, not mitigated by a claim.
6. **A compromised room reaches:** its own database, every room named in its allowlist, and the
   ciphertext of rows it is authorized to store. It does not reach another room's rows, another
   room's epochs (wrapped per member, RFC-0013), a member's private key (client-side, RFC-0013), or
   plaintext (RFC-0007).

## Context

The specification claims secure kernels per room. No record states what that means, and the engine
documentation read so far does not describe the module sandbox at all: a search of the 25-page
documentation crawl at `Maintain/Storage/Reference/spacetimedb/pages/` for `sandbox`, `isolat`,
`wasm` and `process` returns three incidental prose hits and no statement about isolation, and the
three residual pages (`/modules`, `/features`, `/space-race`) say nothing about it either.

What the tree does establish is the shape of a module's reach. Modules compile to WebAssembly for
Rust, C# and C++ and run on V8 for TypeScript (`AGENTS.md:5`), which is a language runtime
statement, not a kernel one. Reducers are transactional and deterministic with no external I/O
(`AGENTS.md:12-15`). Procedures are the one side-effect surface and reach the network through
`ctx.http.fetch` (`AGENTS.md:704`). Inbound HTTP arrives through `httpHandler` and a router
(`AGENTS.md:717-737`). So the module has two doors to the outside - procedures out, HTTP in - and
both are module code, which means a compromised module owns both.

That is why the decision above puts the boundary in the artifact and the allowlist rather than in an
assumed sandbox: the guarantees this product sells must not depend on a kernel property nobody has
demonstrated.

## Alternatives considered

| Option                                                          | Why not chosen                                                                                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Assert a sandbox and rely on it                                 | no document read states one; a security claim resting on an unread guarantee is a claim, not a control                              |
| One process per room as the only boundary                       | a process boundary does not stop a module that can call out; it contains memory, not behaviour                                      |
| No egress at all, procedures forbidden                          | the product needs outbound HTTP for webhooks and mail (the module registry sells both), so the rule is declaration, not prohibition |
| Trust the receiving room to authorize federation                | a compromised caller could then reach anything the receiver accepts; both sides must hold a row                                     |
| Rely on private tables against the host                         | the host is the database owner (`AGENTS.md:46`) and can read every row it stores                                                    |
| Encrypt per room and treat the host as untrusted for reads only | the same ciphertext is what makes the egress rule worth having; the two compose, and neither replaces the other                     |

## Consequences

- A room's module version must declare its egress, so a publish that adds a fetch is a reviewable
  change rather than an invisible capability (RFC-0016 §2 gives the version a place to live).
- Federation becomes a two-sided configuration: a room cannot be pushed to without holding a row,
  and an operator cannot make a room reachable by editing one side (RFC-0012's propagation depends
  on this).
- The isolation claim is now testable: a room with no declared egress and no allowlist has no path
  out, and that is a check rather than a promise.
- Timing correlation remains, so "the host cannot tell that two rooms are talking" is never claimed.
- Every host must run one database per room; a host that multiplexes rooms into one database breaks
  the isolation unit and is out of contract (RFC-0005 already refuses the shared table).

## Verification

| Claim                                  | Test                                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A room with no egress cannot call out  | publish a room whose module has no fetching procedure; `spacetime describe <room> procedures --json` lists none that fetch  |
| Egress is declared, not ambient        | a module that adds `ctx.http.fetch` changes its declared egress set, and the room's version record changes with it (intent) |
| Federation needs both sides            | call an unlisted room's reducer: refused; add the `federation` row on the caller only: still refused (intent)               |
| Rooms share no state                   | `spacetime sql <roomA> "select * from post"` from room B's connection returns nothing or errors, never room A's rows        |
| The host can read rows but not content | `spacetime sql <room> "select text from post limit 1"` returns ciphertext once RFC-0007 lands (shared with RFC-0016)        |
| A compromised module is contained      | a test module that attempts a filesystem read and an undeclared fetch fails to build or fails at its first call (intent)    |

## Open questions

- Whether the engine's WebAssembly modules share a process per host or per database, and whether the
  runtime limits memory per module. UNKNOWN; no page read states either. Spike: publish two local
  rooms, exhaust memory in one, and observe whether the other's reducers still run.
- Whether a module's declared egress can be enforced by the host at all, or only audited after the
  fact. If the host cannot refuse a fetch, the rule degrades from a control to a review convention,
  and this record should say so in its Decision rather than here.
- Whether the engine's inbound HTTP router can be disabled per room, which is the other door a
  compromised module holds.
- Whether a `federation` allowlist can be expressed as a build-time dependency
  (`spacetime generate --bindings module` generates receiver bindings for a named database,
  `AGENTS.md:143`), which would make an unlisted call a compile error rather than a runtime refusal.
  This is the strongest available form and it is UNKNOWN whether it can be driven from a room's
  rows.

# Network substrate - SpacetimeDB as the room engine

What the engine actually provides for rooms, permissions and federation, with the source for every
claim. This is the evidence layer under RFC-0005 (network substrate), RFC-0006 (harvesting posture),
RFC-0007 (privacy boundary), RFC-0011 (configuration), RFC-0012 (audiences), RFC-0013 (identity and
keys), RFC-0014 (room lifecycle) and RFC-0016 (hosting). Those records decide; this one records what
the engine does, and what it refuses to do.

## Method

The vendor pages were read through the local Crawl4AI server on `127.0.0.1:11235`. Four of them -
`/modules`, `/features`, `/space-race`, `/changelog` - answered a first pass with a 13-byte stub, so
the pass was repeated with `--filter raw --scan-full-page --cache bypass` before anything was
quoted. A stub is not a page, and the difference matters here: `/space-race` turns out to hold
nothing about the engine at all, and `/features` is the feature-request board rather than a
capability list. Both findings are part of the result.

Page bodies stay out of this tree. The claims below cite a URL and the section, and quote at most a
phrase. Where a claim could not be grounded in a page, in the module's own type definitions, or in a
CLI probe, it is marked UNKNOWN and collected at the end.

## Identity

An `Identity` is a long-lived, globally valid identifier, derived from a JWT as a hash of the issuer
and the subject (`/docs/intro/key-architecture`, "Identity"). It is attached to every reducer call,
and it is stable across connections and across devices. Modules have identities too, issued at
publish, and a module can read its own as `ctx.databaseIdentity`.

Three consequences follow, and the third is the one the product has to answer:

- Identity is cheap to verify and impossible to forge only if the JWT signature holds. The v2.11.0
  security notice records a released flaw in exactly that joint: an attacker who knew a token's
  subject and issuer could impersonate the corresponding identity. It was patched in v2.10.0, and
  the disclosure was held for 30 days.
- A database can carry its own identity providers. `spacetime auth` manages SpacetimeAuth **for a
  database**, with `idp set|enable|disable`, `client`, and `config set|reset` subcommands. The
  identity issuer is therefore per-database configuration, not a global constant.
- Because the identity is a hash of issuer and subject, the same person authenticated by the same
  issuer in two rooms holds the **same** identity in both. The engine offers pseudonymity per
  issuer, never anonymity. Two rooms that must not be linkable need different issuers, which is why
  the issuer belongs in the room's configuration rather than in the client.

## Access is three mechanisms, not one

| Mechanism        | What it gates                                  | State                                        |
| ---------------- | ---------------------------------------------- | -------------------------------------------- |
| Table visibility | whether a client may address the table at all  | private by default, `public: true` to expose |
| Views            | which rows and columns a client receives       | the vendor's recommended access control      |
| RLS filters      | which rows of a public table a client receives | experimental, and the vendor says use views  |

Private tables cannot be queried, subscribed to, or seen by clients at all; reducers and views read
them server-side (`/docs/tables/access-permissions`, "Public and Private Tables"). A view may read a
private table and return only what the caller is entitled to, which makes the
private-table-plus-view pair the shape that keeps content out of every client's cache by
construction.

Row-level security is real but explicitly not the path: the RLS page opens with an experimental
notice and the instruction to use views instead, on the grounds that views are simpler, faster, and
can filter by caller identity through `ViewContext` (`/docs/how-to/rls`). RLS rules are SQL strings
declared as exported `clientVisibilityFilter.sql(...)` values, bound to the caller through the
special `:sender` parameter, OR-ed when several rules target one table, and applied recursively so a
row cannot leak through a join. A module fails to publish if a rule is malformed.

One sentence on that page decides the provider-blindness question on its own: **module owners have
unrestricted access to all tables regardless of RLS.** No engine mechanism hides a row from the
operator of the database. The claim that a provider cannot read user data is therefore not a
property the engine can grant; it is a property of the ciphertext, and nothing else.

## Views: the mechanism, and its shape

A view is a public, read-only function; a client subscribing to it receives only the rows it
returns, and deleting the row a view depends on drops those rows from that client
(`Maintain/Spacetime/AGENTS.md:617`). `ViewContext` exposes the caller; `AnonymousViewContext` does
not.

- **Per-viewer views are computed per subscriber.** An anonymous view is materialised once and
  shared; a view that reads `ctx.sender` is computed and tracked separately for each connected
  client. At five or six members per room that cost is negligible, and it is the reason the
  per-viewer shape is affordable here and would not be at a thousand subscribers
  (`/docs/functions/views`, "Why AnonymousViewContext Matters").
- **Views cannot scan.** A procedural view reaches the database only through indexed lookups
  (`.find()`, `.filter()` on an indexed column) and `count()`; `.iter()` is unavailable by design,
  because a view is opaque code whose read set is tracked, and a full scan would make every row a
  dependency. The escape hatch is the query builder: a view returning `ctx.from.<table>.where(...)`
  hands the query engine an analysable query, which supports incremental evaluation over a full scan
  (`/docs/functions/views`, "Why Views Cannot Use .iter()").
- **Views take arguments.** `SELECT * FROM view_name(2)`; arguments must be positional literals of a
  declared type; no `WHERE`, no column list, no join, and no primary key on an argumented view. Each
  view-and-argument pair is a separate subscription, and subscribing to the same view with different
  arguments unions the results in the client cache without identifying which argument produced which
  row (`/docs/functions/views`, "Views with Arguments → Limitations").

The consequence for the audience model is concrete: a visibility decision has to be expressible as
an index lookup keyed on the caller, or as a query-builder view. An audience rule that means "scan
every post and test the author's grants" is not a view; it is a query-builder view or a materialised
index table maintained by the reducer that writes the post.

## Subscriptions: filter by default, boundary only where identity is enforced

A subscription to a public table ships every row matching the query to the client. That is a filter,
and a filter that ships rows is a leak. The same subscription becomes an authorization boundary in
exactly two cases, both documented:

- the table declares an RLS filter, in which case the subscription returns only the rows that filter
  admits for that caller (`/docs/how-to/rls`, "Usage in Subscriptions");
- the subscription targets a view, in which case it returns only the view's rows for that caller.

A private table has no subscription surface at all. So the answer to "are subscriptions the
authorization boundary" is: not inherently, and only when the object subscribed carries the rule.

The current deployment is the leak case, and it is measurable. All six tables in the module are
declared `public: true` (`Maintain/Spacetime/spacetimedb/src/Schema.ts:15`, `:48`, `:65`, `:82`,
`:99`, `:116`), `onConnect` is an empty callback (`.../src/index.ts:31`), and the module declares no
view, no procedure and no HTTP handler, so no path exists that could gate a read. Any client that
connects and subscribes to `post` receives all 209 rows. Nothing is broken today because the archive
is meant to be public; the same schema is the wrong starting point for a room.

## Procedures: HTTP only, and synchronous

A procedure is a function that may reach the network, unlike a reducer, which must be deterministic.
The module-side client is one method:

```
interface HttpClient {
	fetch(url: URL | string, init?: RequestOptions): SyncResponse;
}
```

(`Maintain/Spacetime/spacetimedb/node_modules/spacetimedb/dist/server/http_internal.d.ts`.) The
response is a `SyncResponse` - buffered, whole, no streaming handle - and the documented surface
offers a body, headers, a method, and a timeout. There is no socket, no upgrade, no event stream.
Outbound HTTP from a procedure is therefore confirmed and outbound WebSocket is not expressible
through it. CDP over a browser debug port needs a WebSocket, so a module cannot be the CDP client; a
bridge process outside the module is the only shape available.

Two further constraints shape any egress design:

- procedures cannot send a request while holding a transaction open (`/docs/functions/procedures`,
  "HTTP Requests");
- a procedure does not run in a transaction at all until it opens one with `ctx.withTx`, and only
  database work belongs inside that callback.

The v2.10.2 changelog adds transparent gzip and Brotli decoding on those requests. Procedures are
documented as unstable for C#, Rust and C++, each with an explicit opt-in; the TypeScript section of
the same page carries no such notice, and the module declares no procedure today, so the TypeScript
surface is unexercised here.

## Federation is asynchronous, and that is the whole of it

v2.14.0 ships async inter-database communication. A module declares dependencies in
`spacetime.json`, pointing at a local module path or a published database; `spacetime generate`
emits typed receiver bindings; senders enqueue a call by inserting a row into a generated,
insert-only outbox table whose columns are type-checked against the receiver's reducer parameters; a
new IDC actor delivers the streams over HTTP/2; optional `on_result` / `onResult` callbacks report
the outcome back to the sender. Dependencies are namespaced, so two dependencies may export
identically named types. C# and C++ receiver bindings are not in this release.

What is not there is the synchronous form. A call that commits on the caller and the receiver
together - a distributed transaction, two-phase commit - is feature request #5199 on the vendor's
board, with the request text spelling out exactly that contract. It is unshipped. Any room design
that assumes "the write either lands in both rooms or in neither" is assuming a capability the
engine does not have; the available guarantee is an insert-only outbox whose delivery is managed by
the IDC actor, which is eventual, not atomic. Whether a delivery is ordered or exactly-once is not
stated in the release notes - the vendor's `IDC` submodule claims exactly-once apply for its own
layer, which is a library on top of the engine, not the engine's contract.

## Upgrades

A module is written, compiled, published, and republished in place; a republish hot-swaps the module
without disconnecting clients (`Maintain/Spacetime/AGENTS.md:99`). `spacetime publish` carries the
three knobs that matter for a fleet:

- `--delete-data=always|on-conflict|never` - destroy the data, destroy it only when a breaking
  schema change requires it, or never. A migration that the engine cannot perform automatically
  becomes data loss, so the migration surface is real and it is destructive at the boundary.
- `--break-clients` - allow a change that breaks connected clients, skipping the prompt.
- `--parent` and `--organization` - inherit team permissions from a parent database, or create the
  database under an organization. Both are create-time only.

Two couplings constrain a fleet of rooms. First, host and module are not independent: v2.14.0
records that modules built with the new libraries export an updated `__call_http_handler__` that
**older hosts reject**. Second, the managed host tracks the latest release - Maincloud is described
on the request board as deploying each new version to every module shortly after release, with no
long-term support tier; the request for one (#5213) is open, and its stated alternatives are
standalone (free, does not scale) or an enterprise private node. The vendor's changelog counters (0
planned, 71 in progress, 8 shipped) are the only public signal of where that request stands.

## Hosting unit and cost

| Tier | Databases per project | Users per project        | Table storage | Notes                                       |
| ---- | --------------------- | ------------------------ | ------------- | ------------------------------------------- |
| Free | up to 5               | up to 5                  | ~1 GB         | database pauses after 1 week of inactivity  |
| Pro  | unlimited             | 10 included, then $25/ea | ~40 GB        | $25/month, replication and 7-day backups    |
| Team | unlimited             | unlimited                | ~100 GB       | $250/month, dedicated nodes on request      |
| Self | unbounded             | unbounded                | host disk     | standalone server; no SLA, no managed scale |

(`/pricing`, "Compare Features".) The numbers decide the hosting question rather than a preference
between them: a room is a database, a five-to-six-person network is one room, and the free tier
allows five databases and five users per project. A six-person circle exceeds the free tier by one
user, and a network of seven rooms exceeds it by two databases. Pro removes both ceilings and prices
the sixth person at $25/month. Standalone removes every ceiling and every guarantee at once, which
is the tier the "operator as host" shape actually needs.

Storage is metered per GB-month and egress per GB, which is the other half of the media question: a
room that stores bytes pays for them monthly, forever.

## Export

There is no dump, no export, and no backup command in the CLI. The top-level command list is
publish, env, delete, logs, call, describe, dev, sql, mcp, rename, generate, list, login, logout,
init, build, server, subscribe, start, lock, unlock, auth, version. Portability is therefore a query
you write yourself, and the only machine-readable form of it is `spacetime sql`:

```
spacetime sql timeline "SELECT COUNT(*) AS n FROM post" --format json
→ [{"schema":{"elements":[{"name":{"some":"n"},"algebraic_type":{"U64":[]}}]},
    "rows":[[209]],"total_duration_micros":5315,
    "stats":{"rows_inserted":0,"rows_deleted":0,"rows_updated":0}}]
```

A JSON envelope per query: column metadata, rows as positional arrays, timing, and write statistics.
An export is a loop over the room's tables, one query each, plus the key material. That the SQL
surface is marked UNSTABLE and subject to breaking changes is a real cost for a guarantee that is
supposed to outlive the provider.

## Media

The engine stores rows. A byte column is `t.array(t.u8())`, which is a `number[]` in TypeScript, and
it is charged as table storage. There is no object store, no CDN, no streaming egress. The archive
already treats media the way this forces: a `media` row holds `kind` and `url` and no bytes
(`Documentation/Reference/Storage-Model.md:34`), and the database mirrors that shape
(`Maintain/Spacetime/spacetimedb/src/Schema.ts:65`). Bytes belong in an object store behind a URL,
or in the export bundle, and never in the room's tables.

## Claim → source

| Claim                                                                      | Source                                                                                  |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Identity is a hash of JWT issuer and subject                               | `/docs/intro/key-architecture`, "Identity"                                              |
| A database configures its own identity providers                           | `spacetime auth --help` → `config`, `idp set\|enable\|disable`, `client`                |
| JWT-based identity was impersonable before v2.10.0                         | `/changelog/v2.11.0`, "Security Notice"                                                 |
| Tables are private unless declared public                                  | `/docs/tables/access-permissions`, "Public and Private Tables"                          |
| A view may read a private table and filter by caller                       | `/docs/tables/access-permissions`, "Using Views for Fine-Grained Access Control"        |
| RLS is experimental; the vendor recommends views                           | `/docs/how-to/rls`, opening notice                                                      |
| RLS binds `:sender`, ORs multiple rules, applies recursively               | `/docs/how-to/rls`, "How It Works", "Multiple Rules Per Table", "Recursive Application" |
| Module owners read every table regardless of RLS                           | `/docs/how-to/rls`, "`:sender`"                                                         |
| A per-user view is tracked per subscriber                                  | `/docs/functions/views`, "Why AnonymousViewContext Matters"                             |
| A view cannot scan; a query-builder view can                               | `/docs/functions/views`, "Why Views Cannot Use .iter()"                                 |
| Views accept positional arguments                                          | `/docs/functions/views`, "Views with Arguments" and "Limitations"                       |
| RLS applies to subscriptions                                               | `/docs/how-to/rls`, "Usage in Subscriptions"                                            |
| Private tables have no client surface                                      | `/docs/tables/access-permissions`, "Public and Private Tables"                          |
| Module outbound client is a synchronous fetch                              | `.../spacetimedb/dist/server/http_internal.d.ts`, `HttpClient`                          |
| Procedures cannot hold a transaction while requesting                      | `/docs/functions/procedures`, "HTTP Requests"                                           |
| Async IDC: dependencies, outbox tables, HTTP/2, result hooks               | `/changelog/v2.14.0`, "Async inter-database communication"                              |
| Synchronous IDC with atomic commit is unshipped                            | `/features`, request #5199                                                              |
| Host and module versions are coupled                                       | `/changelog/v2.14.0`, "Breaking Changes"                                                |
| Republish hot-swaps without disconnecting clients                          | `Maintain/Spacetime/AGENTS.md:99`                                                       |
| A breaking schema change can require data deletion                         | `spacetime publish --help`, `--delete-data`, `--break-clients`                          |
| No managed long-term-support tier                                          | `/features`, request #5213; `/pricing`                                                  |
| Free tier: 5 databases and 5 users per project, idle pausing               | `/pricing`, "Compare Features"                                                          |
| No dump or export command                                                  | `spacetime --help`, command list                                                        |
| `sql --format json` returns schema, rows, stats                            | `spacetime sql timeline "SELECT COUNT(*) AS n FROM post" --format json`                 |
| `describe` exposes tables, views, reducers, procedures, routes, env, types | `spacetime describe --help`                                                             |
| A byte column is `number[]`                                                | `Maintain/Spacetime/AGENTS.md` (procedures: `t.array(t.u8())` is `number[]`)            |
| Media is stored as a reference, not bytes                                  | `Documentation/Reference/Storage-Model.md:34`                                           |
| The registry carries Authz, IDC, History, VoIP submodules                  | `/modules`                                                                              |

## The nine questions

| Question                                           | Answer                                                                                                                                                                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-row or per-client read permissions?            | Yes, by two mechanisms: a public view whose rows depend on `ctx.sender`, or an RLS filter on a public table. The view is the supported one.                                                                                                        |
| Are subscriptions the authorization boundary?      | Only when the subscribed object carries the rule. A public table without RLS ships every matching row.                                                                                                                                             |
| Can a module gate a subscription by identity?      | Yes - through the view it subscribes to, or an RLS filter. Both are evaluated server-side at delivery, not filtered in the client.                                                                                                                 |
| Do procedures allow WebSockets, or only HTTP?      | HTTP only, synchronous and buffered. No socket API exists in the module's client. CDP needs an external bridge.                                                                                                                                    |
| How are module upgrades handled per room?          | `spacetime publish` per database, hot-swapping without disconnecting clients; `--delete-data=on-conflict` and `--break-clients` decide what a breaking change costs. Nothing in the engine stages a rollout across rooms - that is the host's job. |
| One database per room, or rooms as tables?         | Per room. It is the only unit that makes an export per-room, a membership a database-level fact, and a bad rule unable to reach another room. It costs a database per room against a five-database free tier.                                      |
| How does a person export everything they authored? | A query per table through `spacetime sql --format json`, plus the key material. There is no engine primitive for it.                                                                                                                               |
| Where do media bytes live?                         | Outside the database. Rows hold references; a byte column would be charged as table storage monthly.                                                                                                                                               |
| What survives if the provider disappears?          | Whatever was exported, in the form the export left it. Nothing about the engine is self-preserving: no dump command, no portable backup, no replication the client can read without the provider.                                                  |

## The shadow fleet

The harvesting posture is a read-only one, and the reason is structural rather than moral: reading a
public timeline leaves nothing on the source platform, while liking, bookmarking and reposting
change the account's state and are visible to the platform and to anyone who looks. RFC-0006 already
makes that the default in the tool layer, enforced at the transport seam rather than trusted to the
caller.

What the database adds to that posture is a second, quieter exposure. A harvester is a client with
an identity, and the module sees it: `ctx.sender` on every write, a connection id per session, and a
timestamp per row. A fleet that ingresses into a room therefore leaves a complete record of which
identity read which room, when, and how much - in the room's own tables, readable by the operator of
that room. The invisibility claim is about the source platform, and it does not extend to the
destination.

Three postures follow, and they are configuration, not code:

- **Read-only by default.** No scheduled job may call a mutating command. A write to the source is a
  separate, named, confirmed action, and it is never the harvesting path.
- **Reference, not copy, for media.** A harvested post carries URLs; the bytes stay where they are
  until something deliberately fetches them. This keeps the room small and keeps the fleet's egress
  off the source's CDN.
- **The harvest is attributable inside the room.** A row records the identity that wrote it, so
  provenance is a column, not a guess. A network that wants its harvest unattributable has to say so
  in the audience rule, and the engine will not do it for them.

## Encryption against validation

The provider-blind claim forces a split, and the split has to be stated as a rule rather than
discovered in an incident.

| Layer  | Can check                                                                    | Cannot check                               |
| ------ | ---------------------------------------------------------------------------- | ------------------------------------------ |
| Client | everything - it holds the key                                                | whether the module accepted the write      |
| Module | identity, membership, audience, envelope size, rate, content hash, signature | what the payload says                      |
| Host   | connection counts, timing, room membership, storage volume                   | payload contents, if and only if encrypted |

The module can still enforce a great deal, because the things it needs to decide with are cleartext
and signed: the author identity, the audience, the action class and target, a timestamp and nonce, a
size, a content hash, and a signature over all of it. What it cannot enforce is meaning - a rating
outside its range, a comment that is not a comment, an argument the reducer would have rejected.
That validation moves to the client, and a client can lie to itself.

Two engine facts make this concrete rather than theoretical. First, RLS and views do not hide
anything from the operator: module owners read every table regardless of RLS. Second, the identity
is still a plaintext handle derived from a JWT issuer and subject, so a room's access log links
identities whether or not the payloads are readable. Encrypting content buys confidentiality of
content; it does not buy unlinkability of participants, and the two must not be sold as one thing.

## Everything is configuration

RFC-0011 fixes the law: every term declares a default, an effect, a validation rule and a scope, and
unknown keys survive a read-write cycle. This section proposes the term set that the network needs,
in the shape that law requires. It is a schema proposal, not a settled list.

### The four laws, restated as checks

1. A term with no default, no effect, no rule, or no scope does not exist.
2. A key the schema does not know is preserved verbatim and reported under `unknown`, never dropped
   and never fatal - so a newer client's configuration survives an older build.
3. Adding a term increments `schemaVersion` and states how an existing map acquires it.
4. A technology choice is a term. Transport, cipher, key agreement, and certificate authority are
   configuration, so a network migrates between them without forking the module.

### Terms

| Term                            | Scope   | Default                              | Effect                                                   | Validation                                                          |
| ------------------------------- | ------- | ------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------- |
| `schemaVersion`                 | global  | `1`                                  | the reader's compatibility gate                          | integer, monotonically increasing; an unknown major is refused      |
| `identity.issuer`               | room    | the host's SpacetimeAuth issuer      | which IdP mints the identity; the anti-linkability lever | absolute URL; must match the room's configured provider             |
| `identity.subjectClaim`         | room    | `sub`                                | which JWT claim becomes the identity subject             | one of the claims the provider emits                                |
| `identity.keyAlgorithm`         | room    | `ed25519`                            | signature algorithm for authored rows                    | a name in the supported set; unknown names are preserved, not run   |
| `identity.certificateAuthority` | room    | the room's own root                  | who may certify a device subkey                          | a key fingerprint or `self`                                         |
| `audience[].name`               | room    | `internal`                           | the value written into a row's audience column           | lowercase token, unique per room                                    |
| `audience[].readers`            | room    | `members`                            | which grant admits a reader                              | `members`, `grant:<name>`, `public`, or `room:<identity>`           |
| `audience[].leavesRoom`         | room    | `false`                              | whether export and republication may carry the row       | boolean; `true` requires `readers` to be `public`                   |
| `channel[].transport`           | room    | `websocket`                          | how a client reaches the room                            | a transport the host serves; unknown values are preserved           |
| `channel[].endpoint`            | room    | the host's URL                       | where the client connects                                | absolute URL or `host`                                              |
| `cipher.suite`                  | room    | `AES-GCM-256`                        | payload encryption                                       | a suite in the supported set; a downgrade requires an explicit bump |
| `cipher.ivBytes`                | room    | `12`                                 | IV length per message                                    | integer; must equal the suite's requirement                         |
| `cipher.aadFields`              | room    | room, author, audience, content hash | the header bound into the AEAD                           | an ordered subset of the envelope's cleartext fields                |
| `propagation.mode`              | room    | `manual`                             | whether a post may leave the room                        | `manual`, `federated-push`, `off`                                   |
| `propagation.targets`           | room    | `[]`                                 | rooms a push may address                                 | database identities; each must accept the audience                  |
| `hosting.server`                | machine | `local`                              | which node the room is published to                      | a configured server nickname or URL                                 |
| `hosting.moduleVersion`         | room    | the published hash                   | which artifact the room runs                             | content hash; a mismatch refuses the publish                        |
| `hosting.compatibilityWindow`   | machine | `0`                                  | publishes a room may lag the canary                      | integer days                                                        |
| `retention.observationDays`     | room    | `0` (keep)                           | how long a metric sample survives                        | integer; `0` means no expiry                                        |
| `fleet.posture`                 | machine | `read-only`                          | whether harvesting may mutate the source                 | `read-only` only; any other value requires a separate command       |

Three of these are worth calling out because they are the ones that would otherwise be code:

- `identity.issuer` is what makes two rooms unlinkable. It has to be a term, because the answer
  differs per room and changes when a room migrates hosts.
- `cipher.aadFields` is the difference between a ciphertext and a ciphertext that cannot be moved to
  another row. It is configuration because the envelope's header is the thing being bound, and the
  header will grow.
- `fleet.posture` is a term with one legal value. That is deliberate: it is read by the tool layer
  as a precondition, and a configuration that says anything else is a validation failure rather than
  a mode.

### Shape

```
{
	"schemaVersion": 1,
	"identity": {
		"issuer": "https://auth.example.invalid/room/alpha",
		"subjectClaim": "sub",
		"keyAlgorithm": "ed25519",
		"certificateAuthority": "self"
	},
	"audience": [
		{ "name": "public", "readers": "public", "leavesRoom": true },
		{ "name": "typed", "readers": "grant:type", "leavesRoom": false },
		{ "name": "internal", "readers": "members", "leavesRoom": false }
	],
	"channel": [{ "transport": "websocket", "endpoint": "host" }],
	"cipher": {
		"suite": "AES-GCM-256",
		"ivBytes": 12,
		"aadFields": ["room", "author", "audience", "contentHash"]
	},
	"propagation": { "mode": "manual", "targets": [] },
	"hosting": { "server": "local", "moduleVersion": "sha256:…" },
	"fleet": { "posture": "read-only" }
}
```

### What the schema cannot do

A term may choose among behaviours that exist; it cannot create one. `channel[].transport` can name
`websocket` today because the host serves one; a term naming a transport the host does not serve is
preserved and reported as unknown rather than obeyed. That is the honest boundary of
configuration-as-data: it removes the fork for choices the code can already make, and it cannot
substitute for the code that would make a new choice.

## Prior art, and what does not transfer

**Inventory, `Crate/Navigate-WASM`.** A Rust workspace shipping a local-first WebAssembly binary to
a host, gated by `validate.sh` and documented by `DEPLOYMENT.md`. What transfers: the packaging
discipline - `crate-type = ["cdylib", "rlib"]`, `wasm-pack build --target web --release`, Brotli at
quality 11, an explicit size budget in the build script's header, and a validation gate that fails
on an environment, build, security, or dependency problem before anything is deployed. The gate is
the valuable half, and it is the half a SpacetimeDB room needs: a module publish that has not passed
a gate is a fleet-wide event.

What does not transfer: the brief describes `.cargo/config.toml` as pinning the wasm target. The
file in that repository contains `[build] target-dir = "target"` and nothing else; the target is
passed by `wasm-pack` and by `cargo check --target wasm32-unknown-unknown` inside the scripts. The
pin is real in effect and absent in the file named for it, which is exactly the kind of claim that
has to be checked rather than repeated. Also not transferable: a SpacetimeDB module is built by
`spacetime build` and published by `spacetime publish`; the `wasm-pack` output layout is not the
artifact the host accepts, so only the gating pattern carries over.

**NowPlayingCard.** An end-to-end encrypted pipeline split into `Common`, `NPM`, `NPMAPI`,
`NPMSocket` and `WebSite`, where the service relays ciphertext and never holds the key. What
transfers: the split itself - one module owns the primitive, one owns transport, one owns the
service boundary, one owns the surface - and the primitive: AES-GCM through WebCrypto, a 12-byte IV
from `crypto.getRandomValues` per message, `tagLength: 128`, key material imported as a JWK with
`kty: "oct"` and `alg: "A256GCM"` (`Common/Source/Function/Encrypt.ts`, `Decrypt.ts`).

What does not transfer is the envelope. `Encrypt.ts` passes only
`{ name: "AES-GCM", iv, tagLength }` and no `additionalData`, so the ciphertext is portable: a blob
lifted from one row decrypts identically in another row, or another room, with no failure. The same
file takes the key as a base64url `k` string in an argument, which leaves custody, rotation, and
recovery entirely to the caller. RFC-0013 corrects both - the message key is derived per post, and
the canonical envelope header is bound as `additionalData` - which is the right reading of the
precedent: keep the primitive, replace the envelope, and give key custody its own design.

## What this cannot do

- **Hide a row from the operator.** Module owners read every table regardless of RLS. Provider
  blindness is a property of ciphertext only.
- **Offer anonymity.** An identity is a stable global hash of issuer and subject. Two rooms sharing
  an issuer share identities, and a room's access log links participants even when payloads are
  opaque.
- **Express a write in two rooms atomically.** IDC is asynchronous with an outbox; the synchronous
  two-phase form is unshipped.
- **Open a WebSocket from a module.** The outbound client is a synchronous buffered fetch.
- **Scan inside a procedural view.** Indexed lookups only; a scan needs a query-builder view.
- **Page through a view.** Pagination for views and tables is an open feature request; a page is a
  subscription argument and a client-side slice.
- **Join across tables in one subscription.** Linked multi-table subscriptions are an open feature
  request; the workaround is one subscription per table.
- **Declare a foreign key.** Referential integrity is not in the engine; the registry's Relations
  submodule exists because of it.
- **Choose a cheaper storage tier for cold rows.** A disk-table tier is an open feature request.
- **Export with one command.** There is no dump; portability is a loop of SQL queries over a surface
  the vendor marks unstable.
- **Store media.** Rows and byte arrays only, charged as storage; bytes belong outside.
- **Pin the host's runtime version.** The managed host tracks the latest release; a
  long-term-support tier is an open request, and the alternatives are standalone or an enterprise
  node.
- **Roll a module out gradually by itself.** Publishing is per database; staging, canaries and
  compatibility windows are the host's process, built on top of `publish`, not features of it.
- **Reject a connection from a TypeScript module with a documented guarantee.** See the UNKNOWN
  register.

## Phased task list

Cards, in the order the dependencies allow. Phase 0 settles what the later phases would otherwise
assume; no phase begins before its predecessors' acceptance test passes. The cards are not created
here - creating them dispatches work, and this record authorises research only.

### Phase 0 - spikes against a local server

| Card                                      | Question it settles                                                                                           | Acceptance                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spike: view-gated room read               | does a per-user view return zero rows to a non-member and the rows to a member, without RLS?                  | publish a two-table probe module; a non-member subscription returns `0` rows; adding the membership row returns the rows; removing it returns to `0` |
| Spike: connection rejection in TypeScript | does throwing inside `clientConnected` disconnect the client, as the C#/Rust/C++ page describes?              | a connection attempt fails with a close event; the module log records the rejection                                                                  |
| Spike: per-room issuer                    | can two local databases carry different SpacetimeAuth issuers, producing different identities for one person? | two databases, two issuers, one subject: the two identities differ, and each is stable across reconnects                                             |
| Spike: IDC round-trip                     | does an outbox insert in room A reach a reducer in room B, and does `onResult` report the outcome?            | one row in A's outbox produces one row in B; `onResult` fires once with `Ok`; a failing receiver fires with `Err`                                    |
| Spike: export round-trip                  | is `sql --format json` over every table sufficient to rebuild a room elsewhere?                               | export, rebuild into a second database, and diff row counts and content hashes per table                                                             |
| Spike: read-set cost                      | what does a per-viewer audience view cost when the audience rule spans two indexes?                           | measure view recomputation on a seeded room; record the read set size and the recompute count                                                        |

### Phase 1 - permissions model

Card: **room permission model as a view contract.** Every readable object is exposed by a view whose
`ViewContext` path is an indexed lookup; the audience rule is expressed as an index, or as a
query-builder view where a scan is unavoidable. Acceptance: a table of audiences × viewers, where
each cell is proven by a subscription that returns rows or does not.

### Phase 2 - room lifecycle

Card: **room state machine and publish path.** `created → open → archived → deleted`, with the
module artifact recorded by hash, `--delete-data` decided per transition, and a publish refused when
the recorded hash and the artifact disagree. Acceptance: each transition runs on a local server and
leaves the state the RFC names.

### Phase 3 - identity and invitations

Card: **per-room issuer and invitation records.** The room's issuer is configuration; an invitation
is a content-addressed row carrying the room's database identity and a claim code that is spent, not
stored. Acceptance: an invitation presented twice admits once; an identity from another room's
issuer is refused.

### Phase 4 - export and portability

Card: **export bundle and import check.** A bundle is one JSON file per table from
`sql --format json`, plus the key material and a manifest of content hashes. Acceptance: a bundle
taken from one database imports into another and the per-table hashes match; the bundle decrypts
with no server.

### Phase 5 - hosting and upgrades

Card: **canary publish and compatibility window.** A publish goes to the host's own room, then a
named canary set, then the fleet; each room records its artifact hash; a room may lag the canary
within the configured window. Acceptance: a deliberately broken module reaches one room and stops.

### Phase 6 - media

Card: **media reference contract.** A media row holds kind, URL, and a content hash; bytes live in
an object store or in the export bundle; the room stores no byte arrays. Acceptance: a post with
media imports and exports without the database's storage growing by the media's size.

### Phase 7 - harvesting posture

Card: **fleet posture as a precondition.** The tool layer reads `fleet.posture` and refuses a
mutating command from a scheduled job; a harvest records the identity that wrote each row.
Acceptance: a scheduled harvest cannot like, bookmark, or repost, and the refusal is a validation
error rather than a runtime surprise.

## UNKNOWN register

Each item is a question for the vendor or a spike, never an assumption.

| Question                                                                                                | Why it is UNKNOWN                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does throwing in a TypeScript `clientConnected` reject the connection?                                  | the reject-connections page documents C#, Rust and C++ only; the TypeScript tab is absent                                                             |
| Would the host permit an HTTP `Upgrade` through `ctx.http.fetch`, making a socket reachable indirectly? | the documented client is fetch-shaped and returns a buffered response; nothing states what the host forbids                                           |
| Do RLS filters appear in `spacetime describe` for a module that declares them?                          | `describe` accepts tables, views, reducers, procedures, routes, env and types - filters are not an entity type, and the probe module declares none    |
| Does Maincloud honour per-database `spacetime auth idp` configuration?                                  | `spacetime auth` is documented for a database; whether the managed host exposes it is not stated                                                      |
| What is the actual per-subscriber cost of a per-viewer audience view at room scale?                     | the docs give the shape of the cost and no numbers; only a measured probe answers it                                                                  |
| Does a query-builder view support the audience join without materialising the scan per subscriber?      | the docs say query-builder views support incremental evaluation; the join shape is untested                                                           |
| Is there an export primitive outside the SQL surface that is not marked unstable?                       | the command list has no dump, export, or backup command, and `sql` is marked unstable                                                                 |
| Does the IDC actor survive a receiver database being unpublished and republished?                       | the changelog describes delivery and result callbacks, not the failure mode of a missing receiver                                                     |
| Is IDC delivery ordered, exactly-once, or at-least-once?                                                | the v2.14.0 notes describe an insert-only outbox and a delivery actor; the ordering and duplication guarantees are stated only by the submodule layer |
| Can a room's module read its own published artifact hash?                                               | `ctx.databaseIdentity` exists; no artifact-version accessor is documented                                                                             |
| Does `--delete-data=on-conflict` preserve rows in tables untouched by the schema change?                | the flag is documented as destroying data on a breaking change; the granularity is not stated                                                         |

## Claim → test

| Claim                                  | Test                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A private table has no client surface  | subscribe to a private table from a client: the subscription fails or returns nothing                |
| A view gates by caller                 | the Phase 0 view-gated room read spike: `0` rows before membership, rows after, `0` after removal    |
| A public table without RLS leaks       | connect with a fresh identity and subscribe to `post`: every row arrives                             |
| RLS is unnecessary for the room        | the room's tables declare no `clientVisibilityFilter`, and the permission tests still pass           |
| Outbound HTTP works, sockets do not    | a procedure fetches an HTTP URL and returns its status; no procedure can open a socket               |
| IDC is eventual, not atomic            | a failing receiver leaves the sender's row committed and reports `Err` through `onResult`            |
| Publish is destructive at the boundary | a breaking schema change without `--delete-data` is refused; with `on-conflict` it destroys data     |
| Export is a query, not a command       | `spacetime --help` lists no export; `spacetime sql … --format json` returns the envelope above       |
| Media stays out of the database        | a post with media imports and exports, and the database's storage does not grow by the media's size  |
| Identity is per-issuer                 | two databases with two issuers, one subject: two different identities, each stable across reconnects |
| A term cannot invent a behaviour       | a `channel[].transport` naming an unserved transport is reported under `unknown` and changes nothing |

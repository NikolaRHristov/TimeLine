# SpacetimeDB Model

What the database can and cannot be for an agentic system, argued against the module this repository
already runs (`Maintain/Spacetime/spacetimedb`). This is a design record, not a description of code
that exists.

## The premise that does not hold

**A row in a table-definition table is not a table.** SpacetimeDB compiles the schema into the
published module: tables, columns and reducers are fixed at publish time. Inserting a row that says
"capability X has these columns" creates data, not a table, and no reducer can execute DDL.

So "the database contains the schema of itself, and an authorised process changes it at runtime" is
achievable in one of two ways, not both at once:

1. **An interpreted logical schema.** Native tables hold operational facts; a catalog table
   describes extensible capability state; a reducer validates an update against that catalog and
   stores it as rows. Flexible, but every reader now interprets rather than queries.
2. **An authorised build-and-publish path.** The module is regenerated and published by a privileged
   controller. Truly native, but a deploy, not a write.

The recommendation is a hybrid: native tables for operational facts and concurrency, an interpreted
layer for capability state that genuinely varies, and an explicit privileged path for physical
change. Choosing per-table is the design decision; choosing once for the whole system is the
mistake.

## The trust boundary

The database owns:

- declared capabilities, versions, contracts, state classes, admission policies
- identities, roles, scoped grants, approvals, audit history
- tasks, attempts, resource leases, commands, results
- observations, research threads and their step traces, verification evidence, skill manifests,
  persisted UI state
- the existing archive

An external worker owns the CDP connection, the browser process, the chat interaction, the
measurement tooling and skill execution. **Reducers cannot make network or filesystem calls**;
procedures can perform external I/O, which is why the worker exists at all.

That boundary is what makes the lease model necessary: the database can record that a browser
session is claimed, but only the worker can prove it is alive.

## The lease

A lease is a row with an owner, a state class, an acquired time, an expiry and a fence. The rule
that makes it safe is not the row but the reducer: a claim is granted only when no live lease holds
the resource, and every write from a worker carries the fence it was granted, so a worker whose
lease expired cannot write as though it still held one.

## What the existing archive keeps

The archive tables - `post`, `author`, `observation`, `event`, `membership`, `media` - survive
unchanged. They are operational facts with a single write path (`observe`), append-only observations
keyed by content, and one field (`visibility`) that decides what reaches the public site. Nothing
about an agentic layer changes those rules, and moving them would only add risk.

## What not to put in the database

- Anything the worker must hold in memory to be correct: an open socket, a half-finished navigation,
  a browser process handle.
- Raw credentials. A reference to a credential, yes; the secret, no.
- Reasoning transcripts that may contain personal data or secrets, unless the retention and deletion
  policy is written down first. An append-only log is not a privacy strategy.
- Derived views that every reader would have to keep consistent by hand. Use a view, not a table.

## Open questions

- Whether the interpreted layer should be a typed catalog with a validation reducer, or opaque JSON
  with per-capability reducers. The first is queryable; the second is honest about being extensible.
- Whether traces belong in the same database as the archive. They have different volume, different
  retention and different access rules; sharing a database makes the subscription surface larger
  than any one reader needs.

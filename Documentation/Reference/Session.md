# The session layer - who is here, and in which context

RFC-0043 decides the workspace's identity, network and publishing model. This file records where
that decision lives in the code, what each part refuses, and what is still UNKNOWN. The record is
the authority; nothing here restates a rule it does not also point at.

## Where the pieces are

| Path                                           | What it is                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `Source/Script/Session/Session.ts`             | The slot: identity, memberships, selected context, state, time           |
| `Source/Script/Session/Context.ts`             | `own` and `room`, their keys, and the destination each one publishes to  |
| `Source/Script/Session/Role.ts`                | The three roles, the four grants, and RFC-0043 §4 as one `Allows` switch |
| `Source/Script/Session/Seam.ts`                | `publish` and `withdraw`, and the one function every other act routes to |
| `Source/Script/Session/Ownership.ts`           | One owning store per field, and the three shapes a write can settle to   |
| `Source/Script/Session/State.ts`               | `live`, `snapshot`, `static`, `joined`, and the line that names one      |
| `Source/Script/Session/Embed.ts`               | The session a page embeds at build time, as a reader the store calls     |
| `Source/Component/Workspace/ContextSwitch.tsx` | The strip: one tab per context, and the state line beside them           |

The layer is client-side. A page derives its props at build time and hands them in; the island
decides the rest. Nothing under `Source/Script/Session/` reads a collection, writes markup, or holds
a private key.

## The slot starts empty

`Anonymous(Contexts, AsOf)` is the slot every page mounts with: no identity, no memberships, the
first context selected, `static`, and the build's own time. `Resolve` replaces it with a `snapshot`
when a reader answers, and otherwise returns the slot it was given.

A failed read never empties the page. It returns the initial slot and logs exactly one warning whose
text starts with `session:`, which is what the check under Verifying reads. A silent absence would
be the fallback RFC-0003 refuses: a reader who cannot tell the build's rows from a session's will
act on the build's rows.

## Two contexts, one drawer

`Select(Slot, Next)` takes a slot and a context and returns a slot. There is no drawer parameter and
no drawer field, so a context switch cannot alter one - and `Enter` hands the drawer through as the
same value, not a copy, so the bytes a page receives are the bytes the slot held.

`Enter` also decides the canvas: the selected context's own, or the build's when the context has
none. An unreadable room renders the projection on screen rather than an empty container, because
"not readable" is not "nothing there".

## One verb across the seam

`CrossTheSeam` accepts `publish` and `withdraw` and refuses everything else at run time as well as
at compile time. Every other named act - read, vote, curate, select, comment, nominate, observe,
arrange, propagate - has exactly one route, `ActWithoutCrossingTheSeam`, whose name is the rule and
whose result says where the act is performed: the drawer, the room, or the viewer.

The seam refuses with a named reason rather than a boolean: `no-session`, `not-granted`,
`not-author`, `stale-write`, `not-a-crossing-act`. Each is a different sentence to render.

## Ownership, not merge

`Settle(Field, Writer, Local, Remote)` decides one write against the copy that already exists.
`Writer` is passed rather than inferred, so a canvas component saving a drawer field is refused with
`not-owner`. Append-only rows both survive; a single-holder field whose writer is behind is refused
with `stale-write` naming the version it saw; the viewer's arrangement is the only value a second
writer may hold, because there is no second writer.

`Project` marks a copy read across the seam `Writable: false`, so writing through a projection is a
compile error rather than a convention.

## What is UNKNOWN

- **Where the local seam is reached from the browser.** The drawer's live source is the owner's own
  store through the transport seam (RFC-0003), and that seam is CLI-side today. Every page passes no
  reader and stays `static`. Spike: name the endpoint the tool layer would serve, settle it in the
  substrate record, then claim a live drawer.
- **A drawer record's signing identity.** A drawer row carries the handle the page showed, not the
  identity whose subkey signed it, so publishing into a room is refused `not-author` until the
  identity migration lands (RFC-0013).
- **A resumable subscription cursor.** `live` is unreachable until RFC-0043 §9 row 3 is settled, so
  a successful read is `snapshot` and nothing claims otherwise.

## Verifying

The check is manual, and it is three readings of the built page:

```sh
pnpm run build                                   # and the build itself
```

Serve a copy of the build rather than the live tree, so a concurrent rebuild cannot swap a bundle
mid-page. Then, with a Chromium on the CDP endpoint:

- **The real page** - `/Workspace/` opens with the anonymous slot, no error, and a `locked` seam.
- **The resolved page** - the same document with the session element a signed-in page embeds,
  spliced into the HTML before any island script runs, reads `snapshot`, fills the drawer, and
  survives a context switch with the drawer byte-identical.
- **The malformed page** - the same document with a session element that is not JSON logs exactly
  one warning whose text starts with `session:`, and still shows the anonymous slot.

The splice is part of the check, not a convenience: the element has to be in the document before any
island script runs, or the read races hydration.

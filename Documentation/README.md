# Documentation

Public, anonymised documentation for this site's tooling and data model.

Every folder here answers a different question. The reference states what is true, the plan states
what is intended, the RFCs state what was decided, and the skills state how to do the work.

---

## What lives where

- **`Plan/`** - the intent. `Bookmark-Pipeline.md` holds the three-stage plan: tool layer, ingest,
  distribution.
- **`Reference/`** - the facts. One file per subject, each claim carrying the command that proves
  it.
- **`Reference/Diagram/`** - three storyboards - `Site.md`, `Archive.md`, `Board.md` - each page one
  diagram under a shared legend, and the last page of each the states nothing models.
- **`RFC/`** - the decisions. Numbered records, one per question, in the house format.
- **`Skill/`** - the procedures. One directory per skill, each with a `SKILL.md` an agent loads
  before the task rather than after it fails.
- **`Assets/`** - the design reference. `Full Composition.png` is the frame every surface is
  measured against.

---

## The reference set

- **`Reference/Configure.md`** - every configuration key, its default, and the environment
  overrides.
- **`Reference/Agent-Quickstart.md`** - the five onboarding steps, written for a generic agent.
- **`Reference/Maintain-CLI.md`** - command surface, JSON shapes, schema export.
- **`Reference/Storage-Model.md`** - the shadow store and the published collection, and why there
  are two.
- **`Reference/Transport.md`** - CDP as the primary transport, the store as the read-only fallback.
- **`Reference/Build.md`** - how the tool layer and the site are built.
- **`Reference/Compatibility.md`** - the Node floor the build needs, the browser baseline the
  stylesheets imply, and the upgrade policy that follows from both.
- **`Reference/Content.md`** - the content layer: strings baked in from `Content/` at build time.
- **`Reference/URL-And-Shell.md`** - URL targeting and the shell's quoting rules.
- **`Reference/Voting.md`** - the Voted index, owner approval, and bringing your own Firebase.
- **`Reference/Design-Composition.md`** - the measured geometry of the workspace frame: the rail's
  depth table, the drawer's item heights, the canvas grid.
- **`Reference/Session.md`** - the session layer: the slot, the two contexts, the role matrix, the
  one verb across the seam, and the four states an island may name.
- **`Reference/Showcase-Layout-Research.md`** - what four published pages do with their vertical
  space, and which of it the showcase surface took.
- **`Reference/Network-Substrate.md`** - what SpacetimeDB actually provides for rooms, permissions
  and federation, with a claim → source table, the configuration schema the network needs, and the
  engine's limits.
- **`Reference/RFC-Classification.md`** - the audit of the RFC corpus's classification, the three
  axes that replace it, and the assignment of all seventy-six records.
- **`Reference/Effects-And-State.md`** - what belongs in the database and what belongs in a process,
  the two-transaction shape a scrape takes, and the rule that makes the reducer, not the caller, the
  guarantee.

---

## The skills

One directory per skill, each with a `SKILL.md` and a `Reference/Index.md`. The body holds the
rules; a worked instance lives in `Reference/` behind a one-line pointer.

- **`Skill/Timeline-Bookmarks/`** - the archive pipeline: scrape the shadow store, publish the
  collection, build the site.
- **`Skill/Timeline-Browser-Transport/`** - driving the person's own browser over CDP, and what a
  relaunch silently drops.
- **`Skill/Chat-Research/`** - asking a web chat product a research question over CDP: the four
  drivers, the checks a composer send needs, and the output contract that keeps the answer readable.
- **`Skill/Timeline-Site-Build/`** - the Astro build: the config layer that decides whether a page
  compiles, and the island layer that decides whether it is the page.
- **`Skill/Progressive-Enhancement/`** - the first paint is the server's; the no-script audit that
  proves it.
- **`Skill/Design-Verification/`** - proving a built page matches the design, not just that it
  compiles.
- **`Skill/Figma-MCP/`** - reading a design file into components.
- **`Skill/SpacetimeDB-Local/`** - running and editing the local SpacetimeDB module.
- **`Skill/RFC-Board/`** - assembling the public RFC project from the committed records: the file is
  authoritative, the issue follows it, the project item follows the issue.
- **`Skill/Parallel-Epic-Execution/`** - several agents working the same tree at once.
- **`Skill/Timeline-Hermes-Maintenance/`** - the gateway, the board and the workers, when task work
  stalls.
- **`Skill/Tool-Archive/`** - keeping a working script instead of rewriting it next session.
- **`Skill/Skill-Authoring/`** - where a lesson lives, the naming and the anonymisation gate, and
  the contract check that holds the tree to them.

---

## Rules for this folder

- No handles, list ids, post ids, session tokens, cookies, profile paths or extension ids.
  Identifiers appear as `<handle>`, `<list-id>`, `<slug>`.
- No machine-specific path. A command reads its configuration from the environment or from the
  gitignored local map, never from a path written into a tracked file.
- Every claim carries the command that proves it, or is marked as intent.
- The local identifier map lives outside version control, at
  `Maintain/Configuration/Local/Configuration.local.json`. Its tracked template is
  `Maintain/Configuration/Example/Configuration.example.json`.

---

## Names that are not account data

A tracked file names no person. The rule is the one above it: identifiers appear as `<handle>`,
`<list-id>`, `<slug>`, and no machine-specific path is written down. A public package namespace is
not an identifier - `@playform/build`, `@playform/compress` and `@playform/inline` resolve from
`registry.npmjs.org`, so the dependency name is public by construction.

The private wordlist that the audit used to subtract - `Maintain/Configuration/Local/Origin.txt` -
stays local and gitignored. A tracked list of the names being hidden would be the leak it exists to
prevent.

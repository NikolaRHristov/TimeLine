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
- **`Reference/Content.md`** - the content layer: strings baked in from `Content/` at build time.
- **`Reference/URL-And-Shell.md`** - URL targeting and the shell's quoting rules.
- **`Reference/Voting.md`** - the Voted index, owner approval, and bringing your own Firebase.

---

## The skills

- **`Skill/Timeline-Bookmarks/`** - reading and refreshing the saved-post archive.
- **`Skill/Timeline-Browser-Transport/`** - driving the person's own browser over CDP.
- **`Skill/Timeline-Hermes-Maintenance/`** - the shadow store, publishing, and the workspace layout.
- **`Skill/SpacetimeDB-Local/`** - running and editing the local SpacetimeDB module.
- **`Skill/Parallel-Epic-Execution/`** - several agents working the same tree at once.
- **`Skill/Figma-MCP/`** - reading a design file into components.
- **`Skill/Tool-Archive/`** - keeping a working script instead of rewriting it next session.

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

## Why the leak audit subtracts names instead of narrowing paths

`Scripts/AuditLeaks.sh` sweeps every tracked file for the private origin names in
`Maintain/Configuration/Local/Origin.txt`. Some of the hits that sweep produces are not account
data, and they are kept on purpose.

- **The `@playform` npm scope.** `@playform/build`, `@playform/compress` and `@playform/inline` all
  resolve from `registry.npmjs.org`, so the dependency name is public by construction. Replacing the
  esbuild driver would change how `Maintain/Source` compiles for no privacy gain.
- **The maintainer's own funding slug, conduct contact and CI committer identity.**
  `open_collective: playform-cloud-collective`, `Community@PlayForm.Cloud` and
  `Commit@PlayForm.Cloud` sit in the maintainer's own repository. Substituting a different identity
  would be false attribution.

The alternative - narrowing the sweep to `Source/`, `Documentation/` and `README.md` - was rejected
because it would stop auditing `Maintain/`, `.github/` and the root config files, which is exactly
where the hits occur. Instead `Origin.public.txt` lists the entries of `Origin.txt` that are also
public namespaces, and the script greps the set difference, so a genuinely private name is still
caught anywhere in the tree.

Both directions are reproducible:

```bash
# a private origin anywhere -> FAIL
printf 'contact: <private-origin> ops\n' > Documentation/Canary.md
git add Documentation/Canary.md
Scripts/AuditLeaks.sh .          # RESULT leaks present, exit 1

# only the public npm scope -> PASS
printf 'deps: @playform/build\n' > Documentation/Canary.md
git add Documentation/Canary.md
Scripts/AuditLeaks.sh .          # RESULT clean, exit 0
```

`<private-origin>` stands for a word that is in `Origin.txt` and not in `Origin.public.txt`. The
wordlist itself stays out of this repository.

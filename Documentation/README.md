# Documentation

Public, anonymised documentation for this site's tooling and data model.

| Path                                | What it is                                                      |
| ----------------------------------- | --------------------------------------------------------------- |
| `Plan/Bookmark-Pipeline.md`         | The three-stage plan: tool layer, ingest, distribution          |
| `Reference/Configure.md`            | Every configuration key, its default, and the env overrides      |
| `Reference/Agent-Quickstart.md`     | The five onboarding steps, written for a generic agent           |
| `Reference/Maintain-Cli.md`         | Command surface, JSON shapes, schema export                      |
| `Reference/Storage-Model.md`        | The shadow store and the published collection, and why two       |
| `Reference/Transport.md`            | CDP as primary transport, the store as the read-only fallback    |
| `Reference/Build.md`                | How the tool layer and the site are built                        |
| `Reference/Url-And-Shell.md`        | URL targeting and shell quoting rules for argv                   |
| `Skill/Timeline-Bookmarks/SKILL.md` | An operating procedure any agent can load before using the tooling |

## Rules for this folder

- No handles, list ids, post ids, session tokens, cookies, profile paths or
  extension ids. Identifiers appear as `<handle>`, `<list-id>`, `<slug>`.
- Every claim carries the command that proves it, or is marked as intent.
- The local identifier map lives outside version control, at
  `Maintain/Configuration/Local/Configuration.local.json`; its tracked template
  is `Maintain/Configuration/Example/Configuration.example.json`.

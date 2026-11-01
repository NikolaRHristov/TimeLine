# Documentation

Public, anonymised documentation for this site's tooling and data model.

| Path                                | What it is                                             |
| ----------------------------------- | ------------------------------------------------------ |
| `Plan/Bookmark-Pipeline.md`         | The three-stage plan: tool layer, ingest, distribution |
| `Reference/Maintain-Cli.md`         | Command surface, JSON shapes, schema export            |
| `Reference/Content-Model.md`        | Astro collections and their fields                     |
| `Skill/Timeline-Bookmarks/SKILL.md` | A skill an agent can load before using the tooling     |

## Rules for this folder

- No handles, list ids, session tokens, cookies, profile paths or extension ids.
  Identifiers appear as `<LIST_AI>`, `<LIST_UI>`, `<LIST_CODE>`.
- Every claim carries the command that proves it, or is marked as intent.
- The local identifier map lives outside version control, at
  `Maintain/Configuration/Local/Configuration.local.json`.

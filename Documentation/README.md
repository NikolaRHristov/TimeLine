# Documentation

Public, anonymised documentation for this site's tooling and data model.

| Path                                | What it is                                                         |
| ----------------------------------- | ------------------------------------------------------------------ |
| `Plan/Bookmark-Pipeline.md`         | The three-stage plan: tool layer, ingest, distribution             |
| `Reference/Configure.md`            | Every configuration key, its default, and the env overrides        |
| `Reference/Agent-Quickstart.md`     | The five onboarding steps, written for a generic agent             |
| `Reference/Maintain-CLI.md`         | Command surface, JSON shapes, schema export                        |
| `Reference/Storage-Model.md`        | The shadow store and the published collection, and why two         |
| `Reference/Transport.md`            | CDP as primary transport, the store as the read-only fallback      |
| `Reference/Build.md`                | How the tool layer and the site are built                          |
| `Reference/URL-And-Shell.md`        | URL targeting and shell quoting rules for argv                     |
| `Reference/Voting.md`               | The Voted index, owner approval, and bringing your own Firebase    |
| `Skill/Timeline-Bookmarks/SKILL.md` | An operating procedure any agent can load before using the tooling |

## Rules for this folder

- No handles, list ids, post ids, session tokens, cookies, profile paths or extension ids.
  Identifiers appear as `<handle>`, `<list-id>`, `<slug>`.
- Every claim carries the command that proves it, or is marked as intent.
- The local identifier map lives outside version control, at
  `Maintain/Configuration/Local/Configuration.local.json`; its tracked template is
  `Maintain/Configuration/Example/Configuration.example.json`.

## Why the leak audit subtracts names instead of narrowing paths

`scripts/audit-leaks.sh` sweeps every tracked file for the private origin names in
`Maintain/Configuration/Local/Origin.txt`. Some of the hits that sweep produces are not account
data, and they are kept on purpose:

| Kept                                                                                              | Why it is not a leak                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@playform/build`, `@playform/compress`, `@playform/inline`                                       | A published npm scope: all three packages resolve from `registry.npmjs.org`, so the dependency name is public by construction. Replacing the esbuild driver would change how `Maintain/Source` compiles for no privacy gain. |
| `open_collective: playform-cloud-collective`, `Community@PlayForm.Cloud`, `Commit@PlayForm.Cloud` | The maintainer's own funding slug, conduct contact and CI committer identity, in the maintainer's own repository. Substituting a different identity would be false attribution.                                              |

The alternative - narrowing the sweep to `Source/`, `Documentation/` and `README.md` - was rejected
because it would stop auditing `Maintain/`, `.github/` and the root config files, which is exactly
where the hits occur. Instead `Origin.public.txt` lists the entries of `Origin.txt` that are also
public namespaces, and the script greps the set difference, so a genuinely private name is still
caught anywhere in the tree. Both directions are reproducible:

```bash
# a private origin anywhere -> FAIL
printf 'contact: <private-origin> ops\n' > Documentation/Canary.md
git add Documentation/Canary.md
scripts/audit-leaks.sh .          # RESULT leaks present, exit 1

# only the public npm scope -> PASS
printf 'deps: @playform/build\n' > Documentation/Canary.md
git add Documentation/Canary.md
scripts/audit-leaks.sh .          # RESULT clean, exit 0
```

`<private-origin>` stands for a word that is in `Origin.txt` and not in `Origin.public.txt`; the
wordlist itself stays out of this repository.

# RFC-0073 - A tool that ran belongs to a skill

**Status:** Proposed **Date:** 2026-11-03 **Owner:** operator **Applies to:**
`Documentation/Skill/**/Reference/`, the archive script that writes it, and the audit that reads it
**Decision class:** methodology **Supersedes:** none **Superseded by:** none **Task dependencies:**
RFC-0009 (build, release and toolchain), RFC-0010 (documentation and template policy); implementing
card to be created: "Make the archiver validate its own path inputs and index rows"

## Decision

A script that did real work is archived into the skill that owns it, under
`Documentation/Skill/<Skill>/Reference/`, carrying a generated header that states what it does; a
home path is rewritten on the way in and a file that still carries one after that rewrite is
refused. The archive is a directory of evidence, not a scratch space, and the audit that guards it
is a read-only pass a reader can run.

1. **The archive is the skill's `Reference/` directory, and nothing else is.** The path is
   `<root>/Documentation/Skill/<Skill>/Reference/<name>` (`archive_tool.py:213-214`). A tool belongs
   to the skill whose procedure it implements - the Figma drivers sit in `Figma-MCP/Reference/`, the
   verifiers in `Design-Verification/Reference/` - because a reader looking for the procedure and a
   reader looking for the script must arrive at the same directory.
2. **An archived tool opens with a generated header, not with front matter.** The archive writes six
   logical lines above the body (`archive_tool.py:105-123`): the archived name, a blank,
   `What it does:` and the summary, one sentence stating the file is kept so a later session reuses
   it, one stating it runs from the repository root, and an `Archived:` line naming the date and the
   archiver's own repository-relative path. The comment token is chosen from the file's extension
   (`archive_tool.py:74-90`, lowercased at `:102`); an unrecognised extension falls back to `#`,
   which corrupts a `.json` or `.html` file rather than refusing it.
3. **A shebang stays first, and an executable stays executable.** The header is spliced after line
   one when the first line matches `^#!` (`archive_tool.py:92`, `:144-151`), and the executable bit
   is OR-ed on for `.sh` and `.py` (`:253-254`). An archived script is still a runnable script.
4. **The body is scrubbed on the way in, in three passes.** `archive_tool.py:126-141` replaces the
   source path, its resolved path and its parent directory with `<source>`; then the archiver's own
   home directory with a tilde; then every remaining match of `LEAK` (`:96-98`) with `<home>`. The
   `LEAK` pattern is three literal branches - a home root written as a leading slash followed by
   `Users`, the same shape under `home`, and the Windows drive form - so a foreign home path in a
   borrowed script is rewritten too, not only the archivist's own.
5. **A home path that survives the scrub is a refusal, not a warning.** `archive_tool.py:235-243`
   prints the token it found and returns exit `4`, with the remedy in the message: read the value
   from an environment variable instead. Because the summary is spliced in after the scrub and the
   whole stamped text is then scanned, a home path in `--summary` is the one realistic way to reach
   this exit - and it is the right outcome, since the summary is also written into `Index.md`.
6. **The audit is a separate, read-only pass over the whole skill tree.** `archive_tool.py:297-320`
   walks every file under `Documentation/Skill` whose suffix is a comment-capable extension, reports
   each line that still matches `LEAK` as `<path>:<line>: <text>`, prints either
   `{n} line(s) naming a home directory` or `clean: no home paths`, and exits `1` on a hit. It edits
   nothing and it is not part of any build.
7. **`--dry-run` runs the whole validation chain and writes nothing.** `archive_tool.py:245-248`
   sits after every check, so a dry run reports exit `2`, `3` or `4` exactly as a real run would. A
   dry run that skipped validation would be a rehearsal of the wrong thing.
8. **The archive never invents a skill.** A missing skill directory is exit `2` with the instruction
   to create the skill first (`archive_tool.py:191-197`). The directory tree is a statement about
   what this repository knows how to do, and a script with no skill behind it is a script with no
   procedure.
9. **An index row is written with the file, and it states what the file does.**
   `archive_tool.py:166` appends `| \`{name}\` | {summary} | see the file's header
   |`, creating `Index.md` with a fixed preamble on first use (`:173-179`). The row is the only
   place a reader sees every tool in a skill without opening any of them.

## Context

The archive holds fifteen files across four skills, and the audit is clean:

```
python3 Documentation/Skill/Tool-Archive/Reference/archive_tool.py --audit
clean: no home paths
```

`--list` is the inventory and it is generated from the directory, not maintained by hand
(`archive_tool.py:263-283`): `Design-Verification` with three files, `Figma-MCP` with six,
`Progressive-Enhancement` with three, `Tool-Archive` with four. `Index.md` itself is listed as an
ordinary file, which is correct - the index is a reference file that happens to describe the others.

The archiver is the one file in its own `Reference/` that has no index row:
`grep -c "archive_tool" Documentation/Skill/Tool-Archive/Reference/Index.md` answers `0`. That is
deliberate - it cannot archive itself - and it is the reason the index is a record of archived tools
rather than a record of the directory.

The scrubbing rule is narrower than "no absolute path". It recognises a home root, not a filesystem
root: a script naming a directory under a mounted volume passes both the scrub and the audit. What
the rule buys is the property that matters for a public repository - no contributor's account name
is recoverable from a committed tool - and the audit is the check that the property still holds.

Two shapes in the tree show that the header is a convention rather than a schema. One hand-authored
reference file carries a header in its own words, and the audit does not read markdown, so
`Index.md` is outside every check (`archive_tool.py:307` filters on the comment-capable extensions).
The index row is therefore the one place in the archive where text reaches a tracked file without
passing the scrub - which is why rule 5's refusal applies to the summary.

The failure vocabulary is four codes and each means one thing:

| Exit | Meaning                                                                    | Source                    |
| ---- | -------------------------------------------------------------------------- | ------------------------- |
| `2`  | the inputs are wrong: no skill, no readable file, an empty file, not UTF-8 | `archive_tool.py:191-230` |
| `3`  | the target exists and `--force` was not passed                             | `archive_tool.py:216-221` |
| `4`  | a home path survived the scrub                                             | `archive_tool.py:235-243` |
| `1`  | the archiver could not locate a repository, or a read failed unexpectedly  | `archive_tool.py:62-65`   |

`--summary ""` is indistinguishable from an omitted flag, because the required-set check is a
truthiness test (`archive_tool.py:357-361`), and `--force` over an existing file appends a second
index row for the same name (`:166`, `:182-183`). Both are recorded here rather than fixed: this
record standardises what the archive does, and a record that described behaviour the script does not
have would be the failure it exists to prevent.

## Alternatives considered

| Option                                                         | Why not chosen                                                                                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| YAML front matter per archived tool                            | the header is a comment in the tool's own language, so the file stays valid in the language it is written in, which front matter does not                           |
| Refuse any file that carries a home path, without rewriting it | a borrowed script would then have to be hand-edited before it could be archived, and the archive's value is that it records the tool as it ran                      |
| Scrub the summary as well as the body                          | a summary is prose a reader reads in `Index.md`; rewriting it to `<home>` would make the index less legible than the leak it hides                                  |
| Keep tools outside the skill tree, in one `Scripts/` directory | `Scripts/` holds the checks the build runs; a tool belongs where its procedure is, or the procedure and the script drift apart                                      |
| Run the audit as part of `pnpm run check`                      | it scans documentation rather than code, and a documentation defect should not red a build that is otherwise green (RFC-0074)                                       |
| Enforce the header shape with a linter                         | the header's value is the sentence stating what the tool does; a schema check would enforce six lines of boilerplate and nothing about whether the sentence is true |

## Consequences

- Every archived tool carries a date and the archiver's path, so an archived file is trivially
  identifiable as archived and trivially diffable against the original it was taken from.
- The scrub is a one-way transform: the archived copy no longer runs from the directory it was
  written in without the environment variable the refusal message asks for.
- Because the audit reads only comment-capable extensions, `Index.md` and every other markdown file
  in the skill tree is unchecked. The index is guarded at write time by rule 5 and never again.
- A tool archived twice under the same name produces two index rows, and nothing reconciles them.
- Path inputs are not validated: `--skill ..` and `--as ../name` both resolve outside `Reference/`,
  and an absolute `--as` replaces the base path entirely.
- The archiver is not covered by the index it maintains, so the inventory has one documented hole.

## Verification

| Claim                               | Test                                                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The archive is clean                | `python3 Documentation/Skill/Tool-Archive/Reference/archive_tool.py --audit` → `clean: no home paths`, exit 0                                            |
| The inventory is fifteen files      | `python3 Documentation/Skill/Tool-Archive/Reference/archive_tool.py --list` → four skill headings, fifteen rows                                          |
| The archiver has no index row       | `grep -c "archive_tool" Documentation/Skill/Tool-Archive/Reference/Index.md` → `0`                                                                       |
| The scrub is three passes           | `grep -n "<source>\|Path.home()\|LEAK.sub" Documentation/Skill/Tool-Archive/Reference/archive_tool.py` → `:137`, `:134`, `:141`                          |
| The leak pattern is a home root     | `grep -n "LEAK = re.compile" Documentation/Skill/Tool-Archive/Reference/archive_tool.py` → `:96`                                                         |
| A surviving home path exits 4       | `grep -n "return 4" Documentation/Skill/Tool-Archive/Reference/archive_tool.py` → `:243`                                                                 |
| An existing target exits 3          | `grep -n "return 3" Documentation/Skill/Tool-Archive/Reference/archive_tool.py` → `:221`                                                                 |
| A dry run validates                 | `grep -n "dry" Documentation/Skill/Tool-Archive/Reference/archive_tool.py` → the branch at `:245-248`, after the leak check                              |
| The audit skips markdown            | `grep -n "COMMENT = {" Documentation/Skill/Tool-Archive/Reference/archive_tool.py` → the extension table at `:74`, none of them `.md`                    |
| The header is generated, not parsed | `grep -n "Archived tool:\|What it does:" Documentation/Skill/Tool-Archive/Reference/archive_tool.py` → the template at `:110-115`, with no reader for it |
| A shebang stays first               | `grep -n "SHEBANG" Documentation/Skill/Tool-Archive/Reference/archive_tool.py` → the pattern at `:92` and the splice at `:148`                           |

## Open questions

- Whether `--summary` should be validated as one sentence. The flag help says one sentence
  (`archive_tool.py:331`) and nothing checks it, so the index's prose quality is unenforced.
- Whether `--force` should replace the index row rather than append. Today a re-archive leaves two
  rows for one file, and one of them describes an older version.
- Whether path inputs should be confined to `Reference/`. `--skill ..` and an absolute `--as` both
  escape it, and the escape is silent until the write fails.
- Whether the audit should read markdown, so `Index.md` is covered. The extension filter is the
  whole reason it is not.
- UNKNOWN whether a non-UTF-8 file and a dirty tree should share exit `1` in the audit. They do, and
  a crash is therefore indistinguishable from a finding by exit status alone.

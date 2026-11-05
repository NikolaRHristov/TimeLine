# Parallel-Epic-Execution reference

This skill archives no tools. Its checks are the package scripts and one-line commands in
`../SKILL.md`, and a wrapper around them would duplicate the scripts it calls - the boundary pass is
the sequence there, not a program. The rule that a script belongs to a skill when the next session
would write it again (`Documentation/Skill/Tool-Archive/SKILL.md`) is why this directory is empty of
one: nobody rewrites `tsc --noEmit`.

| File       | What it does                                                                    | Notes             |
| ---------- | ------------------------------------------------------------------------------- | ----------------- |
| `Index.md` | This inventory. The procedure and its claim → test table live in `../SKILL.md`. | no archived tools |

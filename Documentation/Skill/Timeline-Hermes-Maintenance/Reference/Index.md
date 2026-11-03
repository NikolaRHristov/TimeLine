# Timeline-Hermes-Maintenance reference

This skill archives no tools. Its diagnostics are `ps`, `sqlite3`, `grep` and `hermes kanban` over
the agent's own profile directory, and the paths they read are `$HERMES_HOME`-relative on purpose -
a script that baked one machine's layout in would be exactly the leak this repository's audit exists
to catch. The claim → test table in `../SKILL.md` is the runnable form.

| File       | What it does                                                                    | Notes             |
| ---------- | ------------------------------------------------------------------------------- | ----------------- |
| `Index.md` | This inventory. The procedure and its claim → test table live in `../SKILL.md`. | no archived tools |

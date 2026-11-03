# SpacetimeDB-Local reference

This skill archives no tools. Everything it runs is the `spacetime` CLI itself, and a wrapper around
`spacetime sql` or `spacetime call` would hide the flags that are the whole diagnosis - the argument
index in a `400 invalid arguments for reducer` line, the snake_case column name in an unknown-column
error. The module's own source is the other reference, and it lives where it is edited:
`Maintain/Spacetime/spacetimedb/src/`.

| File       | What it does                                                                    | Notes             |
| ---------- | ------------------------------------------------------------------------------- | ----------------- |
| `Index.md` | This inventory. The procedure and its claim → test table live in `../SKILL.md`. | no archived tools |

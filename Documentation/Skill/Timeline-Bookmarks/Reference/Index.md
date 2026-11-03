# Timeline-Bookmarks reference

This skill archives no tools. The pipeline it drives is the `maintain` CLI in this repository
(`Maintain/Source/`, compiled to `Maintain/Target/`), so a copied script would be a second
implementation of the command surface the skill documents. The commands in `../SKILL.md` are the
interface; `pnpm maintain --help` and `pnpm maintain <command> --schema` render from the same table
the parser matches against, so help cannot drift from what runs.

| File       | What it does                                                                    | Notes             |
| ---------- | ------------------------------------------------------------------------------- | ----------------- |
| `Index.md` | This inventory. The procedure and its claim → test table live in `../SKILL.md`. | no archived tools |

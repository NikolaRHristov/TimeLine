# RFC-Board reference

Every file here was written during real work and archived rather than re-derived. Each one opens
with a header stating what it does; nothing here names a machine, an account or an absolute path.

The two files without an archived header are data and prose, not tools: the archiver stamps a
comment header chosen by file extension and falls back to `#`, which would corrupt a `.json` file
and add noise to a `.md` one. They are placed by hand and listed here so the directory has one
inventory.

| File                | What it does                                                                                                                                                                                                                    | Notes                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `rfc_board.py`      | Assemble the RFC project board from the committed record files: render one body per record, create and refresh the issues, add them to the project, write the five field values, sync the project README and verify the result. | see the file's header; `pnpm run RFC:Board` |
| `area.json`         | The record-to-`Area` map the tool reads, one value per record, with the tie-break rule stated in `Documentation/RFC/README.md`.                                                                                                 | data, placed by hand                        |
| `project-README.md` | The project's own README, ASCII, with `@@DASH@@` and `@@COUNT@@` resolved at upload by the tool's `readme` command.                                                                                                             | prose, placed by hand                       |

# RFC-Board reference

Every file here was written during real work and archived rather than re-derived. Each one opens
with a header stating what it does; nothing here names a machine, an account or an absolute path.

The one file without an archived header is prose, not a tool: the archiver stamps a comment header
chosen by file extension, which would add noise to a `.md` file. It is placed by hand and listed
here so the directory has one inventory.

| File                | What it does                                                                                                                                                                                                                       | Notes                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `rfc_board.py`      | Assemble the RFC project board from the committed record files: render one body per record, create and refresh the issues, add them to the project, write each item's field values, sync the project README and verify the result. | see the file's header; `pnpm run RFC:Board` |
| `project-README.md` | The project's own README, ASCII, with `@@DASH@@` and `@@COUNT@@` resolved at upload by the tool's `readme` command.                                                                                                                | prose, placed by hand                       |

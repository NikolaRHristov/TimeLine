# RFC-Board reference

Every file here was written during real work and archived rather than re-derived. Each one opens
with a header stating what it does; nothing here names a machine, an account or an absolute path.

The one file without an archived header is prose, not a tool: the archiver stamps a comment header
chosen by file extension, which would add noise to a `.md` file. It is placed by hand and listed
here so the directory has one inventory.

| File                         | What it does                                                                                                                                                                                                                                                                                                         | Notes                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `rfc_board.py`               | Compare the RFC project board with the committed record files: render one body per record, report what the board would create, update or already agree with, verify the result, and write the board only through an explicit `sync` that refuses a populated project without a reason.                               | see the file's header; `pnpm run RFC:Board:Verify`  |
| `test_committed_snapshot.py` | Prove that the corpus is one commit's snapshot rather than the index and the working tree: a record staged and never committed is excluded, and a record edited after its commit renders its committed bytes. Builds a throwaway repository and also covers the missing-commit, empty-corpus and non-UTF-8 messages. | `pnpm run Check:RFC-Board`, inside `pnpm run check` |
| `test_read_only.py`          | Prove that the tool reads by default and writes only through `sync`: a mutating `gh` verb or a GraphQL mutation is refused before any process starts, the plan exits 0 on a board that agrees and 1 on one that does not, and `sync` refuses a populated board without a reason. No network, no board, no `gh`.      | `pnpm run Check:RFC-Board`, inside `pnpm run check` |
| `project-README.md`          | The project's own README, ASCII, with `@@DASH@@` and `@@COUNT@@` resolved at upload by the tool's `readme` command.                                                                                                                                                                                                  | prose, placed by hand                               |

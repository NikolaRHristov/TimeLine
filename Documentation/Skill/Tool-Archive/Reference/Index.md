# Tool-Archive reference

Every file here was written during real work and archived rather than re-derived. Each one opens
with a header stating what it does; nothing here names a machine, an account or an absolute path.

| File                | What it does                                                                                                                                                                                                              | Notes                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `archive_tool.py`   | Archive one script into a skill's `Reference/`, stamp its header, scrub a home path and append the index row; `--audit` is the leak gate, `--list` the inventory.                                                         | see the file's header    |
| `TokenContract.mjs` | Fail the build on a stray colour literal, an orphan token, an undefined token, a second stage map or a redefined Material mixin.                                                                                          | see the file's header    |
| `session-audit.mjs` | Load the built workspace in a browser and prove the session layer: an empty slot mounts, the server view survives hydration, one warning names the absent session, and a context switch leaves the drawer byte-identical. | `pnpm run Audit:Session` |

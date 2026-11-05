# Tool-Archive reference

Every file here was written during real work and archived rather than re-derived. Each one opens
with a header stating what it does; nothing here names a machine, an account or an absolute path.

This directory does not archive the session audit any more: it was removed with the automated layer,
and the check it made - an empty slot mounts, the server view survives hydration, one warning names
the absent session, a context switch leaves the drawer byte-identical - is manual now, stated under
`Verifying` in `Documentation/Reference/Session.md`.

| File              | What it does                                                                                                                                                      | Notes                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `archive_tool.py` | Archive one script into a skill's `Reference/`, stamp its header, scrub a home path and append the index row; `--audit` is the leak gate, `--list` the inventory. | see the file's header |

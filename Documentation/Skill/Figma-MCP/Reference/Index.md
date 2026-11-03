# Figma-MCP reference

Every file here was written during real work and archived rather than re-derived. Each one opens
with a header stating what it does; nothing here names a machine, an account or an absolute path.

| File                 | What it does                                                                                                             | Notes                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `mcp_call.py`        | Call a remote MCP tool directly and write the result to a file; endpoint and token come from MCP_URL and MCP_TOKEN_FILE. | see the file's header |
| `cdp-figma-click.js` | Open a Figma file card in a browser with real input events and print the resulting URL.                                  | see the file's header |
| `cdp-figma-find.js`  | Scan a Figma page for design/file links whose slug or label matches a name.                                              | see the file's header |
| `cdp-figma-tree.js`  | Expand the Figma layers panel and dump node ids, names and depths.                                                       | see the file's header |
| `cdp-page.js`        | Open a URL in a background CDP tab and dump its anchors and visible text.                                                | see the file's header |

# Chat-Research reference

Five CDP drivers that carry one research question to a web chat product and bring the answer back as
text. Each opens with a header stating what it does and what it exits with; nothing here names a
machine, an account or an absolute path, and the endpoint comes from `CDP` (default
`http://127.0.0.1:9222`).

They are drivers, not a test suite, and they are the whole workflow: `cdp-open.mjs` creates the
background target and reports its handle, `cdp-send.mjs` puts the question in the composer and
verifies the send, `cdp-read.mjs` waits for the answer to stop streaming, `cdp-extract.mjs` captures
the answer as Markdown with its maths and code intact, and `cdp-click.mjs` reaches a control that no
label match can find. Exit `2` with one `blocker:` line means the run
could not proceed; exit `1` means it ran and the send did not take. No script installs a dependency:
the global `WebSocket` and `fetch` of Node 22 are the transport.

| File            | What it does                                                                                            | Notes                                |
| --------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `cdp-open.mjs`  | Create a background target, navigate it, and print the `ws` handle, the title and the head of the text. | nothing is activated or focused      |
| `cdp-send.mjs`  | Click the visible composer, replace its text, click Submit, then check the composer emptied.            | `sent: true` is the only success     |
| `cdp-click.mjs` | Click one control by accessible label, or by `css:` selector when it carries no label.                  | a zero rect is reported, not clicked |
| `cdp-read.mjs`    | Poll `document.body.innerText` until it stops changing, then print the text or its tail.                | `--stable` is the completion rule      |
| `cdp-extract.mjs` | Serialise the rendered answer to Markdown, reading TeX from KaTeX's annotation and code from `pre`.     | `--out` writes the artefact            |

`cdp-read.mjs` is for knowing when an answer has stopped arriving. `cdp-extract.mjs` is for keeping
it: `innerText` returns a rendered formula as hundreds of positioned glyphs, one per line, so an
equation survives only if the extractor reads the original TeX out of
`annotation[encoding="application/x-tex"]`. The same reader is why code blocks vanish from an
`innerText` capture and appear under `pre > code`.

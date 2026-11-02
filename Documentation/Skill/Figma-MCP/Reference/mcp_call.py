#!/usr/bin/env python3
# Archived tool: mcp_call.py
#
# What it does: Call a remote MCP tool directly and write the result to a file; endpoint and token come from MCP_URL and MCP_TOKEN_FILE.
# Kept here so a later session reuses it instead of rewriting it.
# Run it from the repository root; it reads the paths it names and nothing else.
# Archived: 2026-11-02 by Documentation/Skill/Tool-Archive/Reference/archive_tool.py
"""Call a tool on a remote MCP server directly, saving the raw result to a file.

Usage: mcp_call.py <tool> '<json-args>' <out-file>

Why this exists: a chat client replaces a large tool result with a short marker,
so a 24 KB design-metadata reply never reaches the model. Calling the endpoint
here writes the payload to disk instead, where it can be read, grepped and
diffed.

The endpoint and the OAuth token are both configuration, never constants:

    MCP_URL          the server's streamable-HTTP endpoint
    MCP_TOKEN_FILE   a JSON file holding {"access_token": "..."}

Nothing about a particular client, machine or account is baked in. A missing
variable is reported, not guessed - a silent fallback would send a request with
no token and read the resulting 401 as a server fault.

Implements the streamable-HTTP handshake: `initialize`, then
`notifications/initialized`, then `tools/call`, matching JSON-RPC ids and
accepting either a JSON body or an SSE stream.
"""
import json
import os
import sys
import urllib.error
import urllib.request


def config():
    endpoint = os.environ.get("MCP_URL")
    token_file = os.environ.get("MCP_TOKEN_FILE")

    missing = [name for name, value in (("MCP_URL", endpoint), ("MCP_TOKEN_FILE", token_file)) if not value]

    if missing:
        raise SystemExit(
            "error: %s unset.\n"
            "  MCP_URL        the MCP server endpoint, e.g. https://mcp.example.com/mcp\n"
            "  MCP_TOKEN_FILE a JSON file holding {\"access_token\": \"...\"}, as written by\n"
            "                 whichever client performed the OAuth flow." % ", ".join(missing)
        )

    # Narrowed for the type checker: the guard above proves both are set, and a
    # reader of the two lines below should not have to re-derive that.
    endpoint = str(endpoint)
    token_file = str(token_file)

    try:
        with open(os.path.expanduser(token_file)) as handle:
            data = json.load(handle)
    except OSError as error:
        raise SystemExit("error: cannot read MCP_TOKEN_FILE: %s" % error)

    token = data.get("access_token")

    if not token:
        raise SystemExit("error: MCP_TOKEN_FILE holds no access_token")

    return endpoint, token


class Client:
    def __init__(self):
        self.endpoint, self.token = config()
        self.session = None
        self._id = 0

    def _post(self, payload):
        self._id += 1
        payload["id"] = self._id
        body = json.dumps(payload).encode()
        request = urllib.request.Request(self.endpoint, data=body, method="POST")
        request.add_header("Authorization", "Bearer " + self.token)
        request.add_header("Content-Type", "application/json")
        request.add_header("Accept", "application/json, text/event-stream")

        if self.session:
            request.add_header("Mcp-Session-Id", self.session)

        with urllib.request.urlopen(request, timeout=180) as response:
            self.session = response.headers.get("Mcp-Session-Id") or self.session
            content_type = response.headers.get("Content-Type", "")
            raw = response.read().decode("utf-8", "replace")

        if "text/event-stream" in content_type:
            messages = []

            for block in raw.split("\n\n"):
                data = [line[5:] for line in block.splitlines() if line.startswith("data:")]

                if not data:
                    continue

                try:
                    messages.append(json.loads("\n".join(data)))
                except json.JSONDecodeError:
                    pass

            for message in messages:
                if message.get("id") == payload["id"]:
                    return message

            return messages[-1] if messages else {}

        return json.loads(raw)

    def notify(self, method, params=None):
        body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params or {}}).encode()
        request = urllib.request.Request(self.endpoint, data=body, method="POST")
        request.add_header("Authorization", "Bearer " + self.token)
        request.add_header("Content-Type", "application/json")
        request.add_header("Accept", "application/json, text/event-stream")

        if self.session:
            request.add_header("Mcp-Session-Id", self.session)

        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                response.read()
        except (urllib.error.URLError, OSError) as error:
            # A notification may answer 202/204 or nothing at all; the call that
            # follows is what decides whether the session is usable.
            print("notify warn:", error, file=sys.stderr)

    def init(self):
        response = self._post(
            {
                "jsonrpc": "2.0",
                "method": "initialize",
                "params": {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {},
                    "clientInfo": {"name": "mcp-direct", "version": "1.0"},
                },
            }
        )
        self.notify("notifications/initialized")

        return response

    def call(self, tool, args):
        return self._post(
            {"jsonrpc": "2.0", "method": "tools/call", "params": {"name": tool, "arguments": args}}
        )


def flatten(result):
    """A tool result carries `content: [{type, text|data}]`; join the text parts."""
    if not isinstance(result, dict):
        return json.dumps(result)

    payload = result.get("result", result)
    parts = []

    for chunk in payload.get("content", []) if isinstance(payload, dict) else []:
        if chunk.get("type") == "text":
            parts.append(chunk.get("text", ""))
        elif chunk.get("type") == "image":
            parts.append("[image %s %s bytes]" % (chunk.get("mimeType"), len(chunk.get("data", "") or "")))
        else:
            parts.append(json.dumps(chunk)[:500])

    if not parts and isinstance(payload, dict):
        parts.append(json.dumps(payload))

    return "\n".join(parts)


def main():
    if len(sys.argv) < 4:
        raise SystemExit(__doc__)

    tool, args_raw, out = sys.argv[1], sys.argv[2], sys.argv[3]
    args = json.loads(args_raw) if args_raw.strip() else {}

    client = Client()
    client.init()
    response = client.call(tool, args)
    text = flatten(response)

    with open(out, "w") as handle:
        handle.write(text)

    error = response.get("error") if isinstance(response, dict) else None
    is_error = (response.get("result") or {}).get("isError") if isinstance(response, dict) else None

    print(json.dumps({"tool": tool, "out": out, "bytes": len(text), "isError": is_error, "error": error}))
    print(text[:600])


if __name__ == "__main__":
    main()

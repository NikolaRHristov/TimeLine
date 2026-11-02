// Archived tool: cdp-figma-find.js
//
// What it does: Scan a Figma page for design/file links whose slug or label matches a name.
// Kept here so a later session reuses it instead of rewriting it.
// Run it from the repository root; it reads the paths it names and nothing else.
// Archived: 2026-11-02 by Documentation/Skill/Tool-Archive/Reference/archive_tool.py
// Find a Figma file by name in the person's live browser session (CDP, no deps).
// Usage: node cdp-figma-find.js <url> [<nameRegex>]
// Opens its own background tab, reads links, closes the tab.

const URL_ = process.argv[2];
const NAME = process.argv[3] || "Main View";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jsonList() {
	return (await fetch("http://127.0.0.1:9222/json/list")).json();
}

async function main() {
	const before = new Set((await jsonList()).map((t) => t.id));

	// browser-level socket
	const ver = await (await fetch("http://127.0.0.1:9222/json/version")).json();
	const bws = new WebSocket(ver.webSocketDebuggerUrl);
	let bid = 0;
	const bpend = new Map();
	await new Promise((res, rej) => {
		bws.onopen = res;
		bws.onerror = rej;
	});
	bws.onmessage = (e) => {
		const m = JSON.parse(e.data);
		if (m.id && bpend.has(m.id)) {
			bpend.get(m.id)(m);
			bpend.delete(m.id);
		}
	};
	const bsend = (method, params = {}) =>
		new Promise((res) => {
			const id = ++bid;
			bpend.set(id, res);
			bws.send(JSON.stringify({ id, method, params }));
		});

	await bsend("Target.createTarget", { url: "about:blank", background: true });
	await sleep(700);
	const after = await jsonList();
	const created = after.find((t) => !before.has(t.id) && t.type === "page");
	if (!created) throw new Error("no new target appeared");

	const ws = new WebSocket(created.webSocketDebuggerUrl);
	let id = 0;
	const pend = new Map();
	await new Promise((res, rej) => {
		ws.onopen = res;
		ws.onerror = rej;
	});
	ws.onmessage = (e) => {
		const m = JSON.parse(e.data);
		if (m.id && pend.has(m.id)) {
			pend.get(m.id)(m);
			pend.delete(m.id);
		}
	};
	const send = (method, params = {}) =>
		new Promise((res) => {
			const i = ++id;
			pend.set(i, res);
			ws.send(JSON.stringify({ id: i, method, params }));
		});

	await send("Page.enable");
	await send("Runtime.enable");
	await send("Emulation.setFocusEmulationEnabled", { enabled: true });
	await send("Page.navigate", { url: URL_ });
	await sleep(6000);

	// scroll a bit so lazily rendered file grids fill in
	for (let i = 0; i < 4; i++) {
		await send("Runtime.evaluate", {
			expression: "window.scrollBy(0, 1200); 1",
			awaitPromise: true,
		});
		await sleep(800);
	}

	const expr = `(() => {
    const out = [];
    document.querySelectorAll('a[href*="/design/"], a[href*="/file/"]').forEach(a => {
      const href = a.getAttribute('href') || '';
      const m = href.match(/\\/(design|file)\\/([A-Za-z0-9]+)\\/([^?#]*)/);
      if (!m) return;
      out.push({ kind: m[1], key: m[2], slug: decodeURIComponent(m[3] || ''), text: (a.innerText||'').trim().slice(0,80) });
    });
    // also generic text nodes that look like file cards
    return JSON.stringify({ title: document.title, url: location.href, count: out.length, files: out });
  })()`;

	const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
	const val = r.result && r.result.result && r.result.result.value;
	let parsed;
	try {
		parsed = JSON.parse(val);
	} catch (e) {
		parsed = { raw: val, title: "(unparsed)" };
	}

	const hits = (parsed.files || []).filter(
		(f) =>
			f.slug.toLowerCase().includes(NAME.toLowerCase()) ||
			f.text.toLowerCase().includes(NAME.toLowerCase()),
	);

	console.log(
		JSON.stringify(
			{
				pageTitle: parsed.title,
				pageUrl: parsed.url,
				total: parsed.count,
				matches: hits,
				all: (parsed.files || []).slice(0, 40),
			},
			null,
			2,
		),
	);

	// close the tab we opened
	await bsend("Target.closeTarget", { targetId: created.id });
	ws.close();
	bws.close();
}

main().catch((e) => {
	console.error("FAIL:", e.message);
	process.exit(1);
});

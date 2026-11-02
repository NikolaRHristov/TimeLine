// Archived tool: cdp-figma-tree.js
//
// What it does: Expand the Figma layers panel and dump node ids, names and depths.
// Kept here so a later session reuses it instead of rewriting it.
// Run it from the repository root; it reads the paths it names and nothing else.
// Archived: 2026-11-02 by Documentation/Skill/Tool-Archive/Reference/archive_tool.py
// Dump the full Figma layers tree (node ids + names + depth) by expanding every caret.
// Usage: node cdp-figma-tree.js "<designUrl>" [outJson]
const URL_ = process.argv[2];
const OUT = process.argv[3] || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jsonList = async () => (await fetch("http://127.0.0.1:9222/json/list")).json();
const fs = require("fs");

async function main() {
	const before = new Set((await jsonList()).map((t) => t.id));
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
	const created = (await jsonList()).find((t) => !before.has(t.id) && t.type === "page");
	if (!created) throw new Error("no new target");
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
	await sleep(14000);

	// Expand every collapsed caret, repeatedly, until the row count stops growing.
	const expandOnce = `(() => {
    let n = 0;
    document.querySelectorAll('[data-testid="layers-panel-expand-caret"]').forEach(b => {
      const collapsed = b.getAttribute('aria-expanded') !== 'true' && b.getAttribute('data-expanded') !== 'true';
      if (collapsed) { b.click(); n++; }
    });
    return JSON.stringify({clicked: n, rows: document.querySelectorAll('[data-testid$="-layers-panel-row"]').length});
  })()`;
	let prev = -1;
	for (let i = 0; i < 12; i++) {
		const r = await send("Runtime.evaluate", { expression: expandOnce, returnByValue: true });
		const v = JSON.parse(r.result?.result?.value || "{}");
		console.log("expand pass", i, JSON.stringify(v));
		if (v.rows === prev && v.clicked === 0) break;
		prev = v.rows;
		await sleep(1200);
	}

	const dump = `(() => {
    const rows = [...document.querySelectorAll('[data-testid$="-layers-panel-row"]')];
    const out = rows.map(r => {
      const testid = r.getAttribute('data-testid') || '';
      const id = (testid.match(/^([0-9]+:[0-9]+)-layers-panel-row$/) || [])[1] || '';
      const name = (r.innerText || '').trim().split('\\n')[0];
      const left = r.getBoundingClientRect().left;
      const role = r.closest('[role="treeitem"]');
      const level = role ? role.getAttribute('aria-level') : null;
      return { id, name, left: Math.round(left), level };
    });
    const lefts = [...new Set(out.map(o => o.left))].sort((a,b)=>a-b);
    out.forEach(o => { o.depth = lefts.indexOf(o.left); });
    return JSON.stringify(out);
  })()`;
	const d = await send("Runtime.evaluate", { expression: dump, returnByValue: true });
	const tree = d.result?.result?.value || "[]";
	if (OUT) fs.writeFileSync(OUT, tree);
	console.log("ROWS:", JSON.parse(tree).length);
	console.log(tree.slice(0, 200000));

	await bsend("Target.closeTarget", { targetId: created.id });
	ws.close();
	bws.close();
}
main().catch((e) => {
	console.error("FAIL:", e.message);
	process.exit(1);
});

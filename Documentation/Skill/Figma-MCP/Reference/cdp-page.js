// Archived tool: cdp-page.js
//
// What it does: Open a URL in a background CDP tab and dump its anchors and visible text.
// Kept here so a later session reuses it instead of rewriting it.
// Run it from the repository root; it reads the paths it names and nothing else.
// Archived: 2026-11-02 by Documentation/Skill/Tool-Archive/Reference/archive_tool.py
// Generic CDP page probe: open a background tab, navigate, dump anchors + text.
// Usage: node cdp-page.js <url> [waitMs]
const URL_ = process.argv[2];
const WAIT = parseInt(process.argv[3] || "8000", 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jsonList = async () => (await fetch("http://127.0.0.1:9222/json/list")).json();

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
	await sleep(WAIT);
	for (let i = 0; i < 3; i++) {
		await send("Runtime.evaluate", { expression: "window.scrollBy(0,1500);1" });
		await sleep(600);
	}

	const expr = `JSON.stringify({
    title: document.title,
    url: location.href,
    anchors: [...new Set([...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href')))].slice(0,200),
    text: (document.body.innerText||'').slice(0,4000)
  })`;
	const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
	console.log(r.result?.result?.value || JSON.stringify(r));
	await bsend("Target.closeTarget", { targetId: created.id });
	ws.close();
	bws.close();
}
main().catch((e) => {
	console.error("FAIL:", e.message);
	process.exit(1);
});

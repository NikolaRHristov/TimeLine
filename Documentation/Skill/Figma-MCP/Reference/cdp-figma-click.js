// Archived tool: cdp-figma-click.js
//
// What it does: Open a Figma file card in a browser with real input events and print the resulting URL.
// Kept here so a later session reuses it instead of rewriting it.
// Run it from the repository root; it reads the paths it names and nothing else.
// Archived: 2026-11-02 by Documentation/Skill/Tool-Archive/Reference/archive_tool.py
// Open a file card in the DELO folder using REAL mouse events (React needs them).
// Usage: node cdp-figma-click.js "<folderUrl>" "Main View"
const FOLDER = process.argv[2];
const NAME = process.argv[3] || "Main View";
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
	await send("Page.navigate", { url: FOLDER });
	await sleep(9000);

	const rectExpr = `(() => {
    const NAME = ${JSON.stringify(NAME)};
    const exact = [...document.querySelectorAll('h2,span,div')].filter(el => (el.textContent||'').trim() === NAME && el.children.length === 0);
    if (!exact.length) return JSON.stringify({ok:false});
    let el = exact[0];
    let card = el;
    for (let i=0;i<12 && card;i++){ const r=card.getBoundingClientRect(); if (r.width>=180 && r.height>=120) break; card = card.parentElement; }
    const r = (card||el).getBoundingClientRect();
    return JSON.stringify({ok:true, x: Math.round(r.x + r.width/2), y: Math.round(r.y + Math.min(60, r.height/2)), w: Math.round(r.width), h: Math.round(r.height)});
  })()`;
	const rr = await send("Runtime.evaluate", { expression: rectExpr, returnByValue: true });
	const box = JSON.parse(rr.result?.result?.value || "{}");
	console.log("card:", JSON.stringify(box));
	if (!box.ok) {
		console.log("no card");
		await bsend("Target.closeTarget", { targetId: created.id });
		return;
	}

	const base = { x: box.x, y: box.y, button: "left", clickCount: 1 };
	await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y });
	await send("Input.dispatchMouseEvent", { type: "mousePressed", ...base });
	await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...base });
	await sleep(1500);
	await send("Input.dispatchMouseEvent", { type: "mousePressed", ...base, clickCount: 2 });
	await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...base, clickCount: 2 });
	await sleep(10000);

	const u = await send("Runtime.evaluate", {
		expression: "JSON.stringify({url: location.href, title: document.title})",
		returnByValue: true,
	});
	console.log("after:", u.result?.result?.value);
	await bsend("Target.closeTarget", { targetId: created.id });
	ws.close();
	bws.close();
}
main().catch((e) => {
	console.error("FAIL:", e.message);
	process.exit(1);
});

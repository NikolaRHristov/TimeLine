// Archived tool: probe-built-page.js
//
// What it does: Serve-and-probe a built Astro page over CDP: island, structure, computed styles, console errors, screenshot.
// Kept here so a later session reuses it instead of rewriting it.
// Run it from the repository root; it reads the paths it names and nothing else.
// Archived: 2026-11-03 by Documentation/Skill/Tool-Archive/Reference/archive_tool.py
// Probe a BUILT Astro page over CDP: did the island hydrate, is the structure there,
// do the computed styles carry the tokens, did anything log an error, and what does
// it look like?
//
// Usage:
//   node probe-built-page.js <url> [screenshot.png] [selector,selector,...] [--click <selector>]
//
// Requires a Chromium already listening on 127.0.0.1:9222 (see
// Documentation/Skill/Timeline-Browser-Transport/SKILL.md).
// Opens its own background tab and closes it again, so the person's own tabs are
// untouched. Node 22 ships fetch and a global WebSocket, which is the whole client.
const URL_ = process.argv[2];
const SHOT =
	process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "/tmp/probe.png";
const SELECTORS = (
	process.argv[4] && !process.argv[4].startsWith("--") ? process.argv[4] : "astro-island"
)
	.split(",")
	.map((s) => s.trim())
	.filter(Boolean);
const CLICK = process.argv.includes("--click")
	? process.argv[process.argv.indexOf("--click") + 1]
	: null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fs = require("fs");
const jsonList = async () => (await fetch("http://127.0.0.1:9222/json/list")).json();

async function main() {
	if (!URL_)
		throw new Error(
			"usage: probe-built-page.js <url> [shot.png] [selectors] [--click <selector>]",
		);

	const before = new Set((await jsonList()).map((t) => t.id));
	const version = await (await fetch("http://127.0.0.1:9222/json/version")).json();
	const browser = new WebSocket(version.webSocketDebuggerUrl);
	let bid = 0;
	const bpend = new Map();
	await new Promise((res, rej) => {
		browser.onopen = res;
		browser.onerror = rej;
	});
	browser.onmessage = (e) => {
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
			browser.send(JSON.stringify({ id, method, params }));
		});

	await bsend("Target.createTarget", { url: "about:blank", background: true });
	await sleep(700);
	const created = (await jsonList()).find((t) => !before.has(t.id) && t.type === "page");
	if (!created) throw new Error("no new target appeared; is 127.0.0.1:9222 serving?");

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

	const errors = [];
	await send("Page.enable");
	await send("Runtime.enable");
	ws.addEventListener("message", (e) => {
		const m = JSON.parse(e.data);
		if (m.method === "Runtime.exceptionThrown")
			errors.push(m.params?.exceptionDetails?.text ?? "exception");
		if (m.method === "Runtime.consoleAPICalled" && m.params?.type === "error") {
			errors.push((m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" "));
		}
	});

	await send("Emulation.setDeviceMetricsOverride", {
		width: 1440,
		height: 1300,
		deviceScaleFactor: 1,
		mobile: false,
	});
	await send("Emulation.setFocusEmulationEnabled", { enabled: true });
	await send("Page.navigate", { url: URL_ });
	await sleep(6000);

	const probe = `(() => {
		const S = ${JSON.stringify(SELECTORS)};
		const out = { title: document.title, hydrated: !!document.querySelector('astro-island'), counts: {}, styles: {} };
		for (const sel of S) {
			const nodes = [...document.querySelectorAll(sel)];
			out.counts[sel] = nodes.length;
			const first = nodes[0];
			if (!first) { out.styles[sel] = null; continue; }
			const cs = getComputedStyle(first);
			const box = first.getBoundingClientRect();
			out.styles[sel] = {
				background: cs.backgroundColor,
				radius: cs.borderRadius,
				width: Math.round(box.width),
				height: Math.round(box.height),
				grid: cs.gridTemplateColumns === "none" ? null : cs.gridTemplateColumns,
			};
		}
		return JSON.stringify(out);
	})()`;
	const r1 = await send("Runtime.evaluate", { expression: probe, returnByValue: true });
	console.log("PROBE:", r1.result?.result?.value);

	if (CLICK) {
		const click = `(() => {
			const el = document.querySelector(${JSON.stringify(CLICK)});
			if (!el) return JSON.stringify({ ok: false, reason: 'selector not found' });
			const before = document.body.innerHTML.length;
			el.click();
			return JSON.stringify({ ok: true, before });
		})()`;
		const r2 = await send("Runtime.evaluate", { expression: click, returnByValue: true });
		await sleep(600);
		const r3 = await send("Runtime.evaluate", {
			expression: `document.body.innerHTML.length`,
			returnByValue: true,
		});
		console.log(
			"CLICK:",
			r2.result?.result?.value,
			"-> body bytes now",
			r3.result?.result?.value,
		);
	}

	const shot = await send("Page.captureScreenshot", {
		format: "png",
		captureBeyondViewport: true,
	});
	if (shot.result?.data) {
		fs.writeFileSync(SHOT, Buffer.from(shot.result.data, "base64"));
		console.log("SHOT:", SHOT, fs.statSync(SHOT).size, "bytes");
	} else {
		console.log("SHOT: failed");
	}

	console.log("ERRORS:", JSON.stringify(errors));

	await bsend("Target.closeTarget", { targetId: created.id });
	ws.close();
	browser.close();
}

main().catch((e) => {
	console.error("FAIL:", e.message);
	process.exit(1);
});

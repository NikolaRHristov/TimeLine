#!/usr/bin/env node
/**
 * Verify the showcase spread: six dispersed boxes, three closing pillars.
 *
 * Ad-hoc verification, not a suite. The spread is a layout whose whole argument is
 * that the boxes are *not* aligned, so the thing to assert is the dispersion
 * itself: consecutive boxes must sit at different horizontal offsets, the vertical
 * gap must exceed the canvas's 20px rhythm, and the page must end on a three-column
 * pillar band.
 *
 *   node verify-spread.mjs                 # serve ./Target and probe /Showcase/
 *   node verify-spread.mjs --url <url>     # probe a server already running
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CDP = process.env["CDP_URL"] ?? "http://127.0.0.1:9222";
const PORT = Number(process.env["PORT"] ?? 4412);
const sleep = (Ms) => new Promise((Done) => setTimeout(Done, Ms));

const Root = (() => {
	let Here = dirname(fileURLToPath(import.meta.url));
	for (let Up = 0; Up < 8; Up++) {
		if (existsSync(resolve(Here, "Target"))) return Here;
		Here = dirname(Here);
	}
	return null;
})();

const Probe = `(() => {
	const Boxes = [...document.querySelectorAll(".spread__box")];
	const Rect = (El) => { const R = El.getBoundingClientRect(); return { x: Math.round(R.x), y: Math.round(R.y), w: Math.round(R.width), h: Math.round(R.height) }; };
	const Box = Boxes.map(Rect);
	const Gaps = Box.slice(1).map((B, I) => Math.round(B.y - (Box[I].y + Box[I].h)));

	return JSON.stringify({
		boxes: Box.length,
		offsets: Box.map((B) => B.x),
		gaps: Gaps,
		widths: Box.map((B) => B.w),
		pillars: document.querySelectorAll(".spread__pillar").length,
		pillarColumns: getComputedStyle(document.querySelector(".spread__pillars")).gridTemplateColumns.split(" ").length,
		scripts: document.querySelectorAll("astro-island").length,
	});
})()`;

async function measure(Url) {
	const Before = new Set((await (await fetch(`${CDP}/json/list`)).json()).map((T) => T.id));
	const Version = await (await fetch(`${CDP}/json/version`)).json();
	const Browser = new WebSocket(Version.webSocketDebuggerUrl);
	const Pending = new Map();
	let Id = 0;
	const Send = (Socket, Method, Params = {}) =>
		new Promise((Done) => {
			const Key = ++Id;
			Pending.set(Key, Done);
			Socket.send(JSON.stringify({ id: Key, method: Method, params: Params }));
		});

	await new Promise((Done, Fail) => {
		Browser.onopen = Done;
		Browser.onerror = Fail;
	});
	Browser.onmessage = (Event) => {
		const Message = JSON.parse(Event.data);
		Pending.get(Message.id)?.(Message);
		Pending.delete(Message.id);
	};

	await Send(Browser, "Target.createTarget", { url: "about:blank", background: true });
	await sleep(600);

	const Page = (await (await fetch(`${CDP}/json/list`)).json()).find(
		(T) => !Before.has(T.id) && T.type === "page",
	);
	if (Page === undefined) throw new Error("the browser opened no tab");

	const Tab = new WebSocket(Page.webSocketDebuggerUrl);
	const TabPending = new Map();
	const TabSend = (Method, Params = {}) =>
		new Promise((Done) => {
			const Key = ++Id;
			TabPending.set(Key, Done);
			Tab.send(JSON.stringify({ id: Key, method: Method, params: Params }));
		});

	await new Promise((Done, Fail) => {
		Tab.onopen = Done;
		Tab.onerror = Fail;
	});
	Tab.onmessage = (Event) => {
		const Message = JSON.parse(Event.data);
		TabPending.get(Message.id)?.(Message);
		TabPending.delete(Message.id);
	};

	await TabSend("Page.enable");
	await TabSend("Emulation.setDeviceMetricsOverride", {
		width: 1440,
		height: 1300,
		deviceScaleFactor: 1,
		mobile: false,
	});
	await TabSend("Page.navigate", { url: Url });
	await sleep(3000);

	const Read = await TabSend("Runtime.evaluate", { expression: Probe, returnByValue: true });
	await Send(Browser, "Target.closeTarget", { targetId: Page.id });
	Tab.close();
	Browser.close();

	return JSON.parse(Read.result.result.value);
}

const Args = process.argv.slice(2);
const Given = Args.includes("--url") ? Args[Args.indexOf("--url") + 1] : null;
let Server = null;

try {
	let Url = Given;

	if (Url === null) {
		if (Root === null) {
			console.error("blocker: no built site above this script; run `pnpm run build` first");
			process.exit(2);
		}
		Server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
			cwd: resolve(Root, "Target"),
			stdio: "ignore",
		});
		process.on("exit", () => Server.kill());
		await sleep(1200);
		Url = `http://127.0.0.1:${PORT}/Showcase/?v=${Date.now()}`;
	}

	try {
		await fetch(`${CDP}/json/version`);
	} catch {
		console.error(`blocker: no browser on ${CDP}`);
		process.exit(2);
	}

	const Box = await measure(Url);
	const Rows = [];
	const Check = (Label, Held, Detail) => {
		Rows.push([Label, Held, Detail]);
		if (!Held) process.exitCode = 1;
	};

	Check("six boxes", Box.boxes === 6, Box.boxes);
	Check("three pillars", Box.pillars === 3, Box.pillars);
	Check("pillars are three columns", Box.pillarColumns === 3, Box.pillarColumns);
	Check(
		"boxes alternate their offset",
		new Set(Box.offsets).size > 1 && Box.offsets[0] !== Box.offsets[1],
		Box.offsets.join(","),
	);
	Check(
		"the vertical gap exceeds the canvas rhythm",
		Box.gaps.every((Gap) => Gap > 20),
		Box.gaps.join(","),
	);
	Check(
		"no box is full-bleed",
		Box.widths.every((Width) => Width < 1100),
		Box.widths.join(","),
	);
	Check("the page ships no island", Box.scripts === 0, Box.scripts);

	for (const [Label, Held, Detail] of Rows) {
		console.log(`${Held ? "PASS" : "FAIL"}  ${Label.padEnd(40)} ${Detail}`);
	}

	console.log(
		`\n${process.exitCode === 1 ? "RESULT: the spread does not match its brief" : "RESULT: the spread renders as designed"}`,
	);
} catch (Error) {
	console.error(`blocker: ${Error.message}`);
	process.exit(2);
} finally {
	Server?.kill();
}

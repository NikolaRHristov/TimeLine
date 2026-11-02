#!/usr/bin/env node
/**
 * Verify the built workspace against `Documentation/Reference/Design-Composition.md`.
 *
 * This is ad-hoc verification, not a test suite: it serves the build, drives it in a
 * real browser, and asserts the measured geometry against the numbers read from the
 * Figma file. It exists because a green `astro build` proves the page compiled, not
 * that the composition is the composition - and because reading a screenshot cannot
 * tell a 360px rail from a 386px one.
 *
 * Preconditions are reported as blockers with exit 2, never as failures: a missing
 * build or a missing browser is not the page's fault.
 *
 *   node verify-composition.mjs              # serve ./Target and probe it
 *   node verify-composition.mjs --url <u>    # probe a server already running
 *   CDP_URL=http://127.0.0.1:9223 node ...   # a browser on another port
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CDP = process.env["CDP_URL"] ?? "http://127.0.0.1:9222";
const PORT = Number(process.env["PORT"] ?? 4411);
const sleep = (Ms) => new Promise((Done) => setTimeout(Done, Ms));

/** The repository root: the nearest ancestor holding a built site. */
function root() {
	let Here = dirname(fileURLToPath(import.meta.url));

	for (let Up = 0; Up < 8; Up++) {
		if (existsSync(resolve(Here, "Target"))) return Here;
		Here = dirname(Here);
	}

	return null;
}

/** What the frame must measure, in the page's own coordinates. */
const Frame = [
	["rail is 224 wide", (Box) => Box.provenance.w, 224],
	["rail is 360 tall", (Box) => Box.provenance.h, 360],
	["rail sits level with the drawer", (Box) => Box.provenance.y, (Box) => Box.drawer.y],
	["drawer starts at 240 (rail + 16 gap)", (Box) => Box.drawer.x, 240],
	["drawer is 360 tall", (Box) => Box.drawer.h, 360],
	["seam is 40 tall", (Box) => Box.publish.h, 40],
	["seam sits under the drawer", (Box) => Box.publish.y, (Box) => Box.drawer.y + Box.drawer.h],
	["canvas is 900 tall", (Box) => Box.bento.h, 900],
	["canvas sits under the seam", (Box) => Box.bento.y, (Box) => Box.publish.y + Box.publish.h],
	["the drum draws 13 bands", (Box) => Box.bandCount, 13],
	[
		"the ladder ramps away from the selection",
		(Box) => Box.bandHeights.join(","),
		"8,10,12,16,22,28,44,28,22,16,12,10,8",
	],
	["the seam is light, not panel dark", (Box) => Box.seamBackground, "rgb(236, 236, 236)"],
	[
		"the seam names a stage, never a record",
		(Box) => Box.seamNote,
		"Drop private items here to publish · Source timeline selected",
	],
];

const Probe = `(() => {
	const Box = (Selector) => {
		const Element = document.querySelector(Selector);
		if (Element === null) return null;
		const Rect = Element.getBoundingClientRect();
		return { x: Math.round(Rect.x), y: Math.round(Rect.y), w: Math.round(Rect.width), h: Math.round(Rect.height) };
	};
	const Bands = [...document.querySelectorAll(".provenance__band")];

	return JSON.stringify({
		provenance: Box(".provenance"),
		drawer: Box(".drawer"),
		publish: Box(".publish"),
		bento: Box(".bento"),
		bandCount: Bands.length,
		bandHeights: Bands.map((Band) => Math.round(Band.getBoundingClientRect().height)),
		seamBackground: getComputedStyle(document.querySelector(".publish")).backgroundColor,
		seamNote: document.querySelector(".publish__note")?.textContent?.trim(),
	});
})()`;

/** Serve the build on a private port until the process ends. */
async function serve(Directory) {
	const Server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
		cwd: Directory,
		stdio: "ignore",
	});
	process.on("exit", () => Server.kill());
	await sleep(1200);

	return Server;
}

/** One CDP round trip: open a background tab, read the frame, close it. */
async function measure(Url) {
	const Tabs = await (await fetch(`${CDP}/json/list`)).json();
	const Before = new Set(Tabs.map((Tab) => Tab.id));
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
		(Tab) => !Before.has(Tab.id) && Tab.type === "page",
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
	await sleep(4000);

	const Read = await TabSend("Runtime.evaluate", { expression: Probe, returnByValue: true });

	await Send(Browser, "Target.closeTarget", { targetId: Page.id });
	Tab.close();
	Browser.close();

	return JSON.parse(Read.result.result.value);
}

const Args = process.argv.slice(2);
const Given = Args.includes("--url") ? Args[Args.indexOf("--url") + 1] : null;
const Root = root();
let Server = null;

try {
	let Url = Given;

	if (Url === null) {
		if (Root === null) {
			console.error("blocker: no built site above this script; run `pnpm run build` first");
			process.exit(2);
		}

		Server = await serve(resolve(Root, "Target"));
		// A cache-busted URL, because Chromium keeps the previous document across a
		// rebuild: an unparameterised probe reports the page that used to exist.
		Url = `http://127.0.0.1:${PORT}/Workspace/?v=${Date.now()}`;
	}

	try {
		await fetch(`${CDP}/json/version`);
	} catch {
		console.error(
			`blocker: no browser on ${CDP}. Start one with:\n` +
				`  ~/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell \\\n` +
				`    --headless --remote-debugging-port=9222 --no-first-run --disable-gpu --user-data-dir=/tmp/cdp-verify about:blank`,
		);
		process.exit(2);
	}

	const Box = await measure(Url);
	let Failed = 0;

	for (const [Label, Read, Want] of Frame) {
		const Got = Read(Box);
		const Expected = typeof Want === "function" ? Want(Box) : Want;
		const Held = Got === Expected;

		if (!Held) Failed++;
		console.log(
			`${Held ? "PASS" : "FAIL"}  ${Label.padEnd(42)} ${Got}${Held ? "" : ` (want ${Expected})`}`,
		);
	}

	console.log(
		`\n${Failed === 0 ? "RESULT: the composition matches the spec" : `RESULT: ${Failed} invariant(s) broke`}`,
	);
	process.exit(Failed === 0 ? 0 : 1);
} catch (Error) {
	console.error(`blocker: ${Error.message}`);
	process.exit(2);
} finally {
	Server?.kill();
}

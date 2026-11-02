#!/usr/bin/env node
/**
 * Verify the built showcase pages against `Documentation/RFC/proposed/RFC-0053`.
 *
 * `verify-composition.mjs` proves the workspace is the composition. This proves
 * the other half of the same design: the five pages that are not the workspace
 * are showcases, and a showcase is a shape rather than a view - no record, no
 * count, a rail that is a table of contents, and boxes that leave the page.
 *
 * The distinction is not decorative. A page that renders a record is a data
 * surface (RFC-0050) and has to be checked as one; a page that renders nothing
 * but copy can only be wrong about its composition, which is what this asserts:
 * the rail's width and stickiness, the hero's one extra type step, the three
 * greys, the tile's 24px corner on the side that is still on the page, and the
 * page's own edge as the other side.
 *
 * Ad-hoc verification, not a test suite - the same terms as its sibling. A
 * missing build or a missing browser is a precondition (exit 2) and says which
 * command fixes it.
 *
 *   node verify-showcase.mjs              # serve ./Target and probe the five routes
 *   node verify-showcase.mjs --url <u>    # probe a server already running
 *   CDP_URL=http://127.0.0.1:9223 node ... # a browser on another port
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CDP = process.env["CDP_URL"] ?? "http://127.0.0.1:9222";
const PORT = Number(process.env["PORT"] ?? 4413);
const sleep = (Ms) => new Promise((Done) => setTimeout(Done, Ms));

/** The pages RFC-0053 turns into showcases, in the order the shell lists them. */
const Routes = ["/", "/Bookmark", "/List", "/Voted", "/Activity"];

/** The three greys a box may take, as the browser reports them. */
const Greys = ["rgb(226, 226, 226)", "rgb(233, 233, 233)", "rgb(238, 238, 238)"];

/** The repository root: the nearest ancestor holding a built site. */
function root() {
	let Here = dirname(fileURLToPath(import.meta.url));

	for (let Up = 0; Up < 8; Up++) {
		if (existsSync(resolve(Here, "Target"))) return Here;
		Here = dirname(Here);
	}

	return null;
}

/**
 * What a showcase page must measure.
 *
 * Each entry reads the probe's own JSON. A reader that returns `undefined` is a
 * failure rather than a pass, so a selector that stopped matching is caught by
 * the invariant that names it instead of silently reporting nothing.
 */
const Frame = [
	["the rail is 224 wide", (Page) => Page.rail?.w, 224],
	["the rail sits at the page's left edge", (Page) => Page.rail?.x, 0],
	["the rail stays in view while the page is read", (Page) => Page.rail?.position, "sticky"],
	["the hero takes the one extra type step", (Page) => Page.hero?.size, "48px"],
	["the page holds three boxes", (Page) => Page.boxes.length, 3],
	[
		"every box bleeds to the page's right edge",
		(Page) => Page.boxes.every((Box) => Box.x + Box.w === Page.viewport),
		true,
	],
	[
		"every box keeps the tile's 24px corner, and only where it is on the page",
		(Page) => Page.boxes.every((Box) => Box.corner === "24px 0px 0px 24px"),
		true,
	],
	[
		"the boxes take the canvas's three greys, one each",
		(Page) => Page.boxes.map((Box) => Box.fill).join(" "),
		Greys.join(" "),
	],
	[
		"the rail is a table of contents, one band per section",
		(Page) => Page.links.join(" "),
		(Page) => Page.boxes.map((Box) => `#${Box.id}`).join(" "),
	],
	[
		"every band leads to a section that exists",
		(Page) => Page.links.length > 0 && Page.resolved.every(Boolean),
		true,
	],
	["no record is drawn on the page", (Page) => Page.record.join(" "), ""],
];

const Probe = `(() => {
	const Box = (Element) => {
		if (Element === null) return null;
		const Rect = Element.getBoundingClientRect();
		return { x: Math.round(Rect.x), y: Math.round(Rect.y), w: Math.round(Rect.width), h: Math.round(Rect.height) };
	};

	const Rail = document.querySelector(".provenance");
	const Hero = document.querySelector(".board__title");
	const Boxes = [...document.querySelectorAll(".board__box")];
	const Bands = [...document.querySelectorAll(".provenance__band")];
	const Links = Bands.filter((Band) => Band.tagName === "A");

	const Corner = (Element) => {
		const Style = getComputedStyle(Element);
		return [Style.borderTopLeftRadius, Style.borderTopRightRadius, Style.borderBottomRightRadius, Style.borderBottomLeftRadius].join(" ");
	};

	const Target = (Href) => document.getElementById((Href ?? "").replace("#", "")) !== null;

	return JSON.stringify({
		// The page's own edge. innerWidth counts the scrollbar, and a box that
		// stopped at 1425 on a 1440 screen has still left the page.
		viewport: document.documentElement.clientWidth,
		rail: Rail === null ? null : { ...Box(Rail), position: getComputedStyle(Rail).position },
		hero: Hero === null ? null : { ...Box(Hero), size: getComputedStyle(Hero).fontSize },
		boxes: Boxes.map((Entry) => ({ ...Box(Entry), corner: Corner(Entry), fill: getComputedStyle(Entry).backgroundColor, id: Entry.id })),
		links: Links.map((Link) => Link.getAttribute("href")),
		resolved: Links.map((Link) => Target(Link.getAttribute("href"))),
		record: [".bento", ".drawer", ".publish"].filter((Selector) => document.querySelector(Selector) !== null),
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

/** One CDP round trip: open a background tab, read the page, close it. */
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
	await sleep(3500);

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
	let Base = Given;

	if (Base === null) {
		if (Root === null) {
			console.error("blocker: no built site above this script; run `pnpm run build` first");
			process.exit(2);
		}

		Server = await serve(resolve(Root, "Target"));
		Base = `http://127.0.0.1:${PORT}`;
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

	let Failed = 0;

	for (const Route of Routes) {
		// A cache-busted URL, because Chromium keeps the previous document across
		// a rebuild: an unparameterised probe reports the page that used to exist.
		const Url = `${Base}${Route === "/" ? "/" : `${Route}/`}?v=${Date.now()}`;
		const Page = await measure(Url);

		console.log(`\n${Route}`);

		for (const [Label, Read, Want] of Frame) {
			const Got = Read(Page);
			const Expected = typeof Want === "function" ? Want(Page) : Want;
			const Held = JSON.stringify(Got) === JSON.stringify(Expected);

			if (!Held) Failed++;
			console.log(
				`  ${Held ? "PASS" : "FAIL"}  ${Label.padEnd(56)} ${JSON.stringify(Got)}${
					Held ? "" : ` (want ${JSON.stringify(Expected)})`
				}`,
			);
		}
	}

	console.log(
		`\n${Failed === 0 ? "RESULT: every showcase page is the composition" : `RESULT: ${Failed} invariant(s) broke`}`,
	);
	process.exit(Failed === 0 ? 0 : 1);
} catch (Error) {
	console.error(`blocker: ${Error.message}`);
	process.exit(2);
} finally {
	Server?.kill();
}

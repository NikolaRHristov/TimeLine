// Archived tool: session-audit.mjs
//
// What it does: Load the built workspace in a real browser and prove the session layer's claims - an empty slot mounts, the server view survives hydration, no console error is logged, one warning names the absent session, and a context switch leaves the drawer byte-identical.
// Kept here so a later session reuses it instead of rewriting it.
// Run it from the repository root; it reads the paths it names and nothing else.
/**
 * Audit the workspace's session layer against a real render.
 *
 * RFC-0043 states things about the workspace that a unit test cannot see,
 * because each of them is a fact about a rendered page:
 *
 * 1. The island mounts with an empty session slot, and the server-rendered view
 *    is what is on screen - the drawer, the rail, the seam and the canvas are
 *    all there before a session resolves, and the state line says `static`.
 * 2. Hydration produces no console error. One warning is expected and required:
 *    the absent session states itself once, and a silent absence would be the
 *    fallback RFC-0003 refuses.
 * 3. The page renders the same drawer with scripts switched off, which is the
 *    claim `Documentation/Skill/Progressive-Enhancement` makes for every route.
 * 4. A session that resolves is a `snapshot` with one context per room, and
 *    selecting a room changes the canvas and the publish destination and leaves
 *    the drawer byte-identical.
 *
 * The build has one context - the owner's own - because a room arrives with a
 * session. So the fourth claim is measured on a fixture page: the built document
 * with the session element a signed-in page would embed
 * (`Source/Script/Session/Embed.ts` owns the id). The component, the bundle and
 * the stylesheet are the shipped ones; only the page's embedded session differs,
 * which is the same lever a page has.
 *
 * Why a browser and not a parse of the HTML: "renders" and "hydrates" are facts
 * about a document that has run its scripts, and "byte-identical" is a fact
 * about the DOM after an interaction. Only a renderer has both.
 *
 * The build is copied before it is served. A concurrent `astro build` replaces
 * `Target/_astro` while a page is loading, and an island whose bundle has just
 * been deleted hydrates into nothing while still reporting itself as hydrated -
 * which would make every check here pass or fail for the wrong reason.
 *
 * Usage
 * -----
 *     node Documentation/Skill/Tool-Archive/Reference/session-audit.mjs
 *     node session-audit.mjs --root ../Target          # another build directory
 *     node session-audit.mjs --origin http://127.0.0.1:9999   # an already-served site
 *     node session-audit.mjs --json                    # machine-readable report
 *     node session-audit.mjs --browser "/path/to/Chrome"
 *
 * The browser binary is `--browser`, then `$SESSION_AUDIT_BROWSER`, then the
 * first installed candidate, so a checkout on another machine needs no edit.
 *
 * Exit code 0 means every check passed, 1 means at least one failed or the audit
 * could not run at all. A check that cannot be measured is reported as a
 * failure, never skipped.
 */

import { spawn } from "node:child_process";
import { createReadStream, existsSync, readdirSync } from "node:fs";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve } from "node:path";

/** The route the built workspace is served at. */
const Route = "/Workspace/";

/** The fixture route: the same page, with the session element a signed-in page embeds. */
const FixtureRoute = "/_audit/Workspace/";

/** The element a page embeds its session in. `Source/Script/Session/Embed.ts` owns it. */
const SessionElement = "Workspace-Session";

/** The warning an absent session must log, once. */
const SessionWarning = /^session: /;

/** A session as a page would embed one: an identity and one room it belongs to. */
const FixtureSession = {
	Identity: { Id: "did:key:audit", Name: "Audit", PublicKey: "z6Mk-audit" },
	Memberships: [
		{
			Room: {
				Kind: "room",
				RoomId: "audit",
				Label: "Audit room",
				Destination: "Showcase · Audit room",
			},
			Role: "member",
			Grants: ["author"],
			Wrapped: true,
			OpenVote: false,
		},
	],
};

const ContentTypes = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".xml": "application/xml; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".webmanifest": "application/manifest+json",
	".ico": "image/x-icon",
	".png": "image/png",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseArguments(argv) {
	const options = {
		Root: resolve(process.cwd(), "Target"),
		Origin: null,
		Browser: null,
		Json: false,
		Timeout: 20_000,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const flag = argv[index];
		const value = () => {
			const next = argv[index + 1];
			if (next === undefined) throw new Error(`${flag} needs a value`);
			index += 1;
			return next;
		};

		switch (flag) {
			case "--root":
				options.Root = resolve(process.cwd(), value());
				break;
			case "--origin":
				options.Origin = value().replace(/\/+$/, "");
				break;
			case "--browser":
				options.Browser = value();
				break;
			case "--timeout":
				options.Timeout = Number(value());
				break;
			case "--json":
				options.Json = true;
				break;
			case "--help":
			case "-h":
				options.Help = true;
				break;
			default:
				throw new Error(`unknown flag ${flag}`);
		}
	}

	return options;
}

// ---------------------------------------------------------------------------
// The build, copied before it is served
// ---------------------------------------------------------------------------

/**
 * Copy the build so a concurrent rebuild cannot change it mid-audit.
 *
 * The copy is also checked for the assets the workspace page names. A build that
 * is still writing leaves an HTML file pointing at bundles that no longer exist,
 * and an island whose bundle 404s removes its `ssr` marker anyway - so without
 * this check the audit would measure an empty hydration and call it a pass.
 */
async function snapshot(root) {
	if (!existsSync(join(root, Route, "index.html"))) {
		throw new Error(
			`no built workspace at ${join(root, Route, "index.html")}; run the build first`,
		);
	}

	const path = await mkdtemp(join(tmpdir(), "session-audit-build-"));
	await cp(root, path, { recursive: true });

	const html = await readFile(join(path, Route, "index.html"), "utf8");
	const referenced = [
		...html.matchAll(/(?:component-url|renderer-url)=([^\s>]+)/g),
		...html.matchAll(/src=([^\s>]+\.js)/g),
		...html.matchAll(/href=([^\s>]+\.css)/g),
	].map((match) => match[1].replace(/["']/g, ""));

	const missing = [...new Set(referenced)].filter(
		(asset) => asset.startsWith("/") && !existsSync(join(path, asset)),
	);

	if (missing.length > 0) {
		throw new Error(
			`the build is inconsistent: ${missing.join(", ")} is referenced and absent. A build is probably still running; run the audit again when it finishes`,
		);
	}

	return path;
}

// ---------------------------------------------------------------------------
// Static server
// ---------------------------------------------------------------------------

function serve(root) {
	const server = createServer((request, response) => {
		let path;
		try {
			path = decodeURIComponent(new URL(request.url ?? "/", "http://audit").pathname);
		} catch {
			response.writeHead(400).end("bad request");
			return;
		}

		response.setHeader("Cache-Control", "no-store");

		if (path === FixtureRoute) {
			readFile(join(root, Route, "index.html"), "utf8").then(
				(html) => {
					response.setHeader("Content-Type", ContentTypes[".html"]);
					response.end(fixture(html));
				},
				() => response.writeHead(500).end("the built workspace is missing"),
			);
			return;
		}

		if (path.endsWith("/")) path += "index.html";

		const file = normalize(join(root, path));
		if (!file.startsWith(root)) {
			response.writeHead(403).end("outside the build");
			return;
		}

		response.setHeader(
			"Content-Type",
			ContentTypes[extname(file)] ?? "application/octet-stream",
		);
		createReadStream(file)
			.on("error", () => {
				response.writeHead(404).end("not found");
			})
			.pipe(response);
	});

	return new Promise((resolveServer, rejectServer) => {
		server.on("error", rejectServer);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			resolveServer({ server, origin: `http://127.0.0.1:${address.port}` });
		});
	});
}

/**
 * The built page with a session embedded.
 *
 * The element is the page's own mechanism - the store reads it once on mount
 * through `Embed.ts` - so the fixture exercises the shipped path for a signed-in
 * page rather than a hook the product does not have. The island's
 * server-rendered markup is left exactly as built: the session arrives after the
 * first paint, which is the whole point of the ladder.
 */
function fixture(html) {
	const island = html.indexOf("<astro-island");

	if (island === -1) {
		throw new Error("the built page carries no island");
	}

	const element = `<script type="application/json" id="${SessionElement}">${JSON.stringify(FixtureSession)}</script>`;

	return html.slice(0, island) + element + html.slice(island);
}

// ---------------------------------------------------------------------------
// Browser
// ---------------------------------------------------------------------------

function findBrowser(explicit) {
	if (explicit !== null) {
		if (!existsSync(explicit)) throw new Error(`no browser at ${explicit}`);
		return explicit;
	}

	if (process.env.SESSION_AUDIT_BROWSER) {
		const candidate = process.env.SESSION_AUDIT_BROWSER;
		if (!existsSync(candidate)) {
			throw new Error(`SESSION_AUDIT_BROWSER names a missing binary: ${candidate}`);
		}
		return candidate;
	}

	const home = process.env.HOME ?? "";
	const candidates = [
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
	];

	if (home !== "") {
		const cache = join(home, "Library", "Caches", "ms-playwright");
		for (const entry of readdirSafe(cache).sort()) {
			if (!entry.startsWith("chromium-")) continue;
			candidates.push(
				join(
					cache,
					entry,
					"chrome-mac-arm64",
					"Google Chrome for Testing.app",
					"Contents",
					"MacOS",
					"Google Chrome for Testing",
				),
				join(
					cache,
					entry,
					"chrome-mac-x64",
					"Google Chrome for Testing.app",
					"Contents",
					"MacOS",
					"Google Chrome for Testing",
				),
				join(cache, entry, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
				join(cache, entry, "chrome-linux", "chrome"),
			);
		}
	}

	const found = candidates.find((candidate) => existsSync(candidate));
	if (found === undefined) {
		throw new Error("no Chromium found; pass --browser <path> or set SESSION_AUDIT_BROWSER");
	}
	return found;
}

function readdirSafe(path) {
	try {
		return readdirSync(path);
	} catch {
		return [];
	}
}

/**
 * Start a headless browser on its own profile.
 *
 * A fresh temporary profile means the audit never inherits a service worker or a
 * cookie from the person's own session. `--remote-debugging-port=0` makes the
 * port a runtime fact Chromium writes into `DevToolsActivePort`, which is the
 * only way to read it without guessing a free one.
 */
async function launch(browser, timeout) {
	const profile = await mkdtemp(join(tmpdir(), "session-audit-"));
	const child = spawn(
		browser,
		[
			"--headless=new",
			"--disable-gpu",
			"--hide-scrollbars",
			"--no-first-run",
			"--no-default-browser-check",
			"--disable-extensions",
			"--disable-sync",
			"--disable-background-networking",
			"--disable-component-update",
			"--disable-default-apps",
			"--disable-dev-shm-usage",
			"--window-size=1280,900",
			"--remote-debugging-port=0",
			`--user-data-dir=${profile}`,
			"about:blank",
		],
		{ stdio: "ignore" },
	);

	const portFile = join(profile, "DevToolsActivePort");
	const deadline = Date.now() + timeout;
	let port = null;

	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`the browser exited with code ${child.exitCode} before opening a port`);
		}
		try {
			const text = await readFile(portFile, "utf8");
			const first = Number(text.split("\n")[0]);
			if (Number.isInteger(first) && first > 0) {
				port = first;
				break;
			}
		} catch {
			// Not written yet.
		}
		await sleep(100);
	}

	if (port === null) {
		child.kill("SIGTERM");
		throw new Error("the browser never wrote DevToolsActivePort");
	}

	return { child, profile, port };
}

// ---------------------------------------------------------------------------
// CDP
// ---------------------------------------------------------------------------

class Connection {
	constructor(url, timeout) {
		this.timeout = timeout;
		this.sequence = 0;
		this.pending = new Map();
		this.listeners = new Map();
		this.closed = false;

		this.socket = new WebSocket(url);
		this.opened = new Promise((resolveOpen, rejectOpen) => {
			const timer = setTimeout(
				() => rejectOpen(new Error("the browser websocket timed out")),
				timeout,
			);
			this.socket.addEventListener("open", () => {
				clearTimeout(timer);
				resolveOpen();
			});
			this.socket.addEventListener("error", () => {
				clearTimeout(timer);
				rejectOpen(new Error("the browser websocket refused the connection"));
			});
		});

		this.socket.addEventListener("message", (event) => {
			let message;
			try {
				message = JSON.parse(String(event.data));
			} catch {
				return;
			}

			if (typeof message.id === "number") {
				const entry = this.pending.get(message.id);
				if (entry === undefined) return;
				this.pending.delete(message.id);
				clearTimeout(entry.timer);
				if (message.error !== undefined) {
					entry.reject(new Error(`${entry.method}: ${message.error.message}`));
					return;
				}
				entry.resolve(message.result);
				return;
			}

			if (typeof message.method === "string") {
				for (const handler of this.listeners.get(message.method) ?? []) {
					handler(message.params, message.sessionId);
				}
			}
		});

		const fail = () => {
			this.closed = true;
			for (const [, entry] of this.pending) {
				clearTimeout(entry.timer);
				entry.reject(new Error("the browser connection closed"));
			}
			this.pending.clear();
		};
		this.socket.addEventListener("close", fail);
		this.socket.addEventListener("error", fail);
	}

	async send(method, params = {}, sessionId) {
		await this.opened;
		if (this.closed) throw new Error(`${method}: the browser connection is closed`);

		const id = (this.sequence += 1);
		return new Promise((resolveSend, rejectSend) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				rejectSend(new Error(`${method} timed out`));
			}, this.timeout);

			this.pending.set(id, { method, resolve: resolveSend, reject: rejectSend, timer });
			this.socket.send(
				JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }),
			);
		});
	}

	on(method, handler) {
		const set = this.listeners.get(method) ?? new Set();
		set.add(handler);
		this.listeners.set(method, set);

		return () => set.delete(handler);
	}

	once(method) {
		return new Promise((resolveEvent) => {
			const off = this.on(method, (params) => {
				off();
				resolveEvent(params);
			});
		});
	}

	close() {
		this.closed = true;
		try {
			this.socket.close();
		} catch {
			// Already gone.
		}
	}
}

// ---------------------------------------------------------------------------
// One page, measured
// ---------------------------------------------------------------------------

/** What the audit reads out of a page, as one value. */
const Probe = `(() => {
	const Text = (selector) => {
		const element = document.querySelector(selector);
		return element === null ? null : (element.textContent || "").replace(/\\s+/g, " ").trim();
	};
	const Html = (selector) => {
		const element = document.querySelector(selector);
		return element === null ? null : element.outerHTML;
	};
	const Time = document.querySelector(".context__state time");
	return {
		title: document.title || "",
		islands: document.querySelectorAll("astro-island").length,
		pending: document.querySelectorAll("astro-island[ssr]").length,
		drawer: Html(".drawer"),
		context: Html(".context"),
		tabs: Array.from(document.querySelectorAll(".context__tab")).map((entry) => ({
			label: (entry.textContent || "").trim(),
			pressed: entry.getAttribute("aria-pressed"),
		})),
		state: Text(".context__state-word"),
		stateTime: Time === null ? null : Time.getAttribute("datetime"),
		destination: Text(".publish__label"),
		note: Text(".publish__note"),
		columns: document.querySelectorAll("section.drawer-column").length,
		tiles: document.querySelectorAll("article.bento__tile").length,
	};
})()`;

/** Open a tab, load a route, and hand the page to `body`. */
async function visit(connection, { origin, route, scripts = true, timeout, settle, body }) {
	const created = await connection.send("Target.createTarget", {
		url: "about:blank",
		background: true,
	});
	const targetId = created.targetId;
	if (typeof targetId !== "string") throw new Error("the browser created no target");

	const errors = [];
	const warnings = [];
	let sessionId = null;

	try {
		const attached = await connection.send("Target.attachToTarget", {
			targetId,
			flatten: true,
		});
		sessionId = attached.sessionId;

		const page = (method, params) => connection.send(method, params, sessionId);
		const mine = (handler) => (params, from) => {
			if (from === sessionId) handler(params);
		};

		await page("Page.enable");
		await page("Runtime.enable");
		await page("Log.enable");
		await page("Network.enable");
		await page("Network.setBypassServiceWorker", { bypass: true });
		await page("Emulation.setDeviceMetricsOverride", {
			width: 1280,
			height: 900,
			deviceScaleFactor: 1,
			mobile: false,
		});
		await page("Emulation.setScriptExecutionDisabled", { value: scripts === false });

		connection.on(
			"Runtime.exceptionThrown",
			mine((params) => {
				const detail = params.exceptionDetails ?? {};
				errors.push(detail.exception?.description ?? detail.text ?? "an exception");
			}),
		);

		connection.on(
			"Runtime.consoleAPICalled",
			mine((params) => {
				const text = (params.args ?? [])
					.map((argument) => argument.value ?? argument.description ?? "")
					.join(" ");

				if (params.type === "error" || params.type === "assert") errors.push(text);
				if (params.type === "warning") warnings.push(text);
			}),
		);

		connection.on(
			"Log.entryAdded",
			mine((params) => {
				const entry = params.entry ?? {};
				if (entry.level === "error") errors.push(entry.text ?? "a log error");
				if (entry.level === "warning") warnings.push(entry.text ?? "a log warning");
			}),
		);

		// A background target gets no rendering updates, so IntersectionObserver
		// never fires and `client:visible` never hydrates - the hydrated pass would
		// then measure the same static HTML as the script-free one. This is a
		// headless browser of the audit's own, so bringing the tab forward costs
		// nobody anything.
		await page("Page.bringToFront");
		await page("Emulation.setFocusEmulationEnabled", { enabled: true });

		const loaded = connection.once("Page.loadEventFired");
		await page("Page.navigate", { url: `${origin}${route}?audit=${scripts ? "js" : "nojs"}` });
		await Promise.race([loaded, sleep(timeout)]);

		if (scripts) {
			await until(
				async () => {
					const pending = await page("Runtime.evaluate", {
						expression: 'document.querySelectorAll("astro-island[ssr]").length',
						returnByValue: true,
					});

					return (pending.result.value ?? 0) === 0;
				},
				Math.min(timeout, 8000),
			);
		}

		await sleep(200);

		if (settle !== undefined) {
			await until(
				async () => {
					const measured = await page("Runtime.evaluate", {
						expression: settle,
						returnByValue: true,
					});

					return measured.result.value === true;
				},
				Math.min(timeout, 8000),
			);
		}

		const measured = await page("Runtime.evaluate", { expression: Probe, returnByValue: true });
		if (measured.exceptionDetails !== undefined) {
			throw new Error(`the probe threw: ${measured.exceptionDetails.text ?? "unknown"}`);
		}

		return await body({ measured: measured.result.value, page, errors, warnings });
	} finally {
		if (sessionId !== null) {
			await connection.send("Target.detachFromTarget", { sessionId }).catch(() => {});
		}
		await connection.send("Target.closeTarget", { targetId }).catch(() => {});
	}
}

/** Wait for a predicate, and report rather than hang when it never holds. */
async function until(Predicate, timeout) {
	const deadline = Date.now() + timeout;

	while (Date.now() < deadline) {
		if (await Predicate()) return true;
		await sleep(100);
	}

	return false;
}

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

function check(Name, Passed, Detail) {
	return { Name, Status: Passed ? "pass" : "fail", Detail };
}

function judge({ off, on, switched, asOf }) {
	const checks = [];

	checks.push(
		check(
			"mounts with an empty session slot",
			on.pending === 0 && on.islands > 0,
			on.pending === 0
				? `${on.islands} island(s) hydrated`
				: `${on.pending} island(s) never hydrated, so nothing was measured`,
		),
	);

	checks.push(
		check(
			"renders one context, the owner's own",
			on.tabs.length === 1 && on.tabs[0]?.pressed === "true",
			`${on.tabs.length} tab(s): ${on.tabs.map((tab) => `${tab.label}=${tab.pressed}`).join(", ") || "none"}`,
		),
	);

	checks.push(
		check(
			"names its state and its time",
			on.state === "static" && on.stateTime !== null && on.stateTime === asOf,
			`state=${on.state ?? "missing"} time=${on.stateTime ?? "missing"} props=${asOf ?? "missing"}`,
		),
	);

	checks.push(
		check(
			"logs no console error",
			on.errors.length === 0,
			on.errors.length === 0 ? "none" : on.errors.join(" | "),
		),
	);

	const sessionWarnings = on.warnings.filter((entry) => SessionWarning.test(entry));

	checks.push(
		check(
			"logs one warning for the absent session",
			sessionWarnings.length === 1,
			`${sessionWarnings.length} session warning(s), ${on.warnings.length} warning(s) in total`,
		),
	);

	checks.push(
		check(
			"renders the same drawer with scripts off",
			off.drawer !== null && on.drawer !== null && off.drawer === on.drawer,
			off.drawer === null
				? "the script-free pass rendered no drawer"
				: on.drawer === null
					? "the hydrated pass rendered no drawer"
					: off.drawer === on.drawer
						? `${off.drawer.length} bytes, identical`
						: `the drawer differs after hydration (${off.drawer.length} -> ${on.drawer.length} bytes)`,
		),
	);

	checks.push(
		check(
			"renders the same context strip with scripts off",
			off.context !== null && on.context !== null && off.context === on.context,
			off.context === on.context
				? `${off.context?.length ?? 0} bytes, identical`
				: "the strip differs after hydration",
		),
	);

	checks.push(
		check(
			"a resolved session is a snapshot",
			switched.before.state === "snapshot",
			`state=${switched.before.state ?? "missing"}`,
		),
	);

	checks.push(
		check(
			"a room adds a second context",
			switched.before.tabs.length === 2 && switched.before.tabs[1]?.pressed === "false",
			switched.before.tabs.map((tab) => `${tab.label}=${tab.pressed}`).join(", ") || "none",
		),
	);

	checks.push(
		check(
			"switching context leaves the drawer byte-identical",
			switched.before.drawer !== null && switched.before.drawer === switched.after.drawer,
			switched.before.drawer === switched.after.drawer
				? `${switched.before.drawer?.length ?? 0} bytes, identical`
				: "the drawer changed when the context changed",
		),
	);

	checks.push(
		check(
			"switching context changes the publish destination",
			switched.before.destination !== switched.after.destination,
			`${switched.before.destination ?? "none"} -> ${switched.after.destination ?? "none"}`,
		),
	);

	checks.push(
		check(
			"switching context moves the selection",
			switched.after.tabs[1]?.pressed === "true" &&
				switched.after.tabs[0]?.pressed === "false",
			switched.after.tabs.map((tab) => `${tab.label}=${tab.pressed}`).join(", ") || "none",
		),
	);

	return checks;
}

function report(checks, meta) {
	const lines = [`session audit  origin=${meta.Origin}  browser=${meta.Browser}`];

	for (const entry of checks) {
		lines.push(
			`  ${entry.Status === "pass" ? "PASS" : "FAIL"}  ${entry.Name.padEnd(52)} ${entry.Detail}`,
		);
	}

	const passed = checks.filter((entry) => entry.Status === "pass").length;
	lines.push("", `${checks.length} checks: ${passed} pass, ${checks.length - passed} fail`);

	return lines.join("\n");
}

function sleep(ms) {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const options = parseArguments(process.argv.slice(2));

	if (options.Help) {
		console.log(
			"node session-audit.mjs [--root <dir>] [--origin <url>] [--browser <path>] [--json] [--timeout <ms>]",
		);
		return 0;
	}

	let copy = null;
	let server = null;
	let origin = options.Origin;

	if (origin === null) {
		copy = await snapshot(options.Root);
		const served = await serve(copy);
		server = served.server;
		origin = served.origin;
	}

	const browser = findBrowser(options.Browser);
	const launched = await launch(browser, options.Timeout);
	let connection = null;

	try {
		const version = await (async () => {
			const deadline = Date.now() + options.Timeout;
			while (Date.now() < deadline) {
				try {
					const response = await fetch(`http://127.0.0.1:${launched.port}/json/version`);
					if (response.ok) return await response.json();
				} catch {
					// Still starting.
				}
				await sleep(100);
			}
			throw new Error("the browser never answered /json/version");
		})();

		connection = new Connection(version.webSocketDebuggerUrl, options.Timeout);
		await connection.opened;

		const off = await visit(connection, {
			origin,
			route: Route,
			scripts: false,
			timeout: options.Timeout,
			body: ({ measured }) => measured,
		});

		const on = await visit(connection, {
			origin,
			route: Route,
			scripts: true,
			timeout: options.Timeout,
			body: ({ measured, errors, warnings }) => ({ ...measured, errors, warnings }),
		});

		const switched = await visit(connection, {
			origin,
			route: FixtureRoute,
			timeout: options.Timeout,
			// The session is read on mount, so the second context appears after the
			// first paint. Waiting for it is waiting for the ladder, not for luck.
			settle: 'document.querySelectorAll(".context__tab").length === 2',
			body: async ({ measured, page }) => {
				const clicked = await page("Runtime.evaluate", {
					expression: `(() => {
						const tabs = document.querySelectorAll(".context__tab");
						if (tabs.length < 2) return false;
						tabs[1].click();
						return true;
					})()`,
					returnByValue: true,
				});

				if (clicked.result.value !== true) {
					return { before: measured, after: measured, clicked: false };
				}

				await sleep(150);

				const after = await page("Runtime.evaluate", {
					expression: Probe,
					returnByValue: true,
				});

				return { before: measured, after: after.result.value, clicked: true };
			},
		});

		const asOf = await propsAsOf(origin);

		const checks = judge({ off, on, switched, asOf });

		if (switched.clicked !== true) {
			checks.push(
				check("the fixture page rendered a second context", false, "fewer than two tabs"),
			);
		}

		if (options.Json) {
			console.log(
				JSON.stringify({ meta: { Origin: origin, Browser: browser }, checks }, null, 2),
			);
		} else {
			console.log(report(checks, { Origin: origin, Browser: browser }));
		}

		return checks.some((entry) => entry.Status === "fail") ? 1 : 0;
	} finally {
		connection?.close();
		launched.child.kill("SIGTERM");
		server?.close();
		await sleep(300);
		await rm(launched.profile, { recursive: true, force: true }).catch(() => {});
		if (copy !== null) await rm(copy, { recursive: true, force: true }).catch(() => {});
	}
}

/**
 * The `AsOf` prop the build wrote, read from the served document.
 *
 * Read rather than computed: the check is that the state line names the value
 * the page was built with, and a clock would let it pass by coincidence.
 */
async function propsAsOf(origin) {
	const response = await fetch(`${origin}${Route}`);
	const html = await response.text();

	// A page carries more than one island, and only the workspace's props name the
	// build time. Reading the first island's props would be reading the rail's.
	for (const found of html.matchAll(/props="([^"]*)"/g)) {
		let props;
		try {
			props = JSON.parse(decode(found[1]));
		} catch {
			continue;
		}

		const asOf = props["AsOf"];

		if (Array.isArray(asOf)) {
			return asOf[1];
		}
	}

	return null;
}

/** The HTML entity set Astro escapes an attribute value with. */
function decode(value) {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}

main()
	.then((code) => process.exit(code))
	.catch((error) => {
		console.error(
			`session audit could not run: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	});

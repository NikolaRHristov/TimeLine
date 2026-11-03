#!/usr/bin/env node
/**
 * Open a URL in a background tab of a browser this process owns, and report what
 * the page renders.
 *
 * Prints the tab's CDP handle so a follow-up driver can act in it, plus the
 * page's title and the first slice of `document.body.innerText`. Nothing is
 * activated: the target is created with `background: true`.
 *
 *   node cdp-open.mjs <url> [settle-ms]
 *
 * The endpoint is `CDP`, default `http://127.0.0.1:9222`. Exit 2 with one
 * `blocker:` line when there is no endpoint, or when the target never appears.
 */
const Cdp = process.env["CDP"] ?? "http://127.0.0.1:9222";
const Url = process.argv[2];
const Settle = Number(process.argv[3] ?? 6000);

if (!Url) {
	console.error("usage: node cdp-open.mjs <url> [settle-ms]");
	process.exit(2);
}

process.on("unhandledRejection", (Error) => {
	console.error(`blocker: ${Error?.message ?? Error}`);
	process.exit(2);
});

const sleep = (Ms) => new Promise((Done) => setTimeout(Done, Ms));
let Id = 0;
const Pending = new Map();

const Connect = (SocketUrl) =>
	new Promise((Done, Fail) => {
		const Socket = new WebSocket(SocketUrl);
		Socket.onopen = () => Done(Socket);
		Socket.onerror = (Event) => Fail(new Error(`cannot connect: ${Event.message ?? "error"}`));
		Socket.onmessage = (Event) => {
			const Message = JSON.parse(Event.data);
			const Slot = Pending.get(Message.id);
			if (Slot === undefined) return;
			Pending.delete(Message.id);
			if (Message.error)
				Slot.Fail(new Error(`${Message.error.message} (${Message.error.code})`));
			else Slot.Done(Message.result);
		};
	});

const Send = (Socket, Method, Params = {}) =>
	new Promise((Done, Fail) => {
		const Key = ++Id;
		Pending.set(Key, { Done, Fail });
		Socket.send(JSON.stringify({ id: Key, method: Method, params: Params }));
	});

let Version;
try {
	Version = await (await fetch(`${Cdp}/json/version`)).json();
} catch {
	console.error(
		`blocker: no CDP endpoint on ${Cdp}; start a browser with --remote-debugging-port`,
	);
	process.exit(2);
}

const Browser = await Connect(Version.webSocketDebuggerUrl);
const { targetId } = await Send(Browser, "Target.createTarget", {
	url: "about:blank",
	background: true,
});

let Page;
for (let Try = 0; Try < 40 && Page === undefined; Try++) {
	Page = (await (await fetch(`${Cdp}/json/list`)).json()).find((Tab) => Tab.id === targetId);
	if (Page === undefined) await sleep(250);
}
if (Page === undefined) {
	console.error("blocker: the target never appeared in /json/list");
	process.exit(2);
}

const Tab = await Connect(Page.webSocketDebuggerUrl);
await Send(Tab, "Page.enable");
await Send(Tab, "Emulation.setFocusEmulationEnabled", { enabled: true });
await Send(Tab, "Page.navigate", { url: Url });
await sleep(Settle);

const Read = await Send(Tab, "Runtime.evaluate", {
	expression:
		"JSON.stringify({ url: location.href, title: document.title, chars: document.body ? document.body.innerText.length : 0, head: (document.body ? document.body.innerText : '').slice(0, 1500) })",
	returnByValue: true,
});

const Data = JSON.parse(Read.result.value);
console.log(JSON.stringify({ targetId, ws: Page.webSocketDebuggerUrl, ...Data }, null, 1));
Tab.close();
Browser.close();

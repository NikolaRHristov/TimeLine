#!/usr/bin/env node
/**
 * Read a tab's rendered text, waiting until it stops growing.
 *
 * A chat UI streams: reading once returns a partial answer, and reading after a
 * fixed sleep returns whatever the network happened to deliver. This polls
 * `document.body.innerText` and stops when it has been identical for a few
 * consecutive ticks, which is the only completion signal that does not depend on
 * a site's own markup.
 *
 *   node cdp-read.mjs <ws-url> [--tail N] [--stable N] [--timeout S]
 *
 * `--tail` prints only the last N characters, `--stable` is the number of
 * identical ticks that count as finished, `--timeout` bounds the wait. Exit 2
 * with one `blocker:` line when the tab produced no text.
 */
const Args = process.argv.slice(2);
const WsUrl = Args[0];

if (!WsUrl) {
	console.error("usage: node cdp-read.mjs <ws-url> [--tail N] [--stable N] [--timeout S]");
	process.exit(2);
}

const Flag = (Name, Fallback) => {
	const At = Args.indexOf(Name);
	return At === -1 ? Fallback : Number(Args[At + 1]);
};

const Tail = Flag("--tail", 0);
const Stable = Flag("--stable", 3);
const Timeout = Flag("--timeout", 180);

process.on("unhandledRejection", (Error) => {
	console.error(`blocker: ${Error?.message ?? Error}`);
	process.exit(2);
});

const sleep = (Ms) => new Promise((Done) => setTimeout(Done, Ms));
let Id = 0;
const Pending = new Map();
const Socket = new WebSocket(WsUrl);

try {
	await new Promise((Done, Fail) => {
		Socket.onopen = Done;
		Socket.onerror = (Event) => Fail(new Error(`cannot connect: ${Event.message ?? "error"}`));
	});
} catch (Error) {
	console.error(`blocker: ${Error.message}`);
	process.exit(2);
}

Socket.onmessage = (Event) => {
	const Message = JSON.parse(Event.data);
	const Slot = Pending.get(Message.id);
	if (Slot === undefined) return;
	Pending.delete(Message.id);
	if (Message.error) Slot.Fail(new Error(`${Message.error.message} (${Message.error.code})`));
	else Slot.Done(Message.result);
};

const Send = (Method, Params = {}) =>
	new Promise((Done, Fail) => {
		const Key = ++Id;
		Pending.set(Key, { Done, Fail });
		Socket.send(JSON.stringify({ id: Key, method: Method, params: Params }));
	});

const Text = async () => {
	const Read = await Send("Runtime.evaluate", {
		expression: "document.body ? document.body.innerText : ''",
		returnByValue: true,
	});
	return Read.result?.value ?? "";
};

const Deadline = Date.now() + Timeout * 1000;
let Previous = "";
let Same = 0;
let Current = "";

while (Date.now() < Deadline) {
	await sleep(1000);
	Current = await Text();
	if (Current.length > 0 && Current === Previous) Same++;
	else Same = 0;
	Previous = Current;
	if (Same >= Stable) break;
}

Socket.close();

if (Current.length === 0) {
	console.error("blocker: the tab produced no text");
	process.exit(2);
}

const Body = Tail > 0 ? Current.slice(-Tail) : Current;
console.log(`chars: ${Current.length}`);
console.log("---");
console.log(Body);

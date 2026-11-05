/**
 * Type into the composer of a tab this process was given, then press Submit.
 *
 * Input goes through the CDP Input domain rather than `el.click()`: the
 * composer is a contenteditable that only accepts real input events, and the
 * submit control is a real <button> that the page enables once text lands.
 *
 *   node cdp-send.mjs <ws-url> "<text>"
 */
const [WsUrl, Text] = process.argv.slice(2);

if (!WsUrl || !Text) {
	console.error('usage: node cdp-send.mjs <ws-url> "<text>"');
	process.exit(2);
}

const sleep = (Ms) => new Promise((Done) => setTimeout(Done, Ms));

// An unreachable tab is a blocker with one line, not a stack trace: the caller
// reads the exit code and the reason, and 2 is this driver's "could not run".
process.on("unhandledRejection", (Error) => {
	console.error(`blocker: ${Error?.message ?? Error}`);
	process.exit(2);
});

const Socket = new WebSocket(WsUrl);
let Id = 0;
const Pending = new Map();

const Send = (Method, Params = {}) =>
	new Promise((Done, Fail) => {
		const Key = ++Id;
		Pending.set(Key, { Done, Fail });
		Socket.send(JSON.stringify({ id: Key, method: Method, params: Params }));
	});

Socket.onmessage = (Event) => {
	const Message = JSON.parse(Event.data);
	const Slot = Pending.get(Message.id);
	if (Slot === undefined) return;
	Pending.delete(Message.id);
	if (Message.error) Slot.Fail(new Error(`${Message.error.message} (${Message.error.code})`));
	else Slot.Done(Message.result);
};

try {
	await new Promise((Done, Fail) => {
		Socket.onopen = Done;
		Socket.onerror = (Event) => Fail(new Error(`cannot connect: ${Event.message ?? "error"}`));
	});
} catch (Error) {
	// A top-level await rejection is an uncaught exception, not an unhandled
	// rejection, so the handler above never sees it: catch it here or the
	// caller reads exit 1 and a stack trace instead of the blocker.
	console.error(`blocker: ${Error.message}`);
	process.exit(2);
}

const Evaluate = async (Expression) => {
	const Result = await Send("Runtime.evaluate", { expression: Expression, returnByValue: true, awaitPromise: true });
	if (Result.exceptionDetails) throw new Error(Result.exceptionDetails.text);
	return Result.result.value;
};

const State = () =>
	Evaluate(`(() => {
		// The first composer in DOM order can be a hidden one behind a panel, so
		// pick the one that is actually laid out.
		const Composers = [...document.querySelectorAll('textarea, [contenteditable="true"]')]
			.filter((Element) => {
				const Box = Element.getBoundingClientRect();
				return Box.width > 0 && Box.height > 0;
			});
		const Composer = Composers[0];
		const Submit = [...document.querySelectorAll("button")]
			.find((Button) => (Button.getAttribute("aria-label") ?? "").toLowerCase() === "submit");
		const Rect = (Element) => {
			if (!Element) return null;
			const Box = Element.getBoundingClientRect();
			return { x: Math.round(Box.x + Box.width / 2), y: Math.round(Box.y + Box.height / 2) };
		};
		return JSON.stringify({
			composer: Rect(Composer),
			focused: Composer !== undefined && document.activeElement === Composer,
			text: (Composer?.value ?? Composer?.innerText ?? "").trim().slice(0, 120),
			submit: Submit ? { at: Rect(Submit), disabled: Submit.disabled } : null,
		});
	})()`);

const Click = async (Point) => {
	await Send("Input.dispatchMouseEvent", { type: "mouseMoved", x: Point.x, y: Point.y });
	await Send("Input.dispatchMouseEvent", { type: "mousePressed", x: Point.x, y: Point.y, button: "left", clickCount: 1 });
	await Send("Input.dispatchMouseEvent", { type: "mouseReleased", x: Point.x, y: Point.y, button: "left", clickCount: 1 });
};

const Before = JSON.parse(await State());
if (!Before.composer) {
	console.error("blocker: no composer in this tab");
	process.exit(2);
}

// Search mode is mandatory. A composer that cannot be put into Search is a
// composer this driver does not understand, and an answer from the agent mode is
// a different answer that looks exactly like a right one - so refuse, don't send.
const Mode = () =>
	Evaluate(`(() => {
		const Toggles = [...document.querySelectorAll("[data-command-menu-control] button")].map((Button) => {
			const Box = Button.getBoundingClientRect();
			return {
				label: (Button.getAttribute("aria-label") ?? "").toLowerCase(),
				pressed: Button.getAttribute("aria-pressed") === "true",
				at: { x: Math.round(Box.x + Box.width / 2), y: Math.round(Box.y + Box.height / 2) },
			};
		});
		return JSON.stringify({ toggles: Toggles });
	})()`);

const Pressed = (Toggles, Label) => Toggles.find((Toggle) => Toggle.label === Label)?.pressed === true;

// A refusal leaves the tab alone, so it closes its own socket first: a client
// that vanishes mid-conversation can make the caller's own close of that tab
// race the detach.
const Refuse = (Message) => {
	console.error(`blocker: ${Message}`);
	try {
		Socket.close();
	} catch {}
	process.exit(2);
};

let Toggles = JSON.parse(await Mode()).toggles;
if (Toggles.length === 0) {
	Refuse("no Search/Computer toggle in this composer; an unknown mode is not sent from");
}
const Search = Toggles.find((Toggle) => Toggle.label === "search");
if (Search === undefined) {
	Refuse("the composer has a toggle group but no Search control; not sending");
}
if (!Pressed(Toggles, "search") || Pressed(Toggles, "computer")) {
	await Click(Search.at);
	await sleep(700);
	Toggles = JSON.parse(await Mode()).toggles;
	if (!Pressed(Toggles, "search") || Pressed(Toggles, "computer")) {
		Refuse(
			`Search mode did not take (search=${Pressed(Toggles, "search")}, computer=${Pressed(Toggles, "computer")}); not sending from Computer mode`,
		);
	}
}
console.log(`mode: search`);

await Click(Before.composer);
// Replace whatever is already in the composer rather than appending to it:
// `insertText` types at the caret, so a leftover draft would be concatenated.
await Send("Input.dispatchKeyEvent", {
	type: "keyDown",
	key: "a",
	code: "KeyA",
	modifiers: 4,
	commands: ["selectAll"],
	windowsVirtualKeyCode: 65,
	nativeVirtualKeyCode: 65,
});
await Send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 4 });
await Send("Input.insertText", { text: Text });
await sleep(400);

const Typed = JSON.parse(await State());
console.log(`typed: ${JSON.stringify(Typed.text)}`);
console.log(`submit after typing: ${JSON.stringify(Typed.submit)}`);

if (Typed.submit === null || Typed.submit.disabled) {
	console.error("blocker: the submit control did not enable after typing; not clicking a dead button");
	process.exit(1);
}

await Click(Typed.submit.at);
await sleep(1500);

let After = JSON.parse(await State());

// A click that lands on a wrapper does nothing and reports nothing, so the
// composer is the check, not the click: fall back to Enter, which is the
// submit path every chat composer implements.
if (After.text.length > 0) {
	await Send("Input.dispatchKeyEvent", {
		type: "keyDown",
		key: "Enter",
		code: "Enter",
		windowsVirtualKeyCode: 13,
		nativeVirtualKeyCode: 13,
	});
	await Send("Input.dispatchKeyEvent", {
		type: "keyUp",
		key: "Enter",
		code: "Enter",
		windowsVirtualKeyCode: 13,
		nativeVirtualKeyCode: 13,
	});
	await sleep(1500);
	After = JSON.parse(await State());
}

const Sent = After.text.length === 0;
console.log(`composer after submit: ${JSON.stringify(After.text)}`);
console.log(`sent: ${Sent}`);

Socket.close();
process.exit(Sent ? 0 : 1);

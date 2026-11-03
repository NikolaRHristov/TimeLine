#!/usr/bin/env node
/**
 * Click one control in a tab by its accessible label, with real input events.
 *
 * A synthetic `el.click()` is ignored by anything listening on the pointer
 * pipeline, so this measures the element and dispatches mouse events through the
 * Input domain instead. It prints what it found and where it clicked, so a miss
 * is a report rather than a silent no-op.
 *
 *   node cdp-click.mjs <ws-url> "<aria-label or visible text>"
 *   node cdp-click.mjs <ws-url> "css:<selector>"
 *
 * `css:` reaches a control that carries no accessible label - a switch, a
 * canvas, a row. A zero rect is reported, never clicked: an element that is laid
 * out nowhere is not the one on the page.
 *
 * Exit 2 with one `blocker:` line when the control is not there or the tab
 * cannot be reached.
 */
const [WsUrl, Label] = process.argv.slice(2);

if (!WsUrl || !Label) {
	console.error('usage: node cdp-click.mjs <ws-url> "<label>"');
	process.exit(2);
}

process.on("unhandledRejection", (Error) => {
	console.error(`blocker: ${Error?.message ?? Error}`);
	process.exit(2);
});

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

const Found = await Send("Runtime.evaluate", {
	expression: `(() => {
		const Wanted = ${JSON.stringify(Label)};
		// "css:<selector>" targets an element that carries no accessible label -
		// a switch, a canvas, a row - which the label match cannot reach.
		const BySelector = Wanted.startsWith("css:");
		const Candidates = BySelector
			? [...document.querySelectorAll(Wanted.slice(4))]
			: [...document.querySelectorAll("button, a, [role=button], [role=menuitem], [role=tab]")];
		const Hit = BySelector
			? Candidates[0]
			: Candidates.find((Element) =>
				((Element.getAttribute("aria-label") ?? "").trim() === Wanted) ||
				((Element.innerText ?? "").trim() === Wanted));
		if (Hit === undefined) return JSON.stringify({ found: false });
		const Box = Hit.getBoundingClientRect();
		if (Box.width === 0 || Box.height === 0) return JSON.stringify({ found: false, reason: "zero rect" });
		return JSON.stringify({
			found: true,
			x: Math.round(Box.x + Box.width / 2),
			y: Math.round(Box.y + Box.height / 2),
			rect: { w: Math.round(Box.width), h: Math.round(Box.height) },
		});
	})()`,
	returnByValue: true,
});

const Target = JSON.parse(Found.result.value);
if (!Target.found) {
	console.error(
		`blocker: no control labelled ${JSON.stringify(Label)} (${Target.reason ?? "not in the page"})`,
	);
	process.exit(2);
}

await Send("Input.dispatchMouseEvent", { type: "mouseMoved", x: Target.x, y: Target.y });
await Send("Input.dispatchMouseEvent", {
	type: "mousePressed",
	x: Target.x,
	y: Target.y,
	button: "left",
	clickCount: 1,
});
await Send("Input.dispatchMouseEvent", {
	type: "mouseReleased",
	x: Target.x,
	y: Target.y,
	button: "left",
	clickCount: 1,
});

console.log(
	JSON.stringify({ clicked: Label, at: { x: Target.x, y: Target.y }, rect: Target.rect }),
);
Socket.close();

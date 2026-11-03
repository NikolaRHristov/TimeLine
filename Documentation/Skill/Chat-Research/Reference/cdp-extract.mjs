/**
 * Serialise a rendered answer to Markdown, with the maths kept as maths.
 *
 * `document.body.innerText` is the wrong reader for a rendered page: KaTeX draws
 * a formula as hundreds of positioned glyphs, so innerText returns them one per
 * line and the expression is destroyed. The original TeX is still in the DOM,
 * inside `<annotation encoding="application/x-tex">`, and that is what this
 * reads.
 *
 *   node cdp-extract.mjs <ws-url> [--selector "main"] [--out <file>]
 */
import { writeFileSync } from "node:fs";

const Args = process.argv.slice(2);
const WsUrl = Args[0];
const At = (Name, Fallback) => {
	const Index = Args.indexOf(Name);
	return Index === -1 ? Fallback : Args[Index + 1];
};
const Selector = At("--selector", "main");
const Out = At("--out", null);

if (!WsUrl) {
	console.error("usage: node cdp-extract.mjs <ws-url> [--selector main] [--out file]");
	process.exit(2);
}

process.on("unhandledRejection", (Error) => {
	console.error(`blocker: ${Error?.message ?? Error}`);
	process.exit(2);
});

const Extract = `(() => {
	const Root = document.querySelector(${JSON.stringify(Selector)});
	if (Root === null) return JSON.stringify({ error: "no element for the selector" });

	const Tex = (Element) => {
		const Annotation = Element.querySelector('annotation[encoding="application/x-tex"]');
		return (Annotation ? Annotation.textContent : Element.textContent).trim();
	};

	const Inline = (Element) => {
		let Text = "";
		for (const Node of Element.childNodes) {
			if (Node.nodeType === 3) {
				Text += Node.textContent.replace(/\\s+/g, " ");
				continue;
			}
			if (Node.nodeType !== 1) continue;
			const Tag = Node.tagName.toLowerCase();
			if (Node.classList.contains("katex") || Node.querySelector(".katex")) {
				const Display = Node.classList.contains("katex-display");
				Text += (Display ? "$$" : "$") + Tex(Node) + (Display ? "$$" : "$");
			} else if (Tag === "code") {
				Text += "\\u0060" + Node.textContent + "\\u0060";
			} else if (Tag === "strong" || Tag === "b") {
				Text += "**" + Inline(Node) + "**";
			} else if (Tag === "em" || Tag === "i") {
				Text += "*" + Inline(Node) + "*";
			} else if (Tag === "a") {
				const Href = Node.getAttribute("href") || "";
				const Label = Inline(Node).trim();
				Text += Href.startsWith("http") && Label.length > 0 ? "[" + Label + "](" + Href + ")" : Label;
			} else if (Tag === "br") {
				Text += "\\n";
			} else {
				Text += Inline(Node);
			}
		}
		return Text;
	};

	const Blocks = (Element, Depth) => {
		let Out = "";
		for (const Node of Element.children) {
			const Tag = Node.tagName.toLowerCase();
			const Class = Node.className && typeof Node.className === "string" ? Node.className : "";

			if (Class.includes("katex-display")) {
				Out += "\\n\\n$$" + Tex(Node) + "$$\\n\\n";
			} else if (Tag === "h1" || Tag === "h2" || Tag === "h3" || Tag === "h4" || Tag === "h5" || Tag === "h6") {
				Out += "\\n\\n" + "#".repeat(Number(Tag[1])) + " " + Inline(Node).trim() + "\\n\\n";
			} else if (Tag === "p") {
				const Text = Inline(Node).trim();
				if (Text.length > 0) Out += "\\n\\n" + Text + "\\n\\n";
			} else if (Tag === "ul" || Tag === "ol") {
				let Index = 0;
				Out += "\\n";
				for (const Item of Node.querySelectorAll(":scope > li")) {
					Index++;
					const Marker = Tag === "ol" ? Index + ". " : "- ";
					const Body = Inline(Item).trim().replace(/\\n+/g, " ");
					Out += Marker + Body + "\\n";
					const Nested = Item.querySelector(":scope > ul, :scope > ol");
					if (Nested !== null) Out += Blocks(Item, Depth + 1).split("\\n").filter(Boolean).map((Line) => "  " + Line).join("\\n") + "\\n";
				}
				Out += "\\n";
			} else if (Tag === "pre") {
				const Code = Node.querySelector("code");
				const Language = Code && Code.className ? (Code.className.match(/language-([a-z0-9+]+)/i) || [])[1] || "" : "";
				Out += "\\n\\n\\u0060\\u0060\\u0060" + Language + "\\n" + (Code ? Code.textContent : Node.textContent).replace(/\\n+$/, "") + "\\n\\u0060\\u0060\\u0060\\n\\n";
			} else if (Tag === "blockquote") {
				Out += "\\n\\n> " + Inline(Node).trim() + "\\n\\n";
			} else if (Tag === "hr") {
				Out += "\\n\\n---\\n\\n";
			} else if (Tag === "table") {
				const Rows = [...Node.querySelectorAll("tr")].map((Row) =>
					[...Row.querySelectorAll("th, td")].map((Cell) => Inline(Cell).trim().replace(/\\|/g, "\\\\|")),
				);
				if (Rows.length > 0) {
					Out += "\\n\\n| " + Rows[0].join(" | ") + " |\\n|" + Rows[0].map(() => " --- ").join("|") + "|\\n";
					for (const Row of Rows.slice(1)) Out += "| " + Row.join(" | ") + " |\\n";
					Out += "\\n";
				}
			} else if (Node.children.length > 0) {
				Out += Blocks(Node, Depth + 1);
			} else {
				const Text = Inline(Node).trim();
				if (Text.length > 0) Out += Text + "\\n";
			}
		}
		return Out;
	};

	const Markdown = Blocks(Root, 0)
		.replace(/\\n{3,}/g, "\\n\\n")
		.replace(/[ \\t]+\\n/g, "\\n")
		.trim();

	return JSON.stringify({
		chars: Markdown.length,
		katex: Root.querySelectorAll(".katex").length,
		code: Root.querySelectorAll("pre").length,
		markdown: Markdown,
	});
})()`;

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

const Result = await Send("Runtime.evaluate", { expression: Extract, returnByValue: true });
if (Result.exceptionDetails) {
	console.error(`blocker: ${Result.exceptionDetails.text}`);
	process.exit(2);
}

const Parsed = JSON.parse(Result.result.value);
if (Parsed.error) {
	console.error(`blocker: ${Parsed.error}`);
	process.exit(2);
}

if (Out !== null) {
	writeFileSync(Out, Parsed.markdown + "\n");
	console.error(`wrote ${Out}: ${Parsed.chars} chars, ${Parsed.katex} formula(s), ${Parsed.code} code block(s)`);
} else {
	process.stdout.write(Parsed.markdown + "\n");
}
Socket.close();

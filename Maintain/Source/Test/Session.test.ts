import assert from "node:assert/strict";
import { test } from "node:test";
import type { CDPClient } from "../Browser/CDP/Client.ts";
import { withPage, type PageBrowser } from "../Browser/Session/Page.ts";
import { bind } from "../Browser/Session/Session.ts";
import { fail, isFailure } from "../CLI/Parser/Output/Failure.ts";
import type { Tab } from "../Model/Tab/Tab.ts";

const TAB: Tab = {
	id: "FAKE",
	title: "AI / X",
	url: "https://x.com/i/lists/1",
	active: false,
	attached: false,
};

/**
 * What `Runtime.evaluate` can answer with: a value, the exception details a
 * throwing expression produces, or the protocol error the browser raises.
 */
type Reply =
	| { result: { value: unknown } }
	| { exceptionDetails: { text: string; exception: { description: string } } }
	| { error: { code: number; message: string } };

/**
 * A client that answers `Runtime.evaluate` from a script, once per call.
 *
 * The two failures a readiness poll can meet are modelled as they arrive in
 * production: an expression that throws comes back as `exceptionDetails` and
 * `evaluate` turns it into `cdp-error`, while a navigation's protocol error is
 * what the real client raises, so the fake raises that same `Failure`. Nothing
 * here is a shortcut around the code under test - `bind` builds a real session
 * and `waitFor` classifies exactly what it would classify against a live tab.
 */
function fakeClient(script: (call: number) => Reply): {
	client: CDPClient;
	calls: () => number;
	expressions: () => string[];
} {
	let calls = 0;
	const expressions: string[] = [];
	const client: CDPClient = {
		send<T>(method: string, params?: Record<string, unknown>): Promise<T> {
			if (method !== "Runtime.evaluate") return Promise.resolve({} as unknown as T);
			calls += 1;
			expressions.push(String(params?.["expression"] ?? ""));
			const reply = script(calls);
			if ("error" in reply) {
				return Promise.reject(
					fail("cdp-error", `Runtime.evaluate: ${reply.error.message}`, {
						method,
						code: reply.error.code,
					}),
				);
			}
			return Promise.resolve(reply as unknown as T);
		},
		on(_method: string, _handler: (params: unknown) => void): void {},
		closed(): boolean {
			return false;
		},
		close(): void {},
	};
	return { client, calls: () => calls, expressions: () => expressions };
}

/** A browser whose four operations are all replaceable. */
function fakeBrowser(overrides: Partial<PageBrowser> = {}): PageBrowser {
	return {
		discover: async () => [],
		open: async () => TAB,
		attach: async () => {
			throw fail("cdp-unreachable", "the target websocket refused the connection");
		},
		close: async () => {},
		...overrides,
	};
}

/** Whatever a piece of asynchronous code writes to stderr, and what it returns. */
async function capture<T>(work: () => Promise<T>): Promise<{ value: T; text: string }> {
	const original = process.stderr.write.bind(process.stderr);
	let text = "";
	process.stderr.write = ((chunk: unknown) => {
		text += String(chunk);
		return true;
	}) as typeof process.stderr.write;
	try {
		const value = await work();
		return { value, text };
	} finally {
		process.stderr.write = original;
	}
}

test("a permanent evaluation error stops the wait and keeps its cause", async () => {
	const { client, calls, expressions } = fakeClient(() => ({
		exceptionDetails: {
			text: "Uncaught",
			exception: {
				description: "ReferenceError: ready is not defined\n    at <anonymous>:1:1",
			},
		},
	}));
	const session = await bind(client, TAB);

	const started = Date.now();
	let thrown: unknown = null;
	try {
		await session.waitFor("ready", { timeout: 15_000, interval: 150 });
	} catch (error) {
		thrown = error;
	}
	const elapsed = Date.now() - started;

	assert.ok(isFailure(thrown), "a page that cannot be asked must not answer false");
	if (!isFailure(thrown)) return;

	// The code is the one the evaluation failed with, so "could not ask" is
	// still distinguishable from "the page threw" and from a dead socket.
	assert.equal(thrown.code, "cdp-error");
	assert.match(thrown.message, /^the page could not be asked whether it was ready: /);
	assert.match(thrown.message, /ReferenceError: ready is not defined/);
	assert.equal(thrown.extra["expression"], "ready");

	// What a reader of the JSON actually gets, instead of a bare timeout.
	assert.deepEqual(thrown.toObject(), {
		error: "cdp-error",
		detail:
			"the page could not be asked whether it was ready: " +
			"ReferenceError: ready is not defined",
		expression: "ready",
	});

	// One attempt: the cause is known on the first evaluation, so the fifteen
	// second deadline never runs.
	assert.equal(calls(), 1);
	assert.deepEqual(expressions(), ["Boolean(ready)"]);
	assert.ok(elapsed < 2000, `the wait took ${elapsed} ms, so it timed out instead`);
});

test("a destroyed execution context is retried, and the next attempt answers", async () => {
	const { client, calls } = fakeClient((call) =>
		call === 1
			? { error: { code: -32000, message: "Execution context was destroyed." } }
			: { result: { value: true } },
	);
	const session = await bind(client, TAB);

	const ready = await session.waitFor('document.readyState === "complete"', {
		timeout: 5000,
		interval: 10,
	});

	assert.equal(ready, true);
	assert.equal(calls(), 2);
});

test("a page that is merely not ready still answers false at the deadline", async () => {
	const { client, calls } = fakeClient(() => ({ result: { value: false } }));
	const session = await bind(client, TAB);

	const ready = await session.waitFor('document.querySelectorAll("article").length > 0', {
		timeout: 300,
		interval: 50,
	});

	// The contract every caller already relies on: polling past the deadline is
	// an answer, not a failure.
	assert.equal(ready, false);
	assert.ok(calls() > 1, "the expression was only evaluated once");
});

test("a tab opened before a failed attach is closed again", async () => {
	const closed: string[] = [];
	const browser = fakeBrowser({
		close: async (id) => {
			closed.push(id);
		},
	});
	let ran = false;

	await assert.rejects(
		withPage(
			TAB.url,
			{ ephemeral: true },
			async () => {
				ran = true;
				return "body";
			},
			browser,
		),
		(error: unknown) => isFailure(error) && error.code === "cdp-unreachable",
	);

	assert.deepEqual(closed, [TAB.id], "the tab this run opened was left behind");
	assert.equal(ran, false, "the body ran without a session");
});

test("a failed close is reported with its reason and never replaces the real failure", async () => {
	const browser = fakeBrowser({
		close: async () => {
			throw fail("cdp-unreachable", "GET /json/close/FAKE failed", { id: TAB.id });
		},
	});
	let thrown: unknown = null;

	const { text } = await capture(async () => {
		try {
			await withPage(TAB.url, { ephemeral: true }, async () => "body", browser);
		} catch (error) {
			thrown = error;
		}
	});

	assert.ok(isFailure(thrown));
	if (!isFailure(thrown)) return;

	// Cleanup must not mask the failure that caused it.
	assert.equal(thrown.code, "cdp-unreachable");
	assert.match(thrown.message, /refused the connection/);

	// ...and the leak is named, with the reason, instead of being swallowed.
	assert.match(
		text,
		/maintain: the tab this run opened \(FAKE\) could not be closed: GET \/json\/close\/FAKE failed\n/,
	);
});

test("a tab that was already open is never closed, even when the body fails", async () => {
	const closed: string[] = [];
	const { client } = fakeClient(() => ({ result: { value: TAB.url } }));
	const browser = fakeBrowser({
		discover: async () => [TAB],
		open: async () => {
			throw fail("internal", "a tab already showing the url must not be opened");
		},
		attach: async () => bind(client, TAB),
		close: async (id) => {
			closed.push(id);
		},
	});

	await assert.rejects(
		withPage(
			TAB.url,
			{},
			async () => {
				throw fail("no-post", "no post at index 0");
			},
			browser,
		),
		(error: unknown) => isFailure(error) && error.code === "no-post",
	);

	assert.deepEqual(closed, [], "a tab the person already had open was closed");
});

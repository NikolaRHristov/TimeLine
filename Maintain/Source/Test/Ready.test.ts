import assert from "node:assert/strict";
import { test } from "node:test";

import { assertReady } from "../Browser/Session/Ready.ts";
import { isFailure } from "../Cli/Parser/Output/Failure.ts";

const EXPRESSION = 'document.querySelectorAll("article").length > 0';
const URL_ = "https://x.com/example";

/** Whatever a piece of code writes to stderr, and whatever it returns. */
function capture<T>(work: () => T): { value: T; text: string } {
	const original = process.stderr.write.bind(process.stderr);
	let text = "";
	process.stderr.write = ((chunk: unknown) => {
		text += String(chunk);
		return true;
	}) as typeof process.stderr.write;
	try {
		const value = work();
		return { value, text };
	} finally {
		process.stderr.write = original;
	}
}

test("a page that became ready is handed over silently", () => {
	const { text } = capture(() =>
		assertReady(true, {
			expression: EXPRESSION,
			timeout: 15_000,
			url: URL_,
		}),
	);

	assert.equal(text, "");
});

test("a page that never became ready fails as page-not-ready, naming what was waited for", () => {
	let thrown: unknown = null;
	const { text } = capture(() => {
		try {
			assertReady(false, {
				expression: EXPRESSION,
				timeout: 15_000,
				url: URL_,
			});
		} catch (error) {
			thrown = error;
		}
	});

	assert.equal(text, "");
	assert.equal(isFailure(thrown), true);
	if (!isFailure(thrown)) return;
	assert.equal(thrown.code, "page-not-ready");
	// The three facts a caller needs to tell "the page never arrived" apart
	// from "the selector is wrong": what was polled, for how long, and where.
	assert.deepEqual(thrown.toObject(), {
		error: "page-not-ready",
		detail: `the page never became ready within 15000 ms: ${EXPRESSION}`,
		expression: EXPRESSION,
		timeout: 15_000,
		url: URL_,
	});
});

test("a scrape warns instead of failing, so the posts that did render are read", () => {
	const { value, text } = capture(() =>
		assertReady(false, {
			expression: EXPRESSION,
			timeout: 25_000,
			url: URL_,
			mode: "warn",
		}),
	);

	assert.equal(value, undefined);
	assert.match(
		text,
		/^maintain: the page never became ready within 25000 ms: /,
	);
	assert.match(text, /article/);
	assert.match(text, /https:\/\/x\.com\/example/);
	assert.match(text, /continuing\n$/);
});

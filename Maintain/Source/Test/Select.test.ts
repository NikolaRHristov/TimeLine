import assert from "node:assert/strict";
import { test } from "node:test";
import type { Tab } from "../Model/Tab/Tab.ts";
import { Tab as TabModel } from "../Model/Tab/Tab.ts";
import { isFailure } from "../Cli/Parser/Output/Failure.ts";
import { select, selectHandle } from "../Browser/Target/Select.ts";

const tab = (id: string, url: string, title: string, attached = false, active = false): Tab => ({
	id,
	title,
	url,
	active,
	attached,
});

const tabs: Tab[] = [
	tab("AAA", "https://x.com/home", "Home / X", false, true),
	tab("BBB", "https://x.com/i/lists/1", "AI / X"),
	tab("CCC", "https://x.com/i/lists/2", "UI / X", true),
	tab("DDD", "http://127.0.0.1:9119/kanban?profile=default", "Dashboard"),
];

const codeOf = (run: () => unknown): string => {
	try {
		run();
	} catch (error) {
		if (isFailure(error)) return error.code;
		throw error;
	}
	return "none";
};

test("an exact id wins", () => {
	assert.equal(select(tabs, { id: "BBB" }).id, "BBB");
});

test("a url matches exactly first, then by prefix", () => {
	assert.equal(select(tabs, { url: "https://x.com/i/lists/1" }).id, "BBB");
	assert.equal(select(tabs, { url: "https://x.com/home" }).id, "AAA");
	assert.equal(select(tabs, { url: "http://127.0.0.1:9119" }).id, "DDD");
});

test("query strings and trailing slashes do not defeat a match", () => {
	assert.equal(select(tabs, { url: "https://x.com/home/" }).id, "AAA");
	assert.equal(select(tabs, { url: "http://127.0.0.1:9119/kanban?profile=default" }).id, "DDD");
});

test("an ambiguous url prefix is an error, not a coin flip", () => {
	const twins = [...tabs, tab("FFF", "https://x.com/i/lists/1/members", "AI members / X")];
	assert.equal(codeOf(() => select(twins, { url: "https://x.com/i/lists" })), "no-tab");
	assert.equal(select(twins, { url: "https://x.com/i/lists/1" }).id, "BBB");
	assert.equal(select(twins, { url: "https://x.com/i/lists/1" }, { exact: true }).id, "BBB");
});

test("exact mode refuses a prefix match", () => {
	assert.equal(codeOf(() => select(tabs, { url: "https://x.com/i" }, { exact: true })), "no-tab");
});

test("a tab an extension holds is skipped, and the next candidate wins", () => {
	const duplicated = [...tabs, tab("EEE", "https://x.com/i/lists/1", "AI / X", true)];
	const chosen = select(duplicated, { url: "https://x.com/i/lists/1" });
	assert.equal(chosen.attached, false);
});

test("an attached tab asked for by id is refused by name", () => {
	try {
		select(tabs, { id: "CCC" });
		assert.fail("expected a failure");
	} catch (error) {
		assert.ok(isFailure(error));
		assert.equal(error.code, "no-tab");
		assert.match(error.detail ?? "", /attached/);
	}
});

test("a title substring is the last resort", () => {
	assert.equal(select(tabs, { title: "dashboard" }).id, "DDD");
});

test("nothing matching reports every tab it saw", () => {
	try {
		select(tabs, { url: "https://example.com" });
		assert.fail("expected a failure");
	} catch (error) {
		assert.ok(isFailure(error));
		assert.equal(error.code, "no-tab");
		const candidates = error.extra["candidates"] as unknown[];
		assert.equal(candidates.length, tabs.length);
	}
});

test("--tab takes an id or a zero-based index", () => {
	assert.equal(selectHandle(tabs, "BBB").id, "BBB");
	assert.equal(selectHandle(tabs, "0").id, "AAA");
	assert.equal(codeOf(() => selectHandle(tabs, "99")), "no-tab");
});

test("discovery keeps pages and drops extension pages", () => {
	assert.equal(TabModel.fromTarget({ id: "1", type: "page", url: "https://x.com/home" })?.id, "1");
	assert.equal(
		TabModel.fromTarget({ id: "2", type: "page", url: "chrome-extension://abc/sidepanel.html" }),
		null,
	);
	assert.equal(TabModel.fromTarget({ id: "3", type: "service_worker", url: "https://x.com/sw.js" }), null);
	assert.equal(TabModel.fromTarget({ type: "page", url: "https://x.com/home" }), null);
});

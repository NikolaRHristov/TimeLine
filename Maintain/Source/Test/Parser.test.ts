import assert from "node:assert/strict";
import { test } from "node:test";
import { flag } from "../Cli/Parser/Argument/Flag.ts";
import { option } from "../Cli/Parser/Argument/Option.ts";
import { isFailure } from "../Cli/Parser/Output/Failure.ts";
import { parse, type CommandDefinition } from "../Cli/Parser/Parser.ts";
import { schema } from "../Cli/Schema/Schema.ts";
import { Definition as PostLike } from "../Command/Post/Like/Like.ts";

const commands: CommandDefinition[] = [
	{
		path: ["tab", "list"],
		summary: "list",
		options: [],
		async run() {
			return {};
		},
	},
	{
		path: ["post", "like"],
		summary: "like",
		options: [
			option("url", "string", "permalink", { format: "uri" }),
			option("tab", "string", "target id"),
			option("index", "integer", "article index", { default: 0 }),
			flag("dry-run", "resolve only"),
		],
		alternatives: [["url"], ["tab", "index"]],
		async run() {
			return {};
		},
	},
	{
		path: ["post", "like", "remove"],
		summary: "remove",
		options: [
			option("url", "string", "permalink", { required: true }),
			option("payload", "json", "json"),
		],
		async run() {
			return {};
		},
	},
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

test("a command path and its options are split at the first flag", () => {
	const parsed = parse(
		["post", "like", "--url", "https://x.com/a/status/1", "--dry-run"],
		commands,
	);
	assert.equal(parsed.command?.path.join(" "), "post like");
	assert.equal(parsed.values["url"], "https://x.com/a/status/1");
	assert.equal(parsed.values["dry-run"], true);
	assert.equal(parsed.json, false);
});

test("the longest path wins, so `post like remove` is not `post like`", () => {
	const parsed = parse(["post", "like", "remove", "--url", "u"], commands);
	assert.equal(parsed.command?.path.join(" "), "post like remove");
});

test("--schema and --json are parsed as flags, not values", () => {
	const parsed = parse(["post", "like", "--schema"], commands);
	assert.equal(parsed.schema, true);
	assert.equal(parsed.values["schema"], undefined);
});

test("defaults apply when an option is absent", () => {
	const parsed = parse(["post", "like", "--tab", "ABC"], commands);
	assert.equal(parsed.values["index"], 0);
});

test("--name=value and --name value are the same", () => {
	const inline = parse(["post", "like", "--url=https://x.com/a/status/2"], commands);
	const spaced = parse(["post", "like", "--url", "https://x.com/a/status/2"], commands);
	assert.equal(inline.values["url"], spaced.values["url"]);
});

test("a JSON option keeps its equals signs", () => {
	const parsed = parse(
		["post", "like", "remove", "--url", "u", "--payload", '{"q":"a=b"}'],
		commands,
	);
	assert.deepEqual(parsed.values["payload"], { q: "a=b" });
});

test("an unknown option is a usage failure, not a crash", () => {
	assert.equal(
		codeOf(() => parse(["post", "like", "--nope", "1"], commands)),
		"usage",
	);
});

test("a value option without a value is a usage failure", () => {
	assert.equal(
		codeOf(() => parse(["post", "like", "--url"], commands)),
		"usage",
	);
});

test("an unknown command is a usage failure", () => {
	assert.equal(
		codeOf(() => parse(["post", "nope"], commands)),
		"usage",
	);
});

test("a required option is enforced", () => {
	assert.equal(
		codeOf(() => parse(["post", "like", "remove"], commands)),
		"usage",
	);
});

test("the real `post like` schema is draft 2020-12 and names its flags", () => {
	const document = schema(PostLike) as Record<string, unknown>;
	assert.equal(document["$schema"], "https://json-schema.org/draft/2020-12/schema");
	const properties = document["properties"] as Record<string, unknown>;
	for (const name of ["--url", "--tab", "--index", "--dry-run"]) {
		assert.ok(name in properties, `missing ${name}`);
	}
	assert.equal((properties["--dry-run"] as Record<string, unknown>)["type"], "boolean");
	assert.equal((properties["--index"] as Record<string, unknown>)["type"], "integer");
	assert.deepEqual(document["anyOf"], [
		{ required: ["--url"] },
		{ required: ["--tab", "--index"] },
	]);
});

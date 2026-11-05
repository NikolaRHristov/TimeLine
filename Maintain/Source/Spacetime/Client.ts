import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fail } from "../CLI/Parser/Output/Failure.ts";

/**
 * A thin HTTP client for one SpacetimeDB database.
 *
 * The CLI's own transport is the contract here: `POST
 * <url>/v1/database/<id>/call/<reducer>` with a bearer token and a JSON *array*
 * of positional arguments, answering `200` with an empty body. Nothing is
 * inferred from that body, because a reducer cannot return one.
 *
 * Two facts about this surface are easy to get wrong and are therefore handled
 * here rather than at every call site:
 *
 * 1. Reducer names in the URL are snake_case. The module exports `setVisibility`
 *    and the endpoint is `set_visibility`; `observe` happens to be both, which
 *    is why it looks like case is preserved.
 * 2. A database may be addressed by its name or by its identity. The name is
 *    what a person configures; the identity is what survives a rename, so every
 *    call resolves it once and then uses it.
 */

/** Where a local server listens; the same address the reference documents. */
export const DEFAULT_URL = "http://127.0.0.1:3010";

/** The database name `spacetime publish` creates in this project. */
export const DEFAULT_DATABASE = "timeline";

/**
 * The CLI writes its token here. This is the only place the token is read: it
 * is never taken from argv, never printed, and the file it comes from is named
 * once - a command that echoes its arguments would otherwise leak it.
 *
 * The file lives outside this repository, so there is no relative form to try
 * first: the variable wins, then the absolute default the CLI itself writes.
 */
const CLI_CONFIGURATION =
	process.env["SPACETIMEDB_CLI_CONFIG"] ?? join(homedir(), ".config", "spacetime", "cli.toml");

/** Long enough for a slow local insert, short enough that a dead port fails fast. */
const CALL_TIMEOUT = 15_000;
const LOOKUP_TIMEOUT = 5_000;

export type Client = {
	url: string;
	database: string;
	/** The database's identity, resolved once per client. */
	identity(): Promise<string>;
	/** Call one reducer with its positional arguments; resolves when it ran. */
	call(reducer: string, args: readonly unknown[]): Promise<void>;
	/** Run one SQL statement and return its rows as objects. */
	sql(query: string): Promise<Row[]>;
};

/** One row, keyed by the column name the module declared in camelCase. */
export type Row = Record<string, unknown>;

function reason(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * The bearer token from the CLI's configuration file.
 *
 * A missing file and a file without the key are the same failure - the request
 * cannot be authenticated - so both report `spacetime-auth` with the path,
 * which is a fixed location rather than a secret.
 */
export function token(): string {
	let raw: string;
	try {
		raw = readFileSync(CLI_CONFIGURATION, "utf8");
	} catch (error) {
		throw fail(
			"spacetime-auth",
			"the SpacetimeDB CLI token is unreadable; run `spacetime login`",
			{
				expected: CLI_CONFIGURATION,
				reason: reason(error),
			},
		);
	}

	const match = /^\s*spacetimedb_token\s*=\s*"([^"]+)"/m.exec(raw);
	const value = match?.[1];
	if (value === undefined || value.length === 0) {
		throw fail(
			"spacetime-auth",
			"the SpacetimeDB CLI token is missing; run `spacetime login`",
			{
				expected: CLI_CONFIGURATION,
			},
		);
	}
	return value;
}

function base(url: string): string {
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** One request, with every transport failure collapsed into one error code. */
async function request(url: string, init: RequestInit, timeout: number): Promise<Response> {
	try {
		return await fetch(url, {
			...init,
			signal: AbortSignal.timeout(timeout),
		});
	} catch (error) {
		// Connection refused, DNS failure, timeout: all mean the same thing to a
		// caller - the server is not answering - and none of them is a crash.
		throw fail("spacetime-unreachable", "the SpacetimeDB server did not answer", {
			url,
			reason: reason(error),
		});
	}
}

/** A response that is not `ok` becomes the matching error code. */
async function checked(response: Response, url: string, what: string): Promise<Response> {
	if (response.ok) return response;

	const body = (await response.text().catch(() => "")).trim().slice(0, 500);

	if (response.status === 401 || response.status === 403) {
		throw fail("spacetime-auth", "the server rejected the token", {
			url,
			status: response.status,
			what,
		});
	}

	throw fail("spacetime-reducer", `the server refused ${what}`, {
		url,
		status: response.status,
		// The server's own words are the only useful detail here: "No such
		// procedure" means the reducer name or the published module is wrong.
		body: body === "" ? undefined : body,
	});
}

/**
 * The identity of a database, addressed by name or by identity.
 *
 * The server answers `GET /v1/database/<name-or-identity>` with its metadata;
 * the identity there carries a `0x` prefix that `spacetime list` does not
 * print, so it is stripped and both spellings read the same.
 */
export async function databaseIdentity(url: string, database: string): Promise<string> {
	const endpoint = `${base(url)}/v1/database/${encodeURIComponent(database)}`;
	const response = await request(
		endpoint,
		{ headers: { authorization: `Bearer ${token()}` } },
		LOOKUP_TIMEOUT,
	);
	await checked(response, endpoint, `database ${JSON.stringify(database)}`);

	let body: unknown;
	try {
		body = await response.json();
	} catch (error) {
		throw fail("spacetime-reducer", "the database metadata is not JSON", {
			url: endpoint,
			reason: reason(error),
		});
	}

	const identity = (body as { database_identity?: { __identity__?: unknown } } | null)
		?.database_identity?.__identity__;
	if (typeof identity !== "string" || identity.length === 0) {
		throw fail("spacetime-reducer", "the database metadata carries no identity", {
			url: endpoint,
		});
	}
	return identity.replace(/^0x/, "");
}

/**
 * The column name the module declared, from the name SQL reports.
 *
 * SpacetimeDB publishes a camelCase column as snake_case, so `postedAt` comes
 * back as `posted_at`. Mapping it back here keeps every caller reading the
 * field names the declaration uses, instead of a second spelling of the schema.
 */
function camel(name: string): string {
	return name.replace(/_([a-z0-9])/g, (_whole, letter: string) => letter.toUpperCase());
}

/**
 * One cell, decoded.
 *
 * An optional column is a tagged pair on the wire - `[0, value]` for present,
 * `[1, []]` for absent - which is the only place a JSON array appears in a
 * result. Decoding it here means a caller never has to know the encoding, and
 * `null` is the honest answer for "the module holds no value".
 */
function cell(value: unknown): unknown {
	if (!Array.isArray(value) || value.length !== 2) return value;
	// Tag 0 is `some`, tag 1 is `none`. Reading them the other way round turns
	// every timestamp into null without an error anywhere - which is exactly the
	// kind of silent loss this layer exists to prevent.
	if (value[0] === 1) return null;
	return value[0] === 0 ? value[1] : value;
}

/** The rows of one SQL statement, keyed by column name. */
function rowsOf(body: unknown, url: string): Row[] {
	if (!Array.isArray(body) || body.length === 0) return [];

	const statement = body[0] as
		{ schema?: { elements?: { name?: { some?: string } }[] }; rows?: unknown[][] } | undefined;
	const elements = statement?.schema?.elements ?? [];
	const names = elements.map((element) => camel(element.name?.some ?? ""));

	const rows: Row[] = [];
	for (const values of statement?.rows ?? []) {
		const row: Row = {};
		values.forEach((value, index) => {
			const name = names[index];
			if (name !== undefined && name !== "") row[name] = cell(value);
		});
		rows.push(row);
	}

	if (rows.length === 0 && (statement?.rows ?? []).length > 0) {
		throw fail("spacetime-reducer", "the SQL result has no readable columns", { url });
	}
	return rows;
}

/** A client bound to one server and one database. */
export function open(url: string, database: string): Client {
	let resolved: Promise<string> | null = null;

	const client: Client = {
		url: base(url),
		database,

		identity(): Promise<string> {
			// One lookup per run, even when the caller asks twice: a push must not
			// pay for the same metadata request per post.
			resolved ??= databaseIdentity(client.url, database);
			return resolved;
		},

		async call(reducer: string, args: readonly unknown[]): Promise<void> {
			const identity = await client.identity();
			const endpoint = `${client.url}/v1/database/${identity}/call/${reducer}`;
			const response = await request(
				endpoint,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${token()}`,
						"content-type": "application/json",
					},
					body: JSON.stringify(args),
				},
				CALL_TIMEOUT,
			);
			await checked(response, endpoint, `reducer ${JSON.stringify(reducer)}`);
		},

		async sql(query: string): Promise<Row[]> {
			const identity = await client.identity();
			const endpoint = `${client.url}/v1/database/${identity}/sql`;
			const response = await request(
				endpoint,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${token()}`,
						// The endpoint takes the statement as the body, not as JSON.
						"content-type": "text/plain",
					},
					body: query,
				},
				LOOKUP_TIMEOUT * 2,
			);
			await checked(response, endpoint, `query ${JSON.stringify(query)}`);

			let body: unknown;
			try {
				body = await response.json();
			} catch (error) {
				throw fail("spacetime-reducer", "the query result is not JSON", {
					url: endpoint,
					reason: reason(error),
				});
			}
			return rowsOf(body, endpoint);
		},
	};

	return client;
}

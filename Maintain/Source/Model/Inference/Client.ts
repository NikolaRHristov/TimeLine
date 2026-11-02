import { fail } from "../../Cli/Parser/Output/Failure.ts";

/**
 * One completion request: a standing instruction and the work for this call.
 *
 * Two strings rather than a message array, because that is the whole contract
 * this pass needs. The system half is fixed for every batch, so only the user
 * half grows with the batch - which is also why a prompt is built per batch and
 * never per author: one request carries up to `BATCH_LIMIT` authors.
 */
export type Completion = { system: string; user: string };

/**
 * What a model pass is: text in, text out.
 *
 * The type exists so the classifier can be handed a stub in a test without a
 * socket, and so no command ever depends on one vendor's SDK. Text out is
 * deliberately the whole result: parsing and validating the reply belongs to
 * the caller that knows the shape it asked for.
 */
export type Complete = (request: Completion) => Promise<string>;

/** The endpoint, as an OpenAI-compatible chat-completions URL. */
export const URL_ENV = "MAINTAIN_MODEL_URL";

/** A bearer token, when the endpoint wants one. */
export const KEY_ENV = "MAINTAIN_MODEL_KEY";

/** The model id to ask for. Omitted from the request when unset. */
export const MODEL_ENV = "MAINTAIN_MODEL";

/** Seconds before one request is abandoned, in the same spirit as `curl -m`. */
export const TIMEOUT_ENV = "MAINTAIN_MODEL_TIMEOUT";

/**
 * A generous default: a batch of 25 authors is a long reply, and a local
 * endpoint that is merely slow must not look like a broken one.
 */
export const DEFAULT_TIMEOUT = 120;

/** How much of an unreadable body a failure carries: enough to diagnose, not to flood. */
const BODY_LIMIT = 400;

function record(value: unknown): Record<string, unknown> | null {
	if (value === null || typeof value !== "object" || Array.isArray(value))
		return null;
	return value as Record<string, unknown>;
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * The text of one OpenAI-compatible reply, or null when it carries none.
 *
 * `choices[0].message.content` is the shape every compatible server speaks;
 * `choices[0].text` is the completion shape older servers still emit. Anything
 * else is a reply this pass cannot read, which is a named failure rather than
 * an empty string - an empty answer silently treated as "no decisions" would
 * look exactly like a model that declined everything.
 */
function content(payload: unknown): string | null {
	const body = record(payload);
	const choices = body?.["choices"];
	if (!Array.isArray(choices) || choices.length === 0) return null;

	const first = record(choices[0]);
	if (first === null) return null;

	const fromMessage = record(first["message"])?.["content"];
	if (typeof fromMessage === "string") return fromMessage;

	const fromChoice = first["text"];
	return typeof fromChoice === "string" ? fromChoice : null;
}

/** `MAINTAIN_MODEL_TIMEOUT`, in seconds; a bad value degrades to the default. */
function timeout(): number {
	const configured = process.env[TIMEOUT_ENV];
	if (configured === undefined || !/^\d+$/.test(configured.trim()))
		return DEFAULT_TIMEOUT;
	const seconds = Number(configured.trim());
	return seconds > 0 ? seconds : DEFAULT_TIMEOUT;
}

/**
 * The model endpoint, as a function.
 *
 * Configuration is environment only, and deliberately so: an endpoint URL is a
 * machine fact, not a repository fact. The command that calls this is the one
 * that spends money, so the address it spends it at must be visible in the
 * shell that ran it.
 *
 * `temperature: 0` is the one request parameter set on the caller's behalf.
 * Two runs over one archive should differ because the archive changed, not
 * because the sampler did - and a cache that varies per run would make every
 * decision unreproducible.
 *
 * Every failure is a named `Failure`, never a raw `TypeError`:
 *
 * - `no-model` - nothing is configured, so nothing was asked.
 * - `model-error` - the endpoint could not be reached, timed out, or refused.
 * - `model-reply` - the endpoint answered, and the answer is not a reply.
 */
export function open(): Complete {
	const url = (process.env[URL_ENV] ?? "").trim();
	if (url === "") {
		throw fail("no-model", "no model endpoint is configured", {
			expected: URL_ENV,
			next: `export ${URL_ENV}=http://127.0.0.1:8642/v1/chat/completions`,
		});
	}

	const key = (process.env[KEY_ENV] ?? "").trim();
	const model = (process.env[MODEL_ENV] ?? "").trim();
	const seconds = timeout();

	return async (request: Completion): Promise<string> => {
		const body: Record<string, unknown> = {
			messages: [
				{ role: "system", content: request.system },
				{ role: "user", content: request.user },
			],
			temperature: 0,
			stream: false,
		};
		if (model !== "") body["model"] = model;

		const headers: Record<string, string> = {
			"content-type": "application/json",
		};
		if (key !== "") headers["authorization"] = `Bearer ${key}`;

		let response: Response;
		try {
			response = await fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(seconds * 1000),
			});
		} catch (error) {
			throw fail(
				"model-error",
				"the model endpoint could not be reached",
				{
					url,
					timeout: seconds,
					reason: message(error),
				},
			);
		}

		let raw: string;
		try {
			raw = await response.text();
		} catch (error) {
			throw fail("model-error", "the model endpoint dropped the reply", {
				url,
				status: response.status,
				reason: message(error),
			});
		}

		if (!response.ok) {
			throw fail(
				"model-error",
				"the model endpoint refused the request",
				{
					url,
					status: response.status,
					body: raw.slice(0, BODY_LIMIT),
				},
			);
		}

		let payload: unknown;
		try {
			payload = JSON.parse(raw);
		} catch {
			throw fail("model-reply", "the endpoint did not answer with JSON", {
				url,
				body: raw.slice(0, BODY_LIMIT),
			});
		}

		const text = content(payload);
		if (text === null) {
			throw fail("model-reply", "the reply carries no message content", {
				url,
				body: raw.slice(0, BODY_LIMIT),
			});
		}

		return text;
	};
}

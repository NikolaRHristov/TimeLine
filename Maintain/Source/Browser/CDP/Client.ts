import { fail } from "../../CLI/Parser/Output/Failure.ts";

export type CDPError = { code: number; message: string; data?: string };

type Pending = {
	method: string;
	resolve(value: unknown): void;
	reject(error: unknown): void;
	timer: ReturnType<typeof setTimeout>;
};

export type CDPClient = {
	/** Send one protocol command; resolves with its `result`. */
	send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
	/** Subscribe to a protocol event by method name. */
	on(method: string, handler: (params: unknown) => void): void;
	/** True once the socket is gone; further sends fail fast. */
	closed(): boolean;
	close(): void;
};

export type ConnectOptions = { timeout?: number };

/**
 * Connect to one target's DevTools websocket.
 *
 * Node 22 ships `WebSocket`, so a CDP client needs no dependency. Every
 * pending call is rejected when the socket closes, so a dead tab surfaces as
 * `cdp-unreachable` instead of a hung promise.
 */
export async function connect(
	webSocketDebuggerUrl: string,
	options: ConnectOptions = {},
): Promise<CDPClient> {
	const timeout = options.timeout ?? 15_000;
	const socket = await new Promise<WebSocket>((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(
				fail("cdp-unreachable", "opening the target websocket timed out", {
					url: webSocketDebuggerUrl,
				}),
			);
		}, timeout);
		let socket: WebSocket;
		try {
			socket = new WebSocket(webSocketDebuggerUrl);
		} catch (error) {
			clearTimeout(timer);
			reject(
				fail("cdp-unreachable", "could not open the target websocket", {
					url: webSocketDebuggerUrl,
					reason: error instanceof Error ? error.message : String(error),
				}),
			);
			return;
		}
		socket.addEventListener("open", () => {
			clearTimeout(timer);
			resolve(socket);
		});
		socket.addEventListener("error", () => {
			clearTimeout(timer);
			reject(
				fail("cdp-unreachable", "the target websocket refused the connection", {
					url: webSocketDebuggerUrl,
				}),
			);
		});
	});

	let sequence = 0;
	let gone = false;
	const pending = new Map<number, Pending>();
	const listeners = new Map<string, Set<(params: unknown) => void>>();

	const settle = (error: unknown): void => {
		gone = true;
		for (const [, entry] of pending) {
			clearTimeout(entry.timer);
			entry.reject(error);
		}
		pending.clear();
	};

	socket.addEventListener("message", (event: MessageEvent) => {
		let message: {
			id?: number;
			method?: string;
			params?: unknown;
			result?: unknown;
			error?: CDPError;
		};
		try {
			message = JSON.parse(String(event.data));
		} catch {
			return;
		}

		if (typeof message.id === "number") {
			const entry = pending.get(message.id);
			if (entry === undefined) return;
			pending.delete(message.id);
			clearTimeout(entry.timer);
			if (message.error !== undefined) {
				entry.reject(
					fail("cdp-error", `${entry.method}: ${message.error.message}`, {
						method: entry.method,
						code: message.error.code,
					}),
				);
				return;
			}
			entry.resolve(message.result);
			return;
		}

		if (typeof message.method === "string") {
			for (const handler of listeners.get(message.method) ?? []) handler(message.params);
		}
	});

	socket.addEventListener("close", () => {
		settle(fail("cdp-unreachable", "the target websocket closed"));
	});
	socket.addEventListener("error", () => {
		settle(fail("cdp-unreachable", "the target websocket failed"));
	});

	return {
		send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
			if (gone) {
				return Promise.reject(
					fail("cdp-unreachable", "the target websocket is closed", {
						method,
					}),
				);
			}
			const id = (sequence += 1);
			return new Promise<T>((resolve, reject) => {
				const timer = setTimeout(() => {
					pending.delete(id);
					reject(
						fail("cdp-error", `${method} timed out`, {
							method,
							timeout,
						}),
					);
				}, timeout);
				pending.set(id, {
					method,
					resolve: resolve as (value: unknown) => void,
					reject,
					timer,
				});
				try {
					socket.send(JSON.stringify({ id, method, params }));
				} catch (error) {
					clearTimeout(timer);
					pending.delete(id);
					reject(
						fail("cdp-unreachable", "could not send on the target websocket", {
							method,
							reason: error instanceof Error ? error.message : String(error),
						}),
					);
				}
			});
		},

		on(method: string, handler: (params: unknown) => void): void {
			const set = listeners.get(method) ?? new Set();
			set.add(handler);
			listeners.set(method, set);
		},

		closed(): boolean {
			return gone;
		},

		close(): void {
			gone = true;
			for (const [, entry] of pending) {
				clearTimeout(entry.timer);
				entry.reject(
					fail("cdp-unreachable", "the session was closed", {
						method: entry.method,
					}),
				);
			}
			pending.clear();
			try {
				socket.close();
			} catch {
				// Already closed - nothing to do.
			}
		},
	};
}

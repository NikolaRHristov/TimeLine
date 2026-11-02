import type { FirebaseConfiguration } from "../Firebase.ts";
import { select, type VoteTransport } from "./Transport.ts";

/**
 * The vote control, when the page has one.
 *
 * Everything here is optional by construction: no embedded configuration means
 * no transport, which means no listener is attached and no request is made.
 * The page renders identically either way - the counts on file and the rows -
 * and the only difference is whether a `Vote` button exists.
 *
 * One vote per entry per device, with no accounts and no identifier leaving the
 * browser: a random device id is generated once and kept in `localStorage`, and
 * the entries this device voted on are remembered beside it. Clearing site data
 * lets a determined person vote again - which is exactly the limit the docs
 * state, and exactly why the vote only ranks and never publishes.
 */

/** The element the page embeds its public configuration in. */
const CONFIGURATION = "Vote-Configuration";

/** One random id per browser, created once, never transmitted. */
const DEVICE = "maintain.vote.device";

/** The entries this device voted on, namespaced by the device id. */
const CASTS = "maintain.vote.cast";

function random(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
		return crypto.randomUUID();
	// An insecure origin has no `randomUUID`. A weak id is still better than
	// no memory of what was voted on, and it never leaves the device.
	return Math.random().toString(36).slice(2);
}

function readConfiguration(): FirebaseConfiguration | null {
	const element = document.getElementById(CONFIGURATION);
	if (element === null) return null;
	try {
		const parsed: unknown = JSON.parse(element.textContent ?? "");
		if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
		return parsed as FirebaseConfiguration;
	} catch {
		return null;
	}
}

/** `localStorage` throws when a browser blocks storage; that is not fatal. */
function storage(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function device(store: Storage | null): string {
	if (store === null) return "";
	try {
		const existing = store.getItem(DEVICE);
		if (existing !== null && existing !== "") return existing;
		const created = random();
		store.setItem(DEVICE, created);
		return created;
	} catch {
		return "";
	}
}

function key(deviceId: string): string {
	return deviceId === "" ? CASTS : `${CASTS}.${deviceId}`;
}

function remembered(store: Storage | null, name: string): Set<string> {
	if (store === null) return new Set();
	try {
		const parsed: unknown = JSON.parse(store.getItem(name) ?? "[]");
		return new Set(
			Array.isArray(parsed)
				? parsed.filter((entry): entry is string => typeof entry === "string")
				: [],
		);
	} catch {
		return new Set();
	}
}

function remember(store: Storage | null, name: string, id: string): void {
	if (store === null) return;
	try {
		const entries = remembered(store, name);
		entries.add(id);
		store.setItem(name, JSON.stringify([...entries]));
	} catch {
		// A full or blocked store costs this device its memory of the vote, not
		// the vote itself: the count already moved on the server.
	}
}

function wire(transport: VoteTransport): void {
	const root = document.querySelector<HTMLElement>("[data-vote]");
	if (root === null) return;

	const status = root.querySelector<HTMLElement>("[data-vote-status]");
	const say = (message: string | null): void => {
		if (status === null) return;
		status.textContent = message ?? "";
		status.hidden = message === null;
	};

	const store = storage();
	const name = key(device(store));
	const cast = remembered(store, name);

	const buttons = root.querySelectorAll<HTMLButtonElement>("button[data-vote-id]");
	for (const button of buttons) {
		const id = button.dataset["voteId"] ?? "";
		if (id === "") continue;

		const row = button.closest("[data-vote-row]");
		const total = row?.querySelector<HTMLElement>("[data-vote-total]") ?? null;

		const voted = (): void => {
			button.disabled = true;
			button.textContent = "Voted";
		};

		if (cast.has(id)) voted();

		// The page rendered the count on file; this replaces it with the live
		// one when the database answers. A failure leaves the file's number in
		// place, which is why the page never shows an empty count.
		transport
			.count(id)
			.then((value) => {
				if (total !== null) total.textContent = String(value);
			})
			.catch(() => undefined);

		button.addEventListener("click", () => {
			if (button.disabled) return;
			button.disabled = true;
			say(null);

			transport
				.cast(id)
				.then((value) => {
					if (total !== null) total.textContent = String(value);
					remember(store, name, id);
					voted();
				})
				.catch((error: unknown) => {
					button.disabled = false;
					console.warn("vote: the vote did not go through", error);
					say("That vote did not go through. The counts shown are the ones on file.");
				});
		});
	}
}

const configuration = readConfiguration();
if (configuration !== null) {
	const transport = select(configuration);
	if (transport.mutable) wire(transport);
}

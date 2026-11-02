import type { FirebaseApp } from "firebase/app";

/**
 * The Firebase app, when this build has a project to talk to.
 *
 * Two rules, and they are the whole file:
 *
 * 1. **No configuration, no app.** The previous version called
 *    `initializeApp({ apiKey: "", appId: "", … })` on every page, which is a
 *    stub that looks wired and fails the moment anything touches it. This one
 *    returns `null` instead, so a fresh clone builds and renders with voting
 *    simply absent.
 * 2. **No side effects on import.** The SDK is loaded inside `open()`, so a
 *    page that never asks for an app never downloads `firebase/app`.
 *
 * The configuration is public by design - a Firebase web `apiKey` identifies a
 * project, it does not authorise a write; the database rules do that - but it
 * is still never committed. `Source/Script/Vote/Configuration.ts` reads it from
 * the environment or from a gitignored local file at build time.
 */
export type FirebaseConfiguration = {
	apiKey: string;
	appId: string;
	authDomain: string;
	databaseURL: string;
	measurementId: string;
	messagingSenderId: string;
	projectId: string;
	storageBucket: string;
};

/**
 * The three fields a Realtime Database client cannot work without.
 *
 * `appId`, `authDomain` and the rest describe other Firebase products; a build
 * that demanded all eight would refuse a perfectly working database because
 * somebody left `measurementId` empty.
 */
export function complete(
	value: Partial<FirebaseConfiguration> | null,
): value is FirebaseConfiguration {
	return (
		value !== null &&
		typeof value.apiKey === "string" &&
		value.apiKey !== "" &&
		typeof value.projectId === "string" &&
		value.projectId !== "" &&
		typeof value.databaseURL === "string" &&
		value.databaseURL !== ""
	);
}

/**
 * The app, or `null` when there is no project or the SDK refuses it.
 *
 * A failure here is a warning and a `null`, never an exception: a broken vote
 * configuration must degrade to the read-only page, not take the page down.
 * The caller has already rendered the counts it had on file by the time this
 * resolves.
 */
export async function open(
	configuration: Partial<FirebaseConfiguration> | null,
): Promise<FirebaseApp | null> {
	if (!complete(configuration)) return null;

	try {
		const { getApp, getApps, initializeApp } = await import("firebase/app");
		const existing = getApps()[0];
		return existing ?? initializeApp(configuration);
	} catch (error) {
		console.warn("vote: Firebase could not be initialised; voting is unavailable", error);
		return null;
	}
}

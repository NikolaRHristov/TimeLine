import { load } from "../../Configuration/Load/Load.ts";
import { open as openClient, type Client } from "../../Spacetime/Client.ts";
import { open, type DatabaseStore } from "./Database.ts";

/**
 * The database, opened from the identifier map.
 *
 * One place resolves the server's address and the database's name, so a command
 * that reads the archive does not repeat - and cannot drift from - how those
 * two are spelled. `--url` exists because a test or a one-off repair may point
 * at another server; nothing else about the connection is overridable.
 */
export function connect(url?: string): { client: Client; store: DatabaseStore } {
	const configuration = load();
	const target = url !== undefined && url !== "" ? url : configuration.spacetime.url;
	const client = openClient(target, configuration.spacetime.database);
	return { client, store: open(client) };
}

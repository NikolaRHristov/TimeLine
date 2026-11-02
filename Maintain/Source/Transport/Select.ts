import { option, type Option } from "../CLI/Parser/Argument/Option.ts";
import { fail } from "../CLI/Parser/Output/Failure.ts";
import type { CommandDefinition, Values } from "../CLI/Parser/Parser.ts";
import { cdp } from "./CDP/Transport.ts";
import type { Transport, TransportName } from "./Transport.ts";
import { view } from "./View/Transport.ts";

/** The transports a caller may name. Order is the order `--help` prints. */
export const NAMES: readonly TransportName[] = ["cdp", "view"];

/**
 * `--transport cdp|view`, on every command.
 *
 * Universal rather than per-command because a caller must be able to say
 * `--transport view` to anything and get a refusal it can read, instead of an
 * `unknown option`. The commands that do not use a transport ignore it.
 */
export const TRANSPORT_OPTION: Option = option(
	"transport",
	"enum",
	"Where the answer comes from: the live page (`cdp`) or the shadow archive (`view`).",
	{ values: NAMES, default: "cdp" },
);

/** The transport the values name; `cdp` when they name none. */
export function choose(values: Values): TransportName {
	const raw = values["transport"];
	if (raw === undefined) return "cdp";
	if (raw === "cdp" || raw === "view") return raw;
	// Unreachable through the parser, which rejects any other value; kept so a
	// programmatic caller gets the same named failure instead of a bad cast.
	throw fail("usage", `unknown transport: ${String(raw)}`, { values: NAMES });
}

/** Build the transport a name stands for. Construction opens no socket. */
export function open(name: TransportName): Transport {
	return name === "view" ? view() : cdp();
}

/**
 * Resolve the transport one command runs against.
 *
 * A command that declares no requirement gets a transport it never uses: the
 * value is inert, so `store status` behaves identically whatever `--transport`
 * says. A command that declares one is refused here - before its body runs, so
 * a read-only transport cannot be reached halfway through a write.
 */
export function resolve(command: CommandDefinition, values: Values): Transport {
	const name = choose(values);
	const transport = open(name);
	const requirement = command.transport;
	if (requirement === undefined) return transport;
	if (transport.supports(requirement)) return transport;

	const extra = { transport: name, command: command.path.join(" ") };
	if (requirement === "write") {
		throw fail("read-only-transport", undefined, extra);
	}
	throw fail("unsupported-transport", undefined, extra);
}

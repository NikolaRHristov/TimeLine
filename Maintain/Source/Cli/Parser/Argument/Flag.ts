import type { Option } from "./Option.ts";

/** A boolean flag: present means true, absent means false (or its default). */
export function flag(
	name: string,
	description: string,
	extra: Partial<Option> = {},
): Option {
	return { name, kind: "boolean", description, ...extra };
}

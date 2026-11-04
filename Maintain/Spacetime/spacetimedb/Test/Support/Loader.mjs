// Resolve hook for running this module's own sources under plain node.
//
// Two conventions need translating. The module bundler resolves relative
// imports without an extension (`./Schema`), which is what the entry file uses
// and what node's ESM resolver rejects; and `spacetime:sys@2.x` are host-provided
// virtual modules that no package map can point at.
export async function resolve(specifier, context, next) {
	if (specifier.startsWith("spacetime:sys@")) {
		return {
			url: new URL("./Syscalls.mjs", import.meta.url).href,
			shortCircuit: true,
		};
	}

	if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/i.test(specifier)) {
		try {
			return await next(`${specifier}.ts`, context);
		} catch {
			// Not a `.ts` file after all; fall through to the default resolution.
		}
	}

	return next(specifier, context);
}

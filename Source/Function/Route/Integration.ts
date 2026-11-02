/**
 * The dev-server half of the route map.
 *
 * A static host reads `Public/_redirects`, which `GenerateRedirects.ts` writes.
 * `astro dev` does not: it serves the pages it built from `Source/pages` and
 * answers everything else with a 404. Without this integration the alias
 * redirects exist only after a deploy, so a developer following a documented
 * lowercase link would see a 404 that no visitor ever sees - and the acceptance
 * check `curl -sI localhost:9999/bookmarks` would be untestable.
 *
 * So the same `Resolve` that decides what the generator emits decides what the
 * dev server answers. One function, two hosts, no second table to keep in sync.
 *
 * Production is untouched. The hook is `astro:server:setup`, which only runs
 * for `astro dev`; `astro build` never installs a middleware, and the static
 * output carries the `_redirects` file the host reads instead.
 */
import type { AstroIntegration } from "astro";
import { Resolve } from "./Map.ts";

/** The status a permanent alias redirect carries. */
const MovedPermanently = 301;

const Route = (): AstroIntegration => ({
	name: "Route",

	hooks: {
		"astro:server:setup": ({ server, logger }) => {
			server.middlewares.use((Request, Response, Next) => {
				const Raw = Request.url ?? "/";
				const Target = Resolve(Raw);

				// `null` means the path is already canonical, so Astro's own
				// routing answers it. Falling through rather than rewriting is
				// what keeps `/Bookmark/` and `/Bookmark` the same page.
				if (Target === null) {
					Next();

					return;
				}

				const Query = Raw.includes("?") ? `?${Raw.split("?")[1] ?? ""}` : "";
				const Location = `${Target}${Query}`;

				logger.info(`Route: ${Raw} -> ${Location} (${MovedPermanently})`);

				Response.writeHead(MovedPermanently, { Location });
				Response.end();
			});
		},
	},
});

export default Route;

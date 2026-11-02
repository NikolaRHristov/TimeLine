# Transports - CDP first, view second

Every command in `Maintain/` speaks through a **transport**. The browser transport (CDP) is the
primary and the only one allowed to change anything. The view transport is a read-only projection
over the shadow store: same command surface, same JSON shapes, no browser.

## Why two

The browser is the source of truth but it is also the fragile part: it can be closed, its debug port
can be taken, the person may have attached the tab to something else, or the machine may be asleep.
Reading the archive should not depend on any of that. Mutating the live site, on the other hand,
must never be simulated - a "like" that only touched a local file would be a lie.

## Where the pieces are

| Path                                 | What it is                                                       |
| ------------------------------------ | ---------------------------------------------------------------- |
| `Source/Transport/Transport.ts`      | The interface, the target union, the capability names            |
| `Source/Transport/Select.ts`         | `--transport cdp\|view`, and the refusal that lands before `run` |
| `Source/Transport/Cdp/Transport.ts`  | The browser transport: one delegation per member                 |
| `Source/Transport/Cdp/Post.ts`       | Resolving a `PostTarget`, reading it, flipping one control       |
| `Source/Transport/View/Transport.ts` | The archive transport: reads `Storage/Shadow`, refuses the rest  |
| `Source/Command/Context/Context.ts`  | `CommandContext`, and the one place a transport is resolved      |
| `Source/Browser/`                    | The CDP implementation detail: client, selectors, session        |

`Browser/` is not a second seam. It is what `Transport/Cdp` is made of, and no command may name it.

## Interface

```ts
export interface Transport {
	readonly name: "cdp" | "view";
	readonly source: "live" | "shadow";
	readonly mutable: boolean;
	supports(requirement: Requirement): boolean;

	tabs(): Promise<Tab[]>;
	focus(id: string): Promise<{ focused: boolean; id: string }>;
	navigate(url: string, tab?: string): Promise<{ url: string }>;
	evaluate<T>(expression: string, tab?: string): Promise<T>;
	page<T>(url: string, request: PageRequest, body: (page: PageHandle) => Promise<T>): Promise<T>;

	post(target: PostTarget): Promise<Post>;
	setLike(target: PostTarget, value: boolean, options?: WriteOptions): Promise<ControlOutcome>;
	setBookmark(
		target: PostTarget,
		value: boolean,
		options?: WriteOptions,
	): Promise<ControlOutcome>;
	listMember(
		slug: ListSlug,
		handle: string,
		options?: ListMemberOptions,
	): Promise<ListMemberResult>;
	scrape(url: string, options?: ScrapeOptions): Promise<ScrapeResult>;
}
```

Three shapes differ from the sketch this file used to carry, and each one exists because a command
would otherwise have had to reach past the seam:

- `post` and the two setters take a `PostTarget` (`{id}`, `{url}`, or `{tab,index}`) rather than a
  bare id. The CLI already addressed a post three ways, and collapsing them would have changed what
  `--tab`/`--index` does.
- `setLike`/`setBookmark` carry `{dryRun}` and answer `{was, now, post}`. A dry run is a read of the
  page's own control state, so it belongs where the control is.
- `focus`, `page` and `scrape` are command-shaped operations rather than primitives. `page` takes a
  readiness **name** (`articles`, `list`), not an expression: a selector string in a command would
  make a site rename a diff in every command instead of one file.

`Requirement` is declared on the command, not inferred from which method it calls:

| Requirement | Meaning                                        | `cdp` | `view`                  |
| ----------- | ---------------------------------------------- | ----- | ----------------------- |
| absent      | filesystem only; no transport is ever resolved | -     | -                       |
| `read`      | answers `post`                                 | yes   | yes                     |
| `write`     | changes the live site                          | yes   | `read-only-transport`   |
| `browser`   | lists, focuses, navigates, scrapes             | yes   | `unsupported-transport` |

Commands never import a transport. They receive a `CommandContext`:

```ts
export default async function run(context: CommandContext) {
	const { transport } = context; // resolved by Transport/Select.ts
	return transport.setLike(targetOf(context.values), true);
}
```

## Selection

- `--transport cdp|view`, default `cdp`. Universal: every command accepts it, so a caller always
  gets a refusal it can read instead of `unknown option`.
- `view` refuses a mutating command **before the body runs**:
  `{ "error": "read-only-transport", "transport": "view", "command": "post like" }`, exit 2. The
  refusal carries no `detail` on purpose - the object is the contract.
- Read commands produce the **same JSON** from either transport. A caller must never branch on which
  one it got; if the shapes diverge, the view transport is wrong.
- **No silent fallback.** If CDP is unreachable, a read command fails with `cdp-unreachable` instead
  of quietly answering from the archive. Falling back on its own would hide a broken browser behind
  stale data; the caller passes `--transport view` deliberately when that is what it wants.
- `store status`, `store publish` and `store hide` declare no requirement, so they never resolve a
  transport and behave identically whatever `--transport` says.

## What each transport may answer

| Command                                                             | `cdp`                         | `view`                                 |
| ------------------------------------------------------------------- | ----------------------------- | -------------------------------------- |
| `tab list`, `tab focus`                                             | yes                           | `unsupported-transport`                |
| `post extract`                                                      | yes (live DOM)                | yes (shadow record, `source:"shadow"`) |
| `post like`, `post bookmark`                                        | yes                           | `read-only-transport`                  |
| `page list open`, `page list member add`                            | yes                           | `read-only-transport`                  |
| `page bookmarks open`, `page bookmarks scrape`                      | yes                           | `unsupported-transport`                |
| `store scrape`                                                      | yes                           | `unsupported-transport`                |
| `store status`, `store publish`, `store hide`                       | file-only, transport-agnostic | same                                   |
| everything else (`config`, `vote`, `author`, `event`, `store push`) | file-only, transport-agnostic | same                                   |

## What "same shape" means, and what it does not

`post extract` prints `{post:{…}, source:"live"|"shadow"}` from both transports, with the same keys
in the same order. `source` is the only field the transport chooses.

Two values still move, because they are measurements rather than structure:

- `metrics` is what the page says at read time. A like or a view between the scrape and the read
  changes it.
- A media URL carries a CDN size suffix (`?name=small`, `?name=900x900`, `?name=medium`) that the
  page picks from the viewport. The same photo is the same photo; the suffix is not.

A `--id` read opens its own background tab, and a hidden tab never paints a post's photos, so that
path turns on focus emulation before taking the reading. Without it a post with two photos read as
`media: []` - the shape matched and the content did not.

## Invariants

- A mutating command resolved to `view` must fail **before** any side effect, including writing an
  event file.
- The view transport never writes, never navigates, never opens a socket.
- Adding a transport must not change a command file: the interface is the seam.
- `view` reads the shadow store, so it can answer for posts the browser has never shown this
  session.

## Claim → test

| Claim                           | Test                                                                                                                                                                       | Status |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| View is read-only               | `node Maintain/Target/Index.js post like --id <id> --transport view` → `read-only-transport`, exit 2                                                                       | pass   |
| Read shapes match               | `post extract --id <id>` vs `post extract --id <id> --transport view`: identical keys and order, `source` `live`/`shadow`; only `metrics` and the media size suffix differ | pass   |
| No silent fallback              | `MAINTAIN_CDP_PORT=9223 node Maintain/Target/Index.js tab list` → `cdp-unreachable`, not an empty list                                                                     | pass   |
| View needs no browser           | same dead port, `post extract --id <id> --transport view` succeeds                                                                                                         | pass   |
| Commands stay transport-blind   | `grep -rn "Transport/Cdp\|Transport/View" Maintain/Source/Command` → nothing; enforced by `Source/Test/Transport.test.ts`                                                  | pass   |
| `store *` ignores `--transport` | `store status`, `store publish --id 999`, `store hide --id 999` byte-identical with and without `--transport view`                                                         | pass   |

## Not this

- Not a third transport. `view` is a projection, not a cache and not a fallback; a genuinely new
  backend would be a value in `TransportName` and one factory in `Select.ts`.
- Not a place for selectors. Readiness is named (`articles`, `list`) and expressions live in
  `Browser/Selector/`; a command that spells a selector has found a missing member of the interface.

# Transports - CDP first, view second

Every command in `Maintain/` speaks through a **transport**. The browser transport (CDP) is the
primary and the only one allowed to change anything. The view transport is a read-only projection
over the shadow store: same command surface, same JSON shapes, no browser.

> **Status: not implemented.** No command in `pnpm maintain --help` accepts `--transport`, there is
> no `Transport/` directory under `Maintain/Source`, and the only transport seam in the tree is
> `Vote/Transport` (`firebase` or `none`), which carries vote counts and nothing else. This file
> records the intended shape; every command in it is unrun because the flag does not exist.

## Why two

The browser is the source of truth but it is also the fragile part: it can be closed, its debug port
can be taken, the person may have attached the tab to something else, or the machine may be asleep.
Reading the archive should not depend on any of that. Mutating the live site, on the other hand,
must never be simulated - a "like" that only touched a local file would be a lie.

## Interface

```ts
export interface Transport {
	readonly name: "cdp" | "view";
	readonly mutable: boolean;

	tabs(): Promise<Tab[]>;
	navigate(url: string, tab?: string): Promise<{ url: string }>;
	evaluate<T>(expression: string, tab?: string): Promise<T>;

	post(id: string): Promise<Post>;
	setLike(id: string, value: boolean): Promise<{ was: boolean }>;
	setBookmark(id: string, value: boolean): Promise<{ was: boolean }>;
	listMember(slug: ListSlug, handle: string): Promise<{ added: boolean }>;
}
```

| Transport | Path          | `mutable` | Backed by                                               |
| --------- | ------------- | --------- | ------------------------------------------------------- |
| `cdp`     | not built yet | `true`    | `GET /json/list` + the tab's `webSocketDebuggerUrl`     |
| `view`    | not built yet | `false`   | `Maintain/Storage/Shadow/` (posts, observations, index) |

Commands never import a transport directly. They receive one:

```ts
export default async function run(context: CommandContext) {
	const { transport } = context; // resolved by Transport/Select.ts
	return transport.setLike(context.args.id, true);
}
```

## Selection

- `--transport cdp|view`, default `cdp`. Not in `--help` today.
- `view` refuses every mutating command before touching anything:
  `{ "error": "read-only-transport", "transport": "view", "command": "post like" }`, exit 2.
- Read commands produce the **same JSON** from either transport. A caller must never branch on which
  one it got; if the shapes diverge, the view transport is wrong.
- **No silent fallback.** If CDP is unreachable, a read command fails with
  `{error:"cdp-unreachable"}` instead of quietly answering from the archive. Falling back on its own
  would hide a broken browser behind stale data; the caller passes `--transport view` deliberately
  when that is what it wants.

## What each transport may answer

| Command                                       | `cdp`                         | `view`                                 |
| --------------------------------------------- | ----------------------------- | -------------------------------------- |
| `tab list`, `tab focus`                       | yes                           | `{error:"unsupported-transport"}`      |
| `post extract`                                | yes (live DOM)                | yes (shadow record, `source:"shadow"`) |
| `post like`, `post bookmark`                  | yes                           | refused                                |
| `page list open`, `page list member add`      | yes                           | refused                                |
| `store status`, `store publish`, `store hide` | file-only, transport-agnostic | same                                   |

`store *` commands are filesystem operations and ignore `--transport`.

## Invariants

- A mutating command resolved to `view` must fail **before** any side effect, including writing an
  event file.
- The view transport never writes, never navigates, never opens a socket.
- Adding a transport must not change a command file: the interface is the seam.
- `view` reads the shadow store, so it can answer for posts the browser has never shown this
  session.

## Claim → test

| Claim                         | Test                                                                                | Status                             |
| ----------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------- |
| View is read-only             | `pnpm maintain post like --url <post-url> --transport view` → `read-only-transport` | not run: no `--transport` flag     |
| Read shapes match             | `post extract` vs `post extract --transport view` differ only in `source`           | not run: no `--transport` flag     |
| No silent fallback            | stop the browser, `pnpm maintain tab list` → `cdp-unreachable` (not an empty list)  | not run: needs the browser stopped |
| View needs no browser         | `pnpm maintain post extract --transport view` succeeds with the debug port closed   | not run: no `--transport` flag     |
| Commands stay transport-blind | `grep -rn "Transport/Cdp" Maintain/Source/Command` returns nothing                  | not run: no such directory         |

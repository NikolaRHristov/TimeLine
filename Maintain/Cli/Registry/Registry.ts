import type { CommandDefinition } from "../Parser/Parser.ts";
import { Definition as TabList } from "../../Command/Tab/List/List.ts";
import { Definition as TabFocus } from "../../Command/Tab/Focus/Focus.ts";
import { Definition as PostExtract } from "../../Command/Post/Extract/Extract.ts";
import { Definition as PostLike } from "../../Command/Post/Like/Like.ts";
import { Definition as PostLikeRemove } from "../../Command/Post/Like/Remove.ts";
import { Definition as PostBookmarkAdd } from "../../Command/Post/Bookmark/Add.ts";
import { Definition as PostBookmarkRemove } from "../../Command/Post/Bookmark/Remove.ts";
import { Definition as PageBookmarksOpen } from "../../Command/Page/Bookmarks/Open.ts";
import { Definition as PageBookmarksScrape } from "../../Command/Page/Bookmarks/Scrape/Command.ts";
import { Definition as PageListOpen } from "../../Command/Page/List/Open.ts";
import { Definition as StoreScrape } from "../../Command/Store/Scrape/Scrape.ts";
import { Definition as StorePublish } from "../../Command/Store/Publish/Publish.ts";
import { Definition as StoreHide } from "../../Command/Store/Hide/Hide.ts";
import { Definition as StoreStatus } from "../../Command/Store/Status/Status.ts";
import { Definition as EventAppend } from "../../Command/Event/Append/Append.ts";
import { Definition as EventTail } from "../../Command/Event/Tail/Tail.ts";

/**
 * The command table, in the order `--help` prints it.
 *
 * This file is the only place that knows where a command module lives; the
 * parser, the help text and the schemas all read this list.
 */
export const commands: readonly CommandDefinition[] = [
	TabList,
	TabFocus,
	PostExtract,
	PostLike,
	PostLikeRemove,
	PostBookmarkAdd,
	PostBookmarkRemove,
	PageBookmarksOpen,
	PageBookmarksScrape,
	PageListOpen,
	StoreScrape,
	StorePublish,
	StoreHide,
	StoreStatus,
	EventAppend,
	EventTail,
];

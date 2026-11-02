import { Definition as AuthorClassifyInfer } from "../../Command/Author/Classify/Infer.ts";
import { Definition as AuthorClassifyRules } from "../../Command/Author/Classify/Rules.ts";
import { Definition as AuthorDistributeApply } from "../../Command/Author/Distribute/Apply.ts";
import { Definition as AuthorEvidenceBuild } from "../../Command/Author/Evidence/Build.ts";
import { Definition as ConfigInit } from "../../Command/Config/Init/Init.ts";
import { Definition as ConfigShow } from "../../Command/Config/Show/Show.ts";
import { Definition as EventAppend } from "../../Command/Event/Append/Append.ts";
import { Definition as EventTail } from "../../Command/Event/Tail/Tail.ts";
import { Definition as PageBookmarksOpen } from "../../Command/Page/Bookmarks/Open.ts";
import { Definition as PageBookmarksScrape } from "../../Command/Page/Bookmarks/Scrape/Command.ts";
import { Definition as PageListMemberAdd } from "../../Command/Page/List/Member/Add.ts";
import { Definition as PageListOpen } from "../../Command/Page/List/Open.ts";
import { Definition as PostBookmarkAdd } from "../../Command/Post/Bookmark/Add.ts";
import { Definition as PostBookmarkRemove } from "../../Command/Post/Bookmark/Remove.ts";
import { Definition as PostExtract } from "../../Command/Post/Extract/Extract.ts";
import { Definition as PostLike } from "../../Command/Post/Like/Like.ts";
import { Definition as PostLikeRemove } from "../../Command/Post/Like/Remove.ts";
import { Definition as StoreHide } from "../../Command/Store/Hide/Hide.ts";
import { Definition as StorePublish } from "../../Command/Store/Publish/Publish.ts";
import { Definition as StorePush } from "../../Command/Store/Push/Push.ts";
import { Definition as StoreScrape } from "../../Command/Store/Scrape/Scrape.ts";
import { Definition as StoreStatus } from "../../Command/Store/Status/Status.ts";
import { Definition as TabFocus } from "../../Command/Tab/Focus/Focus.ts";
import { Definition as TabList } from "../../Command/Tab/List/List.ts";
import type { CommandDefinition } from "../Parser/Parser.ts";

/**
 * The command table, in the order `--help` prints it.
 *
 * This file is the only place that knows where a command module lives; the
 * parser, the help text and the schemas all read this list.
 */
export const commands: readonly CommandDefinition[] = [
	ConfigInit,
	ConfigShow,
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
	PageListMemberAdd,
	StoreScrape,
	StorePublish,
	StoreHide,
	StoreStatus,
	StorePush,
	AuthorEvidenceBuild,
	AuthorClassifyRules,
	AuthorClassifyInfer,
	AuthorDistributeApply,
	EventAppend,
	EventTail,
];

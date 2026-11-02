/**
 * @module Text
 *
 * The content index: one named export per string the tool layer prints.
 *
 * Each export is a `define` reference, not a lookup. `process.env["..."]` is
 * replaced by the file's text at compile time, so reading
 * `Text.CommandTabListSummary` costs exactly what writing the sentence inline
 * would, and the sentence itself lives in
 * `Content/String/Command/Tab/List/Summary.md`.
 *
 * The guard is what a run without the define sees. `node Source/Index.ts` goes
 * through Node's type stripping and never loads `Configuration/ESBuild.ts`, so
 * that run names the missing define instead of printing `undefined` in the
 * middle of a sentence.
 */
const content = (Value: string | undefined, Name: string): string => {
	if (Value === undefined) {
		throw new Error(
			`${Name} is not defined: this module is complete only after \`pnpm run Build\`, which bakes Content/** in through Maintain/Configuration/Content.ts.`,
		);
	}

	return Value;
};

export const CLICommands = content(
	process.env["CONTENT_STRING_CLI_COMMANDS"],
	"CONTENT_STRING_CLI_COMMANDS",
);
export const CLIContract = content(
	process.env["CONTENT_STRING_CLI_CONTRACT"],
	"CONTENT_STRING_CLI_CONTRACT",
);
export const CLIHeadingCommand = content(
	process.env["CONTENT_STRING_CLI_HEADING_COMMAND"],
	"CONTENT_STRING_CLI_HEADING_COMMAND",
);
export const CLIOptions = content(
	process.env["CONTENT_STRING_CLI_OPTIONS"],
	"CONTENT_STRING_CLI_OPTIONS",
);
export const CLITitle = content(
	process.env["CONTENT_STRING_CLI_TITLE"],
	"CONTENT_STRING_CLI_TITLE",
);
export const CLIUsageCommand = content(
	process.env["CONTENT_STRING_CLI_USAGE_COMMAND"],
	"CONTENT_STRING_CLI_USAGE_COMMAND",
);
export const CLIUsageList = content(
	process.env["CONTENT_STRING_CLI_USAGE_LIST"],
	"CONTENT_STRING_CLI_USAGE_LIST",
);
export const CommandAuthorClassifyInferSummary = content(
	process.env["CONTENT_STRING_COMMAND_AUTHOR_CLASSIFY_INFER_SUMMARY"],
	"CONTENT_STRING_COMMAND_AUTHOR_CLASSIFY_INFER_SUMMARY",
);
export const CommandAuthorClassifyRulesSummary = content(
	process.env["CONTENT_STRING_COMMAND_AUTHOR_CLASSIFY_RULES_SUMMARY"],
	"CONTENT_STRING_COMMAND_AUTHOR_CLASSIFY_RULES_SUMMARY",
);
export const CommandAuthorDistributeApplySummary = content(
	process.env["CONTENT_STRING_COMMAND_AUTHOR_DISTRIBUTE_APPLY_SUMMARY"],
	"CONTENT_STRING_COMMAND_AUTHOR_DISTRIBUTE_APPLY_SUMMARY",
);
export const CommandAuthorEvidenceBuildSummary = content(
	process.env["CONTENT_STRING_COMMAND_AUTHOR_EVIDENCE_BUILD_SUMMARY"],
	"CONTENT_STRING_COMMAND_AUTHOR_EVIDENCE_BUILD_SUMMARY",
);
export const CommandConfigInitSummary = content(
	process.env["CONTENT_STRING_COMMAND_CONFIG_INIT_SUMMARY"],
	"CONTENT_STRING_COMMAND_CONFIG_INIT_SUMMARY",
);
export const CommandConfigShowSummary = content(
	process.env["CONTENT_STRING_COMMAND_CONFIG_SHOW_SUMMARY"],
	"CONTENT_STRING_COMMAND_CONFIG_SHOW_SUMMARY",
);
export const CommandEventAppendSummary = content(
	process.env["CONTENT_STRING_COMMAND_EVENT_APPEND_SUMMARY"],
	"CONTENT_STRING_COMMAND_EVENT_APPEND_SUMMARY",
);
export const CommandEventTailSummary = content(
	process.env["CONTENT_STRING_COMMAND_EVENT_TAIL_SUMMARY"],
	"CONTENT_STRING_COMMAND_EVENT_TAIL_SUMMARY",
);
export const CommandPageBookmarksOpenSummary = content(
	process.env["CONTENT_STRING_COMMAND_PAGE_BOOKMARKS_OPEN_SUMMARY"],
	"CONTENT_STRING_COMMAND_PAGE_BOOKMARKS_OPEN_SUMMARY",
);
export const CommandPageBookmarksScrapeCommandSummary = content(
	process.env["CONTENT_STRING_COMMAND_PAGE_BOOKMARKS_SCRAPE_COMMAND_SUMMARY"],
	"CONTENT_STRING_COMMAND_PAGE_BOOKMARKS_SCRAPE_COMMAND_SUMMARY",
);
export const CommandPageListMemberAddSummary = content(
	process.env["CONTENT_STRING_COMMAND_PAGE_LIST_MEMBER_ADD_SUMMARY"],
	"CONTENT_STRING_COMMAND_PAGE_LIST_MEMBER_ADD_SUMMARY",
);
export const CommandPageListOpenSummary = content(
	process.env["CONTENT_STRING_COMMAND_PAGE_LIST_OPEN_SUMMARY"],
	"CONTENT_STRING_COMMAND_PAGE_LIST_OPEN_SUMMARY",
);
export const CommandPostBookmarkAddSummary = content(
	process.env["CONTENT_STRING_COMMAND_POST_BOOKMARK_ADD_SUMMARY"],
	"CONTENT_STRING_COMMAND_POST_BOOKMARK_ADD_SUMMARY",
);
export const CommandPostBookmarkRemoveSummary = content(
	process.env["CONTENT_STRING_COMMAND_POST_BOOKMARK_REMOVE_SUMMARY"],
	"CONTENT_STRING_COMMAND_POST_BOOKMARK_REMOVE_SUMMARY",
);
export const CommandPostExtractSummary = content(
	process.env["CONTENT_STRING_COMMAND_POST_EXTRACT_SUMMARY"],
	"CONTENT_STRING_COMMAND_POST_EXTRACT_SUMMARY",
);
export const CommandPostLikeRemoveSummary = content(
	process.env["CONTENT_STRING_COMMAND_POST_LIKE_REMOVE_SUMMARY"],
	"CONTENT_STRING_COMMAND_POST_LIKE_REMOVE_SUMMARY",
);
export const CommandPostLikeSummary = content(
	process.env["CONTENT_STRING_COMMAND_POST_LIKE_SUMMARY"],
	"CONTENT_STRING_COMMAND_POST_LIKE_SUMMARY",
);
export const CommandStoreExportSummary = content(
	process.env["CONTENT_STRING_COMMAND_STORE_EXPORT_SUMMARY"],
	"CONTENT_STRING_COMMAND_STORE_EXPORT_SUMMARY",
);
export const CommandStoreHideSummary = content(
	process.env["CONTENT_STRING_COMMAND_STORE_HIDE_SUMMARY"],
	"CONTENT_STRING_COMMAND_STORE_HIDE_SUMMARY",
);
export const CommandStorePublishSummary = content(
	process.env["CONTENT_STRING_COMMAND_STORE_PUBLISH_SUMMARY"],
	"CONTENT_STRING_COMMAND_STORE_PUBLISH_SUMMARY",
);
export const CommandStorePushSummary = content(
	process.env["CONTENT_STRING_COMMAND_STORE_PUSH_SUMMARY"],
	"CONTENT_STRING_COMMAND_STORE_PUSH_SUMMARY",
);
export const CommandStoreScrapeSummary = content(
	process.env["CONTENT_STRING_COMMAND_STORE_SCRAPE_SUMMARY"],
	"CONTENT_STRING_COMMAND_STORE_SCRAPE_SUMMARY",
);
export const CommandStoreStatusSummary = content(
	process.env["CONTENT_STRING_COMMAND_STORE_STATUS_SUMMARY"],
	"CONTENT_STRING_COMMAND_STORE_STATUS_SUMMARY",
);
export const CommandTabFocusSummary = content(
	process.env["CONTENT_STRING_COMMAND_TAB_FOCUS_SUMMARY"],
	"CONTENT_STRING_COMMAND_TAB_FOCUS_SUMMARY",
);
export const CommandTabListSummary = content(
	process.env["CONTENT_STRING_COMMAND_TAB_LIST_SUMMARY"],
	"CONTENT_STRING_COMMAND_TAB_LIST_SUMMARY",
);
export const CommandVoteApproveSummary = content(
	process.env["CONTENT_STRING_COMMAND_VOTE_APPROVE_SUMMARY"],
	"CONTENT_STRING_COMMAND_VOTE_APPROVE_SUMMARY",
);
export const CommandVoteNominateSummary = content(
	process.env["CONTENT_STRING_COMMAND_VOTE_NOMINATE_SUMMARY"],
	"CONTENT_STRING_COMMAND_VOTE_NOMINATE_SUMMARY",
);
export const CommandVoteQueueSummary = content(
	process.env["CONTENT_STRING_COMMAND_VOTE_QUEUE_SUMMARY"],
	"CONTENT_STRING_COMMAND_VOTE_QUEUE_SUMMARY",
);
export const CommandVoteRankSummary = content(
	process.env["CONTENT_STRING_COMMAND_VOTE_RANK_SUMMARY"],
	"CONTENT_STRING_COMMAND_VOTE_RANK_SUMMARY",
);
export const CommandVoteRejectSummary = content(
	process.env["CONTENT_STRING_COMMAND_VOTE_REJECT_SUMMARY"],
	"CONTENT_STRING_COMMAND_VOTE_REJECT_SUMMARY",
);
export const CommandVoteSyncSummary = content(
	process.env["CONTENT_STRING_COMMAND_VOTE_SYNC_SUMMARY"],
	"CONTENT_STRING_COMMAND_VOTE_SYNC_SUMMARY",
);
export const ExampleApprove = content(
	process.env["CONTENT_STRING_EXAMPLE_APPROVE"],
	"CONTENT_STRING_EXAMPLE_APPROVE",
);
export const ExampleBuild = content(
	process.env["CONTENT_STRING_EXAMPLE_BUILD"],
	"CONTENT_STRING_EXAMPLE_BUILD",
);
export const ExampleConfigList = content(
	process.env["CONTENT_STRING_EXAMPLE_CONFIG_LIST"],
	"CONTENT_STRING_EXAMPLE_CONFIG_LIST",
);
export const ExampleConfigProfile = content(
	process.env["CONTENT_STRING_EXAMPLE_CONFIG_PROFILE"],
	"CONTENT_STRING_EXAMPLE_CONFIG_PROFILE",
);
export const ExampleNominate = content(
	process.env["CONTENT_STRING_EXAMPLE_NOMINATE"],
	"CONTENT_STRING_EXAMPLE_NOMINATE",
);
export const ExamplePublish = content(
	process.env["CONTENT_STRING_EXAMPLE_PUBLISH"],
	"CONTENT_STRING_EXAMPLE_PUBLISH",
);
export const ExampleQueue = content(
	process.env["CONTENT_STRING_EXAMPLE_QUEUE"],
	"CONTENT_STRING_EXAMPLE_QUEUE",
);
export const ExampleScrape = content(
	process.env["CONTENT_STRING_EXAMPLE_SCRAPE"],
	"CONTENT_STRING_EXAMPLE_SCRAPE",
);
export const HintVoteAbsent = content(
	process.env["CONTENT_STRING_HINT_VOTE_ABSENT"],
	"CONTENT_STRING_HINT_VOTE_ABSENT",
);
export const HintVoteIncomplete = content(
	process.env["CONTENT_STRING_HINT_VOTE_INCOMPLETE"],
	"CONTENT_STRING_HINT_VOTE_INCOMPLETE",
);
export const HintVoteSync = content(
	process.env["CONTENT_STRING_HINT_VOTE_SYNC"],
	"CONTENT_STRING_HINT_VOTE_SYNC",
);
export const OptionAuthorClassifyInferDryrun = content(
	process.env["CONTENT_STRING_OPTION_AUTHOR_CLASSIFY_INFER_DRYRUN"],
	"CONTENT_STRING_OPTION_AUTHOR_CLASSIFY_INFER_DRYRUN",
);
export const OptionAuthorClassifyInferLimit = content(
	process.env["CONTENT_STRING_OPTION_AUTHOR_CLASSIFY_INFER_LIMIT"],
	"CONTENT_STRING_OPTION_AUTHOR_CLASSIFY_INFER_LIMIT",
);
export const OptionConfigInitCDPPort = content(
	process.env["CONTENT_STRING_OPTION_CONFIG_INIT_CDPPORT"],
	"CONTENT_STRING_OPTION_CONFIG_INIT_CDPPORT",
);
export const OptionConfigInitForce = content(
	process.env["CONTENT_STRING_OPTION_CONFIG_INIT_FORCE"],
	"CONTENT_STRING_OPTION_CONFIG_INIT_FORCE",
);
export const OptionConfigInitList = content(
	process.env["CONTENT_STRING_OPTION_CONFIG_INIT_LIST"],
	"CONTENT_STRING_OPTION_CONFIG_INIT_LIST",
);
export const OptionConfigInitProfile = content(
	process.env["CONTENT_STRING_OPTION_CONFIG_INIT_PROFILE"],
	"CONTENT_STRING_OPTION_CONFIG_INIT_PROFILE",
);
export const OptionConfigShowList = content(
	process.env["CONTENT_STRING_OPTION_CONFIG_SHOW_LIST"],
	"CONTENT_STRING_OPTION_CONFIG_SHOW_LIST",
);
export const OptionConfigShowReveal = content(
	process.env["CONTENT_STRING_OPTION_CONFIG_SHOW_REVEAL"],
	"CONTENT_STRING_OPTION_CONFIG_SHOW_REVEAL",
);
export const OptionEventAppendKind = content(
	process.env["CONTENT_STRING_OPTION_EVENT_APPEND_KIND"],
	"CONTENT_STRING_OPTION_EVENT_APPEND_KIND",
);
export const OptionEventAppendPayload = content(
	process.env["CONTENT_STRING_OPTION_EVENT_APPEND_PAYLOAD"],
	"CONTENT_STRING_OPTION_EVENT_APPEND_PAYLOAD",
);
export const OptionEventAppendSubject = content(
	process.env["CONTENT_STRING_OPTION_EVENT_APPEND_SUBJECT"],
	"CONTENT_STRING_OPTION_EVENT_APPEND_SUBJECT",
);
export const OptionEventTailDir = content(
	process.env["CONTENT_STRING_OPTION_EVENT_TAIL_DIR"],
	"CONTENT_STRING_OPTION_EVENT_TAIL_DIR",
);
export const OptionEventTailFollow = content(
	process.env["CONTENT_STRING_OPTION_EVENT_TAIL_FOLLOW"],
	"CONTENT_STRING_OPTION_EVENT_TAIL_FOLLOW",
);
export const OptionEventTailInterval = content(
	process.env["CONTENT_STRING_OPTION_EVENT_TAIL_INTERVAL"],
	"CONTENT_STRING_OPTION_EVENT_TAIL_INTERVAL",
);
export const OptionEventTailSince = content(
	process.env["CONTENT_STRING_OPTION_EVENT_TAIL_SINCE"],
	"CONTENT_STRING_OPTION_EVENT_TAIL_SINCE",
);
export const OptionPageBookmarksOpenTab = content(
	process.env["CONTENT_STRING_OPTION_PAGE_BOOKMARKS_OPEN_TAB"],
	"CONTENT_STRING_OPTION_PAGE_BOOKMARKS_OPEN_TAB",
);
export const OptionPageBookmarksScrapeCommandLimit = content(
	process.env["CONTENT_STRING_OPTION_PAGE_BOOKMARKS_SCRAPE_COMMAND_LIMIT"],
	"CONTENT_STRING_OPTION_PAGE_BOOKMARKS_SCRAPE_COMMAND_LIMIT",
);
export const OptionPageBookmarksScrapeCommandMaxidle = content(
	process.env["CONTENT_STRING_OPTION_PAGE_BOOKMARKS_SCRAPE_COMMAND_MAXIDLE"],
	"CONTENT_STRING_OPTION_PAGE_BOOKMARKS_SCRAPE_COMMAND_MAXIDLE",
);
export const OptionPageBookmarksScrapeCommandTab = content(
	process.env["CONTENT_STRING_OPTION_PAGE_BOOKMARKS_SCRAPE_COMMAND_TAB"],
	"CONTENT_STRING_OPTION_PAGE_BOOKMARKS_SCRAPE_COMMAND_TAB",
);
export const OptionPageListMemberAddHandle = content(
	process.env["CONTENT_STRING_OPTION_PAGE_LIST_MEMBER_ADD_HANDLE"],
	"CONTENT_STRING_OPTION_PAGE_LIST_MEMBER_ADD_HANDLE",
);
export const OptionPageListMemberAddName = content(
	process.env["CONTENT_STRING_OPTION_PAGE_LIST_MEMBER_ADD_NAME"],
	"CONTENT_STRING_OPTION_PAGE_LIST_MEMBER_ADD_NAME",
);
export const OptionPageListOpenName = content(
	process.env["CONTENT_STRING_OPTION_PAGE_LIST_OPEN_NAME"],
	"CONTENT_STRING_OPTION_PAGE_LIST_OPEN_NAME",
);
export const OptionPostTargetId = content(
	process.env["CONTENT_STRING_OPTION_POST_TARGET_ID"],
	"CONTENT_STRING_OPTION_POST_TARGET_ID",
);
export const OptionPostTargetIndex = content(
	process.env["CONTENT_STRING_OPTION_POST_TARGET_INDEX"],
	"CONTENT_STRING_OPTION_POST_TARGET_INDEX",
);
export const OptionPostTargetTab = content(
	process.env["CONTENT_STRING_OPTION_POST_TARGET_TAB"],
	"CONTENT_STRING_OPTION_POST_TARGET_TAB",
);
export const OptionPostTargetURL = content(
	process.env["CONTENT_STRING_OPTION_POST_TARGET_URL"],
	"CONTENT_STRING_OPTION_POST_TARGET_URL",
);
export const OptionStoreExportDryrun = content(
	process.env["CONTENT_STRING_OPTION_STORE_EXPORT_DRYRUN"],
	"CONTENT_STRING_OPTION_STORE_EXPORT_DRYRUN",
);
export const OptionStoreExportTo = content(
	process.env["CONTENT_STRING_OPTION_STORE_EXPORT_TO"],
	"CONTENT_STRING_OPTION_STORE_EXPORT_TO",
);
export const OptionStoreExportURL = content(
	process.env["CONTENT_STRING_OPTION_STORE_EXPORT_URL"],
	"CONTENT_STRING_OPTION_STORE_EXPORT_URL",
);
export const OptionStoreHideId = content(
	process.env["CONTENT_STRING_OPTION_STORE_HIDE_ID"],
	"CONTENT_STRING_OPTION_STORE_HIDE_ID",
);
export const OptionStorePublishAll = content(
	process.env["CONTENT_STRING_OPTION_STORE_PUBLISH_ALL"],
	"CONTENT_STRING_OPTION_STORE_PUBLISH_ALL",
);
export const OptionStorePublishId = content(
	process.env["CONTENT_STRING_OPTION_STORE_PUBLISH_ID"],
	"CONTENT_STRING_OPTION_STORE_PUBLISH_ID",
);
export const OptionStorePublishSince = content(
	process.env["CONTENT_STRING_OPTION_STORE_PUBLISH_SINCE"],
	"CONTENT_STRING_OPTION_STORE_PUBLISH_SINCE",
);
export const OptionStorePublishSource = content(
	process.env["CONTENT_STRING_OPTION_STORE_PUBLISH_SOURCE"],
	"CONTENT_STRING_OPTION_STORE_PUBLISH_SOURCE",
);
export const OptionStorePushDryrun = content(
	process.env["CONTENT_STRING_OPTION_STORE_PUSH_DRYRUN"],
	"CONTENT_STRING_OPTION_STORE_PUSH_DRYRUN",
);
export const OptionStorePushLimit = content(
	process.env["CONTENT_STRING_OPTION_STORE_PUSH_LIMIT"],
	"CONTENT_STRING_OPTION_STORE_PUSH_LIMIT",
);
export const OptionStorePushSource = content(
	process.env["CONTENT_STRING_OPTION_STORE_PUSH_SOURCE"],
	"CONTENT_STRING_OPTION_STORE_PUSH_SOURCE",
);
export const OptionStorePushURL = content(
	process.env["CONTENT_STRING_OPTION_STORE_PUSH_URL"],
	"CONTENT_STRING_OPTION_STORE_PUSH_URL",
);
export const OptionStoreScrapeLimit = content(
	process.env["CONTENT_STRING_OPTION_STORE_SCRAPE_LIMIT"],
	"CONTENT_STRING_OPTION_STORE_SCRAPE_LIMIT",
);
export const OptionStoreScrapeMaxidle = content(
	process.env["CONTENT_STRING_OPTION_STORE_SCRAPE_MAXIDLE"],
	"CONTENT_STRING_OPTION_STORE_SCRAPE_MAXIDLE",
);
export const OptionStoreScrapeSource = content(
	process.env["CONTENT_STRING_OPTION_STORE_SCRAPE_SOURCE"],
	"CONTENT_STRING_OPTION_STORE_SCRAPE_SOURCE",
);
export const OptionStoreScrapeTab = content(
	process.env["CONTENT_STRING_OPTION_STORE_SCRAPE_TAB"],
	"CONTENT_STRING_OPTION_STORE_SCRAPE_TAB",
);
export const OptionTabFocusId = content(
	process.env["CONTENT_STRING_OPTION_TAB_FOCUS_ID"],
	"CONTENT_STRING_OPTION_TAB_FOCUS_ID",
);
export const OptionVoteApproveId = content(
	process.env["CONTENT_STRING_OPTION_VOTE_APPROVE_ID"],
	"CONTENT_STRING_OPTION_VOTE_APPROVE_ID",
);
export const OptionVoteApproveRank = content(
	process.env["CONTENT_STRING_OPTION_VOTE_APPROVE_RANK"],
	"CONTENT_STRING_OPTION_VOTE_APPROVE_RANK",
);
export const OptionVoteNominateId = content(
	process.env["CONTENT_STRING_OPTION_VOTE_NOMINATE_ID"],
	"CONTENT_STRING_OPTION_VOTE_NOMINATE_ID",
);
export const OptionVoteNominateList = content(
	process.env["CONTENT_STRING_OPTION_VOTE_NOMINATE_LIST"],
	"CONTENT_STRING_OPTION_VOTE_NOMINATE_LIST",
);
export const OptionVoteNominateNote = content(
	process.env["CONTENT_STRING_OPTION_VOTE_NOMINATE_NOTE"],
	"CONTENT_STRING_OPTION_VOTE_NOMINATE_NOTE",
);
export const OptionVoteNominateTitle = content(
	process.env["CONTENT_STRING_OPTION_VOTE_NOMINATE_TITLE"],
	"CONTENT_STRING_OPTION_VOTE_NOMINATE_TITLE",
);
export const OptionVoteNominateURL = content(
	process.env["CONTENT_STRING_OPTION_VOTE_NOMINATE_URL"],
	"CONTENT_STRING_OPTION_VOTE_NOMINATE_URL",
);
export const OptionVoteQueueLimit = content(
	process.env["CONTENT_STRING_OPTION_VOTE_QUEUE_LIMIT"],
	"CONTENT_STRING_OPTION_VOTE_QUEUE_LIMIT",
);
export const OptionVoteRankId = content(
	process.env["CONTENT_STRING_OPTION_VOTE_RANK_ID"],
	"CONTENT_STRING_OPTION_VOTE_RANK_ID",
);
export const OptionVoteRankRank = content(
	process.env["CONTENT_STRING_OPTION_VOTE_RANK_RANK"],
	"CONTENT_STRING_OPTION_VOTE_RANK_RANK",
);
export const OptionVoteRejectId = content(
	process.env["CONTENT_STRING_OPTION_VOTE_REJECT_ID"],
	"CONTENT_STRING_OPTION_VOTE_REJECT_ID",
);
export const OptionVoteRejectReason = content(
	process.env["CONTENT_STRING_OPTION_VOTE_REJECT_REASON"],
	"CONTENT_STRING_OPTION_VOTE_REJECT_REASON",
);
export const ReferenceConfigure = content(
	process.env["CONTENT_STRING_REFERENCE_CONFIGURE"],
	"CONTENT_STRING_REFERENCE_CONFIGURE",
);
export const ReferenceVoting = content(
	process.env["CONTENT_STRING_REFERENCE_VOTING"],
	"CONTENT_STRING_REFERENCE_VOTING",
);
export const DocumentEmptybookmarks = content(
	process.env["CONTENT_DOCUMENT_EMPTYBOOKMARKS"],
	"CONTENT_DOCUMENT_EMPTYBOOKMARKS",
);
export const InstructionClassify = content(
	process.env["CONTENT_INSTRUCTION_CLASSIFY"],
	"CONTENT_INSTRUCTION_CLASSIFY",
);

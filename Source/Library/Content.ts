/**
 * @module Content
 *
 * The site's own words, and the one origin it answers on.
 *
 * Every string here is a `define`: `Content.Page.Index.Picks` is the text of
 * `Content/String/Page/Index/Picks.md`, baked in at build time by
 * `Scripts/Content.ts`, so nothing reads a file at run time and the Markdown
 * never ships. The shape of this object is the shape of the folder - `Page/Index`
 * is `Content.Page.Index` - which is what makes a missing word easy to find.
 *
 * Kept apart from the page content on purpose: a title is a decision, a post is
 * data. Nothing here states a count or a handle - those are read from the
 * content collections at build time, so a fresh clone and a full archive describe
 * themselves correctly with no edit to this file.
 *
 * `Site` and `Repository` are read from the environment rather than written here,
 * because this repository is account-agnostic: the same tree is cloned and
 * deployed by different people, and a hardcoded origin would make every canonical
 * link and every sitemap entry point at someone else's domain. The fallback is a
 * reserved example origin, so a build without a `.env` still produces valid
 * absolute URLs instead of `undefined`.
 */
import { content } from "./Text.ts";

/** The reserved example origin used when `SITE_URL` is unset. */
export const Fallback = content(
	process.env["CONTENT_STRING_BRAND_FALLBACK"],
	"CONTENT_STRING_BRAND_FALLBACK",
);

/** The canonical origin. `SITE_URL` wins; the reserved example domain is the fallback. */
export const Site = process.env["SITE_URL"] ?? Fallback;

/**
 * The repository a reader can find the source in, when the deployment sets one.
 *
 * Empty by default. The shell renders the link only when it is non-empty, so an
 * unconfigured clone shows no dead "Source" link - a broken link is worse than a
 * missing one.
 */
export const Repository = process.env["REPOSITORY_URL"] ?? "";

export const Content = {
	Brand: {
		Description: content(
			process.env["CONTENT_STRING_BRAND_DESCRIPTION"],
			"CONTENT_STRING_BRAND_DESCRIPTION",
		),
		Fallback: content(
			process.env["CONTENT_STRING_BRAND_FALLBACK"],
			"CONTENT_STRING_BRAND_FALLBACK",
		),
		Lede: content(process.env["CONTENT_STRING_BRAND_LEDE"], "CONTENT_STRING_BRAND_LEDE"),
		Licence: content(
			process.env["CONTENT_STRING_BRAND_LICENCE"],
			"CONTENT_STRING_BRAND_LICENCE",
		),
		Short: content(process.env["CONTENT_STRING_BRAND_SHORT"], "CONTENT_STRING_BRAND_SHORT"),
		Title: content(process.env["CONTENT_STRING_BRAND_TITLE"], "CONTENT_STRING_BRAND_TITLE"),
	},
	Document: {
		EmptyBookmarks: content(
			process.env["CONTENT_DOCUMENT_EMPTYBOOKMARKS"],
			"CONTENT_DOCUMENT_EMPTYBOOKMARKS",
		),
	},
	Empty: {
		Activity: content(
			process.env["CONTENT_STRING_EMPTY_ACTIVITY"],
			"CONTENT_STRING_EMPTY_ACTIVITY",
		),
		Bookmarks: content(
			process.env["CONTENT_STRING_EMPTY_BOOKMARKS"],
			"CONTENT_STRING_EMPTY_BOOKMARKS",
		),
		List: content(process.env["CONTENT_STRING_EMPTY_LIST"], "CONTENT_STRING_EMPTY_LIST"),
		Lists: content(process.env["CONTENT_STRING_EMPTY_LISTS"], "CONTENT_STRING_EMPTY_LISTS"),
		Voted: content(process.env["CONTENT_STRING_EMPTY_VOTED"], "CONTENT_STRING_EMPTY_VOTED"),
	},
	Example: {
		Approve: content(
			process.env["CONTENT_STRING_EXAMPLE_APPROVE"],
			"CONTENT_STRING_EXAMPLE_APPROVE",
		),
		Build: content(process.env["CONTENT_STRING_EXAMPLE_BUILD"], "CONTENT_STRING_EXAMPLE_BUILD"),
		Config: {
			List: content(
				process.env["CONTENT_STRING_EXAMPLE_CONFIG_LIST"],
				"CONTENT_STRING_EXAMPLE_CONFIG_LIST",
			),
			Profile: content(
				process.env["CONTENT_STRING_EXAMPLE_CONFIG_PROFILE"],
				"CONTENT_STRING_EXAMPLE_CONFIG_PROFILE",
			),
		},
		Nominate: content(
			process.env["CONTENT_STRING_EXAMPLE_NOMINATE"],
			"CONTENT_STRING_EXAMPLE_NOMINATE",
		),
		Publish: content(
			process.env["CONTENT_STRING_EXAMPLE_PUBLISH"],
			"CONTENT_STRING_EXAMPLE_PUBLISH",
		),
		Queue: content(process.env["CONTENT_STRING_EXAMPLE_QUEUE"], "CONTENT_STRING_EXAMPLE_QUEUE"),
		Scrape: content(
			process.env["CONTENT_STRING_EXAMPLE_SCRAPE"],
			"CONTENT_STRING_EXAMPLE_SCRAPE",
		),
	},
	Hint: {
		Vote: {
			Absent: content(
				process.env["CONTENT_STRING_HINT_VOTE_ABSENT"],
				"CONTENT_STRING_HINT_VOTE_ABSENT",
			),
			Incomplete: content(
				process.env["CONTENT_STRING_HINT_VOTE_INCOMPLETE"],
				"CONTENT_STRING_HINT_VOTE_INCOMPLETE",
			),
			Sync: content(
				process.env["CONTENT_STRING_HINT_VOTE_SYNC"],
				"CONTENT_STRING_HINT_VOTE_SYNC",
			),
		},
	},
	Page: {
		Activity: {
			Description: content(
				process.env["CONTENT_STRING_PAGE_ACTIVITY_DESCRIPTION"],
				"CONTENT_STRING_PAGE_ACTIVITY_DESCRIPTION",
			),
			EmptyBody: content(
				process.env["CONTENT_STRING_PAGE_ACTIVITY_EMPTYBODY"],
				"CONTENT_STRING_PAGE_ACTIVITY_EMPTYBODY",
			),
			Lede: content(
				process.env["CONTENT_STRING_PAGE_ACTIVITY_LEDE"],
				"CONTENT_STRING_PAGE_ACTIVITY_LEDE",
			),
			PostCount: content(
				process.env["CONTENT_STRING_PAGE_ACTIVITY_POSTCOUNT"],
				"CONTENT_STRING_PAGE_ACTIVITY_POSTCOUNT",
			),
		},
		Bookmark: {
			Description: content(
				process.env["CONTENT_STRING_PAGE_BOOKMARK_DESCRIPTION"],
				"CONTENT_STRING_PAGE_BOOKMARK_DESCRIPTION",
			),
			Detail: {
				Back: content(
					process.env["CONTENT_STRING_PAGE_BOOKMARK_DETAIL_BACK"],
					"CONTENT_STRING_PAGE_BOOKMARK_DETAIL_BACK",
				),
				Curated: content(
					process.env["CONTENT_STRING_PAGE_BOOKMARK_DETAIL_CURATED"],
					"CONTENT_STRING_PAGE_BOOKMARK_DETAIL_CURATED",
				),
				LastRead: content(
					process.env["CONTENT_STRING_PAGE_BOOKMARK_DETAIL_LASTREAD"],
					"CONTENT_STRING_PAGE_BOOKMARK_DETAIL_LASTREAD",
				),
				Metric: {
					Likes: content(
						process.env["CONTENT_STRING_PAGE_BOOKMARK_DETAIL_METRIC_LIKES"],
						"CONTENT_STRING_PAGE_BOOKMARK_DETAIL_METRIC_LIKES",
					),
					Replies: content(
						process.env["CONTENT_STRING_PAGE_BOOKMARK_DETAIL_METRIC_REPLIES"],
						"CONTENT_STRING_PAGE_BOOKMARK_DETAIL_METRIC_REPLIES",
					),
					Reposts: content(
						process.env["CONTENT_STRING_PAGE_BOOKMARK_DETAIL_METRIC_REPOSTS"],
						"CONTENT_STRING_PAGE_BOOKMARK_DETAIL_METRIC_REPOSTS",
					),
					Views: content(
						process.env["CONTENT_STRING_PAGE_BOOKMARK_DETAIL_METRIC_VIEWS"],
						"CONTENT_STRING_PAGE_BOOKMARK_DETAIL_METRIC_VIEWS",
					),
				},
				Open: content(
					process.env["CONTENT_STRING_PAGE_BOOKMARK_DETAIL_OPEN"],
					"CONTENT_STRING_PAGE_BOOKMARK_DETAIL_OPEN",
				),
				Permalink: content(
					process.env["CONTENT_STRING_PAGE_BOOKMARK_DETAIL_PERMALINK"],
					"CONTENT_STRING_PAGE_BOOKMARK_DETAIL_PERMALINK",
				),
				Posted: content(
					process.env["CONTENT_STRING_PAGE_BOOKMARK_DETAIL_POSTED"],
					"CONTENT_STRING_PAGE_BOOKMARK_DETAIL_POSTED",
				),
				Rail: {
					Note: content(
						process.env["CONTENT_STRING_PAGE_BOOKMARK_DETAIL_RAIL_NOTE"],
						"CONTENT_STRING_PAGE_BOOKMARK_DETAIL_RAIL_NOTE",
					),
				},
				Saved: content(
					process.env["CONTENT_STRING_PAGE_BOOKMARK_DETAIL_SAVED"],
					"CONTENT_STRING_PAGE_BOOKMARK_DETAIL_SAVED",
				),
				Title: content(
					process.env["CONTENT_STRING_PAGE_BOOKMARK_DETAIL_TITLE"],
					"CONTENT_STRING_PAGE_BOOKMARK_DETAIL_TITLE",
				),
				Verified: content(
					process.env["CONTENT_STRING_PAGE_BOOKMARK_DETAIL_VERIFIED"],
					"CONTENT_STRING_PAGE_BOOKMARK_DETAIL_VERIFIED",
				),
			},
			Lede: content(
				process.env["CONTENT_STRING_PAGE_BOOKMARK_LEDE"],
				"CONTENT_STRING_PAGE_BOOKMARK_LEDE",
			),
		},
		Index: {
			All: content(
				process.env["CONTENT_STRING_PAGE_INDEX_ALL"],
				"CONTENT_STRING_PAGE_INDEX_ALL",
			),
			Description: content(
				process.env["CONTENT_STRING_PAGE_INDEX_DESCRIPTION"],
				"CONTENT_STRING_PAGE_INDEX_DESCRIPTION",
			),
			EmptyBody: content(
				process.env["CONTENT_STRING_PAGE_INDEX_EMPTYBODY"],
				"CONTENT_STRING_PAGE_INDEX_EMPTYBODY",
			),
			EmptyHint: content(
				process.env["CONTENT_STRING_PAGE_INDEX_EMPTYHINT"],
				"CONTENT_STRING_PAGE_INDEX_EMPTYHINT",
			),
			Latest: content(
				process.env["CONTENT_STRING_PAGE_INDEX_LATEST"],
				"CONTENT_STRING_PAGE_INDEX_LATEST",
			),
			Lede: content(
				process.env["CONTENT_STRING_PAGE_INDEX_LEDE"],
				"CONTENT_STRING_PAGE_INDEX_LEDE",
			),
			Picks: content(
				process.env["CONTENT_STRING_PAGE_INDEX_PICKS"],
				"CONTENT_STRING_PAGE_INDEX_PICKS",
			),
		},
		List: {
			Description: content(
				process.env["CONTENT_STRING_PAGE_LIST_DESCRIPTION"],
				"CONTENT_STRING_PAGE_LIST_DESCRIPTION",
			),
			Detail: {
				AllLists: content(
					process.env["CONTENT_STRING_PAGE_LIST_DETAIL_ALLLISTS"],
					"CONTENT_STRING_PAGE_LIST_DETAIL_ALLLISTS",
				),
				Description: content(
					process.env["CONTENT_STRING_PAGE_LIST_DETAIL_DESCRIPTION"],
					"CONTENT_STRING_PAGE_LIST_DETAIL_DESCRIPTION",
				),
				EmptyBody: content(
					process.env["CONTENT_STRING_PAGE_LIST_DETAIL_EMPTYBODY"],
					"CONTENT_STRING_PAGE_LIST_DETAIL_EMPTYBODY",
				),
				Lede: content(
					process.env["CONTENT_STRING_PAGE_LIST_DETAIL_LEDE"],
					"CONTENT_STRING_PAGE_LIST_DETAIL_LEDE",
				),
			},
			EmptyBody: content(
				process.env["CONTENT_STRING_PAGE_LIST_EMPTYBODY"],
				"CONTENT_STRING_PAGE_LIST_EMPTYBODY",
			),
			Lede: content(
				process.env["CONTENT_STRING_PAGE_LIST_LEDE"],
				"CONTENT_STRING_PAGE_LIST_LEDE",
			),
		},
		Voted: {
			Button: content(
				process.env["CONTENT_STRING_PAGE_VOTED_BUTTON"],
				"CONTENT_STRING_PAGE_VOTED_BUTTON",
			),
			Description: content(
				process.env["CONTENT_STRING_PAGE_VOTED_DESCRIPTION"],
				"CONTENT_STRING_PAGE_VOTED_DESCRIPTION",
			),
			EmptyBody: content(
				process.env["CONTENT_STRING_PAGE_VOTED_EMPTYBODY"],
				"CONTENT_STRING_PAGE_VOTED_EMPTYBODY",
			),
			EmptyHintAfter: content(
				process.env["CONTENT_STRING_PAGE_VOTED_EMPTYHINTAFTER"],
				"CONTENT_STRING_PAGE_VOTED_EMPTYHINTAFTER",
			),
			EmptyHintBefore: content(
				process.env["CONTENT_STRING_PAGE_VOTED_EMPTYHINTBEFORE"],
				"CONTENT_STRING_PAGE_VOTED_EMPTYHINTBEFORE",
			),
			Lede: content(
				process.env["CONTENT_STRING_PAGE_VOTED_LEDE"],
				"CONTENT_STRING_PAGE_VOTED_LEDE",
			),
			Nominated: content(
				process.env["CONTENT_STRING_PAGE_VOTED_NOMINATED"],
				"CONTENT_STRING_PAGE_VOTED_NOMINATED",
			),
			NotConfiguredAfter: content(
				process.env["CONTENT_STRING_PAGE_VOTED_NOTCONFIGUREDAFTER"],
				"CONTENT_STRING_PAGE_VOTED_NOTCONFIGUREDAFTER",
			),
			NotConfiguredBefore: content(
				process.env["CONTENT_STRING_PAGE_VOTED_NOTCONFIGUREDBEFORE"],
				"CONTENT_STRING_PAGE_VOTED_NOTCONFIGUREDBEFORE",
			),
			UnknownAuthor: content(
				process.env["CONTENT_STRING_PAGE_VOTED_UNKNOWNAUTHOR"],
				"CONTENT_STRING_PAGE_VOTED_UNKNOWNAUTHOR",
			),
		},
	},
	Reference: {
		Configure: content(
			process.env["CONTENT_STRING_REFERENCE_CONFIGURE"],
			"CONTENT_STRING_REFERENCE_CONFIGURE",
		),
		Voting: content(
			process.env["CONTENT_STRING_REFERENCE_VOTING"],
			"CONTENT_STRING_REFERENCE_VOTING",
		),
	},
	Route: {
		Activity: content(
			process.env["CONTENT_STRING_ROUTE_ACTIVITY"],
			"CONTENT_STRING_ROUTE_ACTIVITY",
		),
		Bookmarks: content(
			process.env["CONTENT_STRING_ROUTE_BOOKMARKS"],
			"CONTENT_STRING_ROUTE_BOOKMARKS",
		),
		Curated: content(
			process.env["CONTENT_STRING_ROUTE_CURATED"],
			"CONTENT_STRING_ROUTE_CURATED",
		),
		Lists: content(process.env["CONTENT_STRING_ROUTE_LISTS"], "CONTENT_STRING_ROUTE_LISTS"),
		Voted: content(process.env["CONTENT_STRING_ROUTE_VOTED"], "CONTENT_STRING_ROUTE_VOTED"),
	},
	Shell: {
		Mark: content(process.env["CONTENT_STRING_SHELL_MARK"], "CONTENT_STRING_SHELL_MARK"),
		Primary: content(
			process.env["CONTENT_STRING_SHELL_PRIMARY"],
			"CONTENT_STRING_SHELL_PRIMARY",
		),
		Repository: content(
			process.env["CONTENT_STRING_SHELL_REPOSITORY"],
			"CONTENT_STRING_SHELL_REPOSITORY",
		),
		Sitemap: content(
			process.env["CONTENT_STRING_SHELL_SITEMAP"],
			"CONTENT_STRING_SHELL_SITEMAP",
		),
		Skip: content(process.env["CONTENT_STRING_SHELL_SKIP"], "CONTENT_STRING_SHELL_SKIP"),
	},
	Word: {
		Across: content(process.env["CONTENT_STRING_WORD_ACROSS"], "CONTENT_STRING_WORD_ACROSS"),
		Candidate: content(
			process.env["CONTENT_STRING_WORD_CANDIDATE"],
			"CONTENT_STRING_WORD_CANDIDATE",
		),
		Candidates: content(
			process.env["CONTENT_STRING_WORD_CANDIDATES"],
			"CONTENT_STRING_WORD_CANDIDATES",
		),
		Event: content(process.env["CONTENT_STRING_WORD_EVENT"], "CONTENT_STRING_WORD_EVENT"),
		Events: content(process.env["CONTENT_STRING_WORD_EVENTS"], "CONTENT_STRING_WORD_EVENTS"),
		List: content(process.env["CONTENT_STRING_WORD_LIST"], "CONTENT_STRING_WORD_LIST"),
		Lists: content(process.env["CONTENT_STRING_WORD_LISTS"], "CONTENT_STRING_WORD_LISTS"),
		Post: content(process.env["CONTENT_STRING_WORD_POST"], "CONTENT_STRING_WORD_POST"),
		Posts: content(process.env["CONTENT_STRING_WORD_POSTS"], "CONTENT_STRING_WORD_POSTS"),
		Recorded: content(
			process.env["CONTENT_STRING_WORD_RECORDED"],
			"CONTENT_STRING_WORD_RECORDED",
		),
		Saved: content(process.env["CONTENT_STRING_WORD_SAVED"], "CONTENT_STRING_WORD_SAVED"),
		Unsorted: content(
			process.env["CONTENT_STRING_WORD_UNSORTED"],
			"CONTENT_STRING_WORD_UNSORTED",
		),
		Vote: content(process.env["CONTENT_STRING_WORD_VOTE"], "CONTENT_STRING_WORD_VOTE"),
		Votes: content(process.env["CONTENT_STRING_WORD_VOTES"], "CONTENT_STRING_WORD_VOTES"),
	},
} as const;

export default Content;

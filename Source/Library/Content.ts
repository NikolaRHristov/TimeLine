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
		/**
		 * The carrier's signature, and the only place the company is named
		 * (RFC-0055 rule 3).
		 *
		 * The network is named by whoever runs it - `Brand.Title` - and the
		 * company that carries it signs the footer once. A second mention
		 * anywhere in the product surface is the advertising this rule exists
		 * to prevent, and `Scripts/Position.mjs` counts the mentions so it
		 * cannot creep in one component at a time.
		 */
		Attribution: content(
			process.env["CONTENT_STRING_BRAND_ATTRIBUTION"],
			"CONTENT_STRING_BRAND_ATTRIBUTION",
		),
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
	/**
	 * The capability claims a showcase page states (RFC-0053, RFC-0055 rule 4).
	 *
	 * A claim is not a slogan: it names the protocol that carries it or the
	 * record it is computed from, so a reader can check it against the record
	 * the way every other surface in this repository states a fact with the
	 * command that proves it. `Scripts/Position.mjs` fails on a claim whose
	 * sentence names neither.
	 */
	Claim: {
		Cipher: content(process.env["CONTENT_STRING_CLAIM_CIPHER"], "CONTENT_STRING_CLAIM_CIPHER"),
		Grant: content(process.env["CONTENT_STRING_CLAIM_GRANT"], "CONTENT_STRING_CLAIM_GRANT"),
		Moderation: content(
			process.env["CONTENT_STRING_CLAIM_MODERATION"],
			"CONTENT_STRING_CLAIM_MODERATION",
		),
		Motion: content(process.env["CONTENT_STRING_CLAIM_MOTION"], "CONTENT_STRING_CLAIM_MOTION"),
		Status: content(process.env["CONTENT_STRING_CLAIM_STATUS"], "CONTENT_STRING_CLAIM_STATUS"),
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
			Eyebrow: content(
				process.env["CONTENT_STRING_PAGE_ACTIVITY_EYEBROW"],
				"CONTENT_STRING_PAGE_ACTIVITY_EYEBROW",
			),
			Lede: content(
				process.env["CONTENT_STRING_PAGE_ACTIVITY_LEDE"],
				"CONTENT_STRING_PAGE_ACTIVITY_LEDE",
			),
			PostCount: content(
				process.env["CONTENT_STRING_PAGE_ACTIVITY_POSTCOUNT"],
				"CONTENT_STRING_PAGE_ACTIVITY_POSTCOUNT",
			),
			/**
			 * The page's own sections, one idea each (RFC-0053 rule 2).
			 *
			 * A showcase page holds no records, so its boxes carry no counts and
			 * no ids: the key is the anchor the contents rail links to, and the
			 * three strings are the whole of what a box says.
			 */
			Section: {
				Record: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_ACTIVITY_SECTION_RECORD_BODY"],
						"CONTENT_STRING_PAGE_ACTIVITY_SECTION_RECORD_BODY",
					),
					Eyebrow: content(
						process.env["CONTENT_STRING_PAGE_ACTIVITY_SECTION_RECORD_EYEBROW"],
						"CONTENT_STRING_PAGE_ACTIVITY_SECTION_RECORD_EYEBROW",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_ACTIVITY_SECTION_RECORD_TITLE"],
						"CONTENT_STRING_PAGE_ACTIVITY_SECTION_RECORD_TITLE",
					),
				},
				Subject: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_ACTIVITY_SECTION_SUBJECT_BODY"],
						"CONTENT_STRING_PAGE_ACTIVITY_SECTION_SUBJECT_BODY",
					),
					Eyebrow: content(
						process.env["CONTENT_STRING_PAGE_ACTIVITY_SECTION_SUBJECT_EYEBROW"],
						"CONTENT_STRING_PAGE_ACTIVITY_SECTION_SUBJECT_EYEBROW",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_ACTIVITY_SECTION_SUBJECT_TITLE"],
						"CONTENT_STRING_PAGE_ACTIVITY_SECTION_SUBJECT_TITLE",
					),
				},
				Replay: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_ACTIVITY_SECTION_REPLAY_BODY"],
						"CONTENT_STRING_PAGE_ACTIVITY_SECTION_REPLAY_BODY",
					),
					Eyebrow: content(
						process.env["CONTENT_STRING_PAGE_ACTIVITY_SECTION_REPLAY_EYEBROW"],
						"CONTENT_STRING_PAGE_ACTIVITY_SECTION_REPLAY_EYEBROW",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_ACTIVITY_SECTION_REPLAY_TITLE"],
						"CONTENT_STRING_PAGE_ACTIVITY_SECTION_REPLAY_TITLE",
					),
				},
			},
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
			Eyebrow: content(
				process.env["CONTENT_STRING_PAGE_BOOKMARK_EYEBROW"],
				"CONTENT_STRING_PAGE_BOOKMARK_EYEBROW",
			),
			Title: content(
				process.env["CONTENT_STRING_PAGE_BOOKMARK_TITLE"],
				"CONTENT_STRING_PAGE_BOOKMARK_TITLE",
			),
			Lede: content(
				process.env["CONTENT_STRING_PAGE_BOOKMARK_LEDE"],
				"CONTENT_STRING_PAGE_BOOKMARK_LEDE",
			),
			/**
			 * The page's own sections, one idea each (RFC-0053 rule 2).
			 *
			 * A showcase page holds no records, so its boxes carry no counts and no
			 * ids: the key is the anchor the contents rail links to, and the three
			 * strings are the whole of what a box says.
			 */
			Section: {
				Capture: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_BOOKMARK_SECTION_CAPTURE_BODY"],
						"CONTENT_STRING_PAGE_BOOKMARK_SECTION_CAPTURE_BODY",
					),
					Eyebrow: content(
						process.env["CONTENT_STRING_PAGE_BOOKMARK_SECTION_CAPTURE_EYEBROW"],
						"CONTENT_STRING_PAGE_BOOKMARK_SECTION_CAPTURE_EYEBROW",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_BOOKMARK_SECTION_CAPTURE_TITLE"],
						"CONTENT_STRING_PAGE_BOOKMARK_SECTION_CAPTURE_TITLE",
					),
				},
				Filed: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_BOOKMARK_SECTION_FILED_BODY"],
						"CONTENT_STRING_PAGE_BOOKMARK_SECTION_FILED_BODY",
					),
					Eyebrow: content(
						process.env["CONTENT_STRING_PAGE_BOOKMARK_SECTION_FILED_EYEBROW"],
						"CONTENT_STRING_PAGE_BOOKMARK_SECTION_FILED_EYEBROW",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_BOOKMARK_SECTION_FILED_TITLE"],
						"CONTENT_STRING_PAGE_BOOKMARK_SECTION_FILED_TITLE",
					),
				},
				Private: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_BOOKMARK_SECTION_PRIVATE_BODY"],
						"CONTENT_STRING_PAGE_BOOKMARK_SECTION_PRIVATE_BODY",
					),
					Eyebrow: content(
						process.env["CONTENT_STRING_PAGE_BOOKMARK_SECTION_PRIVATE_EYEBROW"],
						"CONTENT_STRING_PAGE_BOOKMARK_SECTION_PRIVATE_EYEBROW",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_BOOKMARK_SECTION_PRIVATE_TITLE"],
						"CONTENT_STRING_PAGE_BOOKMARK_SECTION_PRIVATE_TITLE",
					),
				},
			},
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
			Eyebrow: content(
				process.env["CONTENT_STRING_PAGE_INDEX_EYEBROW"],
				"CONTENT_STRING_PAGE_INDEX_EYEBROW",
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
			/**
			 * The page's own sections, one idea each (RFC-0053 rule 2).
			 *
			 * A showcase page holds no records, so its boxes carry no counts and no
			 * ids: the key is the anchor the contents rail links to, and the three
			 * strings are the whole of what a box says.
			 */
			Section: {
				Processing: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_INDEX_SECTION_PROCESSING_BODY"],
						"CONTENT_STRING_PAGE_INDEX_SECTION_PROCESSING_BODY",
					),
					Eyebrow: content(
						process.env["CONTENT_STRING_PAGE_INDEX_SECTION_PROCESSING_EYEBROW"],
						"CONTENT_STRING_PAGE_INDEX_SECTION_PROCESSING_EYEBROW",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_INDEX_SECTION_PROCESSING_TITLE"],
						"CONTENT_STRING_PAGE_INDEX_SECTION_PROCESSING_TITLE",
					),
				},
				Review: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_INDEX_SECTION_REVIEW_BODY"],
						"CONTENT_STRING_PAGE_INDEX_SECTION_REVIEW_BODY",
					),
					Eyebrow: content(
						process.env["CONTENT_STRING_PAGE_INDEX_SECTION_REVIEW_EYEBROW"],
						"CONTENT_STRING_PAGE_INDEX_SECTION_REVIEW_EYEBROW",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_INDEX_SECTION_REVIEW_TITLE"],
						"CONTENT_STRING_PAGE_INDEX_SECTION_REVIEW_TITLE",
					),
				},
				Source: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_INDEX_SECTION_SOURCE_BODY"],
						"CONTENT_STRING_PAGE_INDEX_SECTION_SOURCE_BODY",
					),
					Eyebrow: content(
						process.env["CONTENT_STRING_PAGE_INDEX_SECTION_SOURCE_EYEBROW"],
						"CONTENT_STRING_PAGE_INDEX_SECTION_SOURCE_EYEBROW",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_INDEX_SECTION_SOURCE_TITLE"],
						"CONTENT_STRING_PAGE_INDEX_SECTION_SOURCE_TITLE",
					),
				},
			},
			Title: content(
				process.env["CONTENT_STRING_PAGE_INDEX_TITLE"],
				"CONTENT_STRING_PAGE_INDEX_TITLE",
			),
		},
		/**
		 * The showcase spread (RFC-0053), and every card on it is a claim.
		 *
		 * A card states a capability and names the protocol or the record behind
		 * it, which is why the bodies are the longest strings in this file: the
		 * sentence that would have been an adjective is the one that has to name
		 * `AES-GCM-256` or an RFC. `Scripts/Position.mjs` checks every body and
		 * every pillar note against that rule.
		 */
		Showcase: {
			Card: {
				Canvas: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_CARD_CANVAS_BODY"],
						"CONTENT_STRING_PAGE_SHOWCASE_CARD_CANVAS_BODY",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_CARD_CANVAS_TITLE"],
						"CONTENT_STRING_PAGE_SHOWCASE_CARD_CANVAS_TITLE",
					),
				},
				Drawer: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_CARD_DRAWER_BODY"],
						"CONTENT_STRING_PAGE_SHOWCASE_CARD_DRAWER_BODY",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_CARD_DRAWER_TITLE"],
						"CONTENT_STRING_PAGE_SHOWCASE_CARD_DRAWER_TITLE",
					),
				},
				Motion: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_CARD_MOTION_BODY"],
						"CONTENT_STRING_PAGE_SHOWCASE_CARD_MOTION_BODY",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_CARD_MOTION_TITLE"],
						"CONTENT_STRING_PAGE_SHOWCASE_CARD_MOTION_TITLE",
					),
				},
				Network: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_CARD_NETWORK_BODY"],
						"CONTENT_STRING_PAGE_SHOWCASE_CARD_NETWORK_BODY",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_CARD_NETWORK_TITLE"],
						"CONTENT_STRING_PAGE_SHOWCASE_CARD_NETWORK_TITLE",
					),
				},
				Provenance: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_CARD_PROVENANCE_BODY"],
						"CONTENT_STRING_PAGE_SHOWCASE_CARD_PROVENANCE_BODY",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_CARD_PROVENANCE_TITLE"],
						"CONTENT_STRING_PAGE_SHOWCASE_CARD_PROVENANCE_TITLE",
					),
				},
				Seam: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_CARD_SEAM_BODY"],
						"CONTENT_STRING_PAGE_SHOWCASE_CARD_SEAM_BODY",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_CARD_SEAM_TITLE"],
						"CONTENT_STRING_PAGE_SHOWCASE_CARD_SEAM_TITLE",
					),
				},
			},
			Eyebrow: content(
				process.env["CONTENT_STRING_PAGE_SHOWCASE_EYEBROW"],
				"CONTENT_STRING_PAGE_SHOWCASE_EYEBROW",
			),
			Lede: content(
				process.env["CONTENT_STRING_PAGE_SHOWCASE_LEDE"],
				"CONTENT_STRING_PAGE_SHOWCASE_LEDE",
			),
			Pillar: {
				Authenticated: {
					Name: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_PILLAR_AUTHENTICATED_NAME"],
						"CONTENT_STRING_PAGE_SHOWCASE_PILLAR_AUTHENTICATED_NAME",
					),
					Note: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_PILLAR_AUTHENTICATED_NOTE"],
						"CONTENT_STRING_PAGE_SHOWCASE_PILLAR_AUTHENTICATED_NOTE",
					),
				},
				Authorised: {
					Name: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_PILLAR_AUTHORISED_NAME"],
						"CONTENT_STRING_PAGE_SHOWCASE_PILLAR_AUTHORISED_NAME",
					),
					Note: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_PILLAR_AUTHORISED_NOTE"],
						"CONTENT_STRING_PAGE_SHOWCASE_PILLAR_AUTHORISED_NOTE",
					),
				},
				Encrypted: {
					Name: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_PILLAR_ENCRYPTED_NAME"],
						"CONTENT_STRING_PAGE_SHOWCASE_PILLAR_ENCRYPTED_NAME",
					),
					Note: content(
						process.env["CONTENT_STRING_PAGE_SHOWCASE_PILLAR_ENCRYPTED_NOTE"],
						"CONTENT_STRING_PAGE_SHOWCASE_PILLAR_ENCRYPTED_NOTE",
					),
				},
			},
			Title: content(
				process.env["CONTENT_STRING_PAGE_SHOWCASE_TITLE"],
				"CONTENT_STRING_PAGE_SHOWCASE_TITLE",
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
			Eyebrow: content(
				process.env["CONTENT_STRING_PAGE_LIST_EYEBROW"],
				"CONTENT_STRING_PAGE_LIST_EYEBROW",
			),
			Lede: content(
				process.env["CONTENT_STRING_PAGE_LIST_LEDE"],
				"CONTENT_STRING_PAGE_LIST_LEDE",
			),
			Rule: content(
				process.env["CONTENT_STRING_PAGE_LIST_RULE"],
				"CONTENT_STRING_PAGE_LIST_RULE",
			),
			/**
			 * The page's own sections, one idea each (RFC-0053 rule 2).
			 *
			 * A showcase page holds no records, so its boxes carry no counts and no
			 * ids: the key is the anchor the contents rail links to, and the three
			 * strings are the whole of what a box says.
			 */
			Section: {
				Filter: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_LIST_SECTION_FILTER_BODY"],
						"CONTENT_STRING_PAGE_LIST_SECTION_FILTER_BODY",
					),
					Eyebrow: content(
						process.env["CONTENT_STRING_PAGE_LIST_SECTION_FILTER_EYEBROW"],
						"CONTENT_STRING_PAGE_LIST_SECTION_FILTER_EYEBROW",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_LIST_SECTION_FILTER_TITLE"],
						"CONTENT_STRING_PAGE_LIST_SECTION_FILTER_TITLE",
					),
				},
				Name: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_LIST_SECTION_NAME_BODY"],
						"CONTENT_STRING_PAGE_LIST_SECTION_NAME_BODY",
					),
					Eyebrow: content(
						process.env["CONTENT_STRING_PAGE_LIST_SECTION_NAME_EYEBROW"],
						"CONTENT_STRING_PAGE_LIST_SECTION_NAME_EYEBROW",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_LIST_SECTION_NAME_TITLE"],
						"CONTENT_STRING_PAGE_LIST_SECTION_NAME_TITLE",
					),
				},
				Slug: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_LIST_SECTION_SLUG_BODY"],
						"CONTENT_STRING_PAGE_LIST_SECTION_SLUG_BODY",
					),
					Eyebrow: content(
						process.env["CONTENT_STRING_PAGE_LIST_SECTION_SLUG_EYEBROW"],
						"CONTENT_STRING_PAGE_LIST_SECTION_SLUG_EYEBROW",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_LIST_SECTION_SLUG_TITLE"],
						"CONTENT_STRING_PAGE_LIST_SECTION_SLUG_TITLE",
					),
				},
			},
			Title: content(
				process.env["CONTENT_STRING_PAGE_LIST_TITLE"],
				"CONTENT_STRING_PAGE_LIST_TITLE",
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
			Eyebrow: content(
				process.env["CONTENT_STRING_PAGE_VOTED_EYEBROW"],
				"CONTENT_STRING_PAGE_VOTED_EYEBROW",
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
			/**
			 * The page's own sections, one idea each (RFC-0053 rule 2).
			 *
			 * A showcase page holds no records, so its boxes carry no counts and no
			 * ids: the key is the anchor the contents rail links to, and the three
			 * strings are the whole of what a box says.
			 */
			Section: {
				Nominate: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_VOTED_SECTION_NOMINATE_BODY"],
						"CONTENT_STRING_PAGE_VOTED_SECTION_NOMINATE_BODY",
					),
					Eyebrow: content(
						process.env["CONTENT_STRING_PAGE_VOTED_SECTION_NOMINATE_EYEBROW"],
						"CONTENT_STRING_PAGE_VOTED_SECTION_NOMINATE_EYEBROW",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_VOTED_SECTION_NOMINATE_TITLE"],
						"CONTENT_STRING_PAGE_VOTED_SECTION_NOMINATE_TITLE",
					),
				},
				Rank: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_VOTED_SECTION_RANK_BODY"],
						"CONTENT_STRING_PAGE_VOTED_SECTION_RANK_BODY",
					),
					Eyebrow: content(
						process.env["CONTENT_STRING_PAGE_VOTED_SECTION_RANK_EYEBROW"],
						"CONTENT_STRING_PAGE_VOTED_SECTION_RANK_EYEBROW",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_VOTED_SECTION_RANK_TITLE"],
						"CONTENT_STRING_PAGE_VOTED_SECTION_RANK_TITLE",
					),
				},
				Settle: {
					Body: content(
						process.env["CONTENT_STRING_PAGE_VOTED_SECTION_SETTLE_BODY"],
						"CONTENT_STRING_PAGE_VOTED_SECTION_SETTLE_BODY",
					),
					Eyebrow: content(
						process.env["CONTENT_STRING_PAGE_VOTED_SECTION_SETTLE_EYEBROW"],
						"CONTENT_STRING_PAGE_VOTED_SECTION_SETTLE_EYEBROW",
					),
					Title: content(
						process.env["CONTENT_STRING_PAGE_VOTED_SECTION_SETTLE_TITLE"],
						"CONTENT_STRING_PAGE_VOTED_SECTION_SETTLE_TITLE",
					),
				},
			},
			Title: content(
				process.env["CONTENT_STRING_PAGE_VOTED_TITLE"],
				"CONTENT_STRING_PAGE_VOTED_TITLE",
			),
		},
		Workspace: {
			Description: content(
				process.env["CONTENT_STRING_PAGE_WORKSPACE_DESCRIPTION"],
				"CONTENT_STRING_PAGE_WORKSPACE_DESCRIPTION",
			),
			/**
			 * The drawer's empty state, in the reader's own words (RFC-0054 §2).
			 *
			 * The drawer is the reader's own and is never filled with a sample, so
			 * an anonymous reader meets an empty one. The body says whose the
			 * drawer is before it says how to fill it, because the one lie this
			 * surface must not tell is that a row on screen is theirs.
			 */
			EmptyBody: content(
				process.env["CONTENT_STRING_PAGE_WORKSPACE_EMPTYBODY"],
				"CONTENT_STRING_PAGE_WORKSPACE_EMPTYBODY",
			),
			EmptyHint: content(
				process.env["CONTENT_STRING_PAGE_WORKSPACE_EMPTYHINT"],
				"CONTENT_STRING_PAGE_WORKSPACE_EMPTYHINT",
			),
			EmptyTitle: content(
				process.env["CONTENT_STRING_PAGE_WORKSPACE_EMPTYTITLE"],
				"CONTENT_STRING_PAGE_WORKSPACE_EMPTYTITLE",
			),
			Hint: content(
				process.env["CONTENT_STRING_PAGE_WORKSPACE_HINT"],
				"CONTENT_STRING_PAGE_WORKSPACE_HINT",
			),
			/**
			 * Why the seam is `locked` rather than absent (RFC-0049, RFC-0054 §3).
			 *
			 * The reason is the state's whole content: a locked control that
			 * cannot say what would open it is the dead end the state exists to
			 * prevent, so the sentence names the fact that is missing - an
			 * identity - and the rule that makes it necessary.
			 */
			LockReason: content(
				process.env["CONTENT_STRING_PAGE_WORKSPACE_LOCKREASON"],
				"CONTENT_STRING_PAGE_WORKSPACE_LOCKREASON",
			),
		},
	},
	/**
	 * The provenance drum's own header, wherever the drum draws a pipeline.
	 *
	 * A showcase page passes its own words instead (RFC-0053 rule 3): the same
	 * drum is a table of contents there, and a contents rail that called itself
	 * an ingestion timeline would be naming a pipeline it is not drawing.
	 */
	Provenance: {
		Eyebrow: content(
			process.env["CONTENT_STRING_PROVENANCE_EYEBROW"],
			"CONTENT_STRING_PROVENANCE_EYEBROW",
		),
		Title: content(
			process.env["CONTENT_STRING_PROVENANCE_TITLE"],
			"CONTENT_STRING_PROVENANCE_TITLE",
		),
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
	/**
	 * The showcase surface (RFC-0053): the frame every showcase page shares.
	 *
	 * The rail and the closing band say the same thing on all five routes, so
	 * they are stated once here; a page's own words live under `Page`, one
	 * folder per route. The closing band invites the reader to the workspace,
	 * which is the one destination RFC-0054 makes public - and the only
	 * invitation this deployment can honour (RFC-0053 rule 5).
	 */
	Showcase: {
		Close: {
			Label: content(
				process.env["CONTENT_STRING_SHOWCASE_CLOSE_LABEL"],
				"CONTENT_STRING_SHOWCASE_CLOSE_LABEL",
			),
			Link: content(
				process.env["CONTENT_STRING_SHOWCASE_CLOSE_LINK"],
				"CONTENT_STRING_SHOWCASE_CLOSE_LINK",
			),
		},
		Rail: {
			Eyebrow: content(
				process.env["CONTENT_STRING_SHOWCASE_RAIL_EYEBROW"],
				"CONTENT_STRING_SHOWCASE_RAIL_EYEBROW",
			),
			Note: content(
				process.env["CONTENT_STRING_SHOWCASE_RAIL_NOTE"],
				"CONTENT_STRING_SHOWCASE_RAIL_NOTE",
			),
			Title: content(
				process.env["CONTENT_STRING_SHOWCASE_RAIL_TITLE"],
				"CONTENT_STRING_SHOWCASE_RAIL_TITLE",
			),
		},
	},
	Word: {
		Across: content(process.env["CONTENT_STRING_WORD_ACROSS"], "CONTENT_STRING_WORD_ACROSS"),
		Approved: content(
			process.env["CONTENT_STRING_WORD_APPROVED"],
			"CONTENT_STRING_WORD_APPROVED",
		),
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
		/**
		 * The unit of action travelling through the network (RFC-0055 rule 2).
		 *
		 * `motion` is the copy's word for it, and it replaces `request`,
		 * `action`, `job` and `event` wherever the product speaks about one. The
		 * record that stores it keeps its own name - `Event`, `vote.cast` -
		 * because renaming a table to match a brand is a migration with no
		 * product benefit.
		 */
		Motion: content(process.env["CONTENT_STRING_WORD_MOTION"], "CONTENT_STRING_WORD_MOTION"),
		Motions: content(process.env["CONTENT_STRING_WORD_MOTIONS"], "CONTENT_STRING_WORD_MOTIONS"),
		Post: content(process.env["CONTENT_STRING_WORD_POST"], "CONTENT_STRING_WORD_POST"),
		Posts: content(process.env["CONTENT_STRING_WORD_POSTS"], "CONTENT_STRING_WORD_POSTS"),
		Recorded: content(
			process.env["CONTENT_STRING_WORD_RECORDED"],
			"CONTENT_STRING_WORD_RECORDED",
		),
		Rejected: content(
			process.env["CONTENT_STRING_WORD_REJECTED"],
			"CONTENT_STRING_WORD_REJECTED",
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

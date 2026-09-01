import type { SearchQuery } from "../api/types";

/**
 * Every screen that reads clipboard history sends the same query with one or
 * two fields changed - a page size, a `pinned` flag, a set of content types.
 * Five files each carried their own copy of the other eleven fields, so adding
 * a field to `SearchQuery` meant finding all five.
 *
 * `group_by` is deliberately absent: grouping is derived on this side, and the
 * repository never reads it.
 */
const base: SearchQuery = {
  text: null,
  kinds: ["clipboard"],
  content_types: [],
  languages: [],
  project_ids: [],
  category_ids: [],
  tag_ids: [],
  pinned: null,
  favorite: null,
  created_from: null,
  created_to: null,
  source_apps: [],
  sort: "newest",
  limit: 100,
  offset: 0,
};

export function clipboardQuery(overrides: Partial<SearchQuery> = {}): SearchQuery {
  return { ...base, ...overrides };
}

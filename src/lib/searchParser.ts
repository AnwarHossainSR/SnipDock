import type { ContentType, GroupBy, ItemKind, SearchQuery } from "../api/types";

interface ParsedOperators {
  text: string[];
  type: ContentType[];
  kind: ItemKind[];
  lang: string[];
  pinned: boolean | null;
  favorite: boolean | null;
  from: string | null;
  to: string | null;
  sort: SearchQuery["sort"];
  group: GroupBy | undefined;
}

const OPERATOR_PATTERN = /(\w+):(?:"([^"]*?)"|(\S+))/g;

const CONTENT_TYPE_MAP: Record<string, ContentType> = {
  text: "plain_text",
  code: "code",
  json: "json",
  sql: "sql",
  html: "html",
  css: "css",
  xml: "xml",
  shell: "shell",
  markdown: "markdown",
  config: "config",
  image: "image",
};

const KIND_MAP: Record<string, ItemKind> = {
  clipboard: "clipboard",
  snippet: "snippet",
  command: "command",
  template: "template",
  note: "note",
};

const SORT_MAP: Record<string, SearchQuery["sort"]> = {
  newest: "newest",
  oldest: "oldest",
  recent: "newest",
  used: "most_used",
  popular: "most_used",
};

const GROUP_MAP: Record<string, GroupBy> = {
  date: "date",
  type: "content_type",
  kind: "kind",
};

export function parseSearchQuery(query: string): ParsedOperators {
  const operators: ParsedOperators = {
    text: [],
    type: [],
    kind: [],
    lang: [],
    pinned: null,
    favorite: null,
    from: null,
    to: null,
    sort: "newest",
    group: undefined,
  };

  let remaining = query;
  let match;

  while ((match = OPERATOR_PATTERN.exec(query)) !== null) {
    const [fullMatch, operator, quotedValue, unquotedValue] = match;
    const value = (quotedValue ?? unquotedValue ?? "").toLowerCase();

    switch (operator.toLowerCase()) {
      case "type":
      case "t":
        if (CONTENT_TYPE_MAP[value]) {
          operators.type.push(CONTENT_TYPE_MAP[value]);
        }
        break;
      case "kind":
      case "k":
        if (KIND_MAP[value]) {
          operators.kind.push(KIND_MAP[value]);
        }
        break;
      case "lang":
      case "language":
        operators.lang.push(value);
        break;
      case "pinned":
      case "pin":
        operators.pinned = value === "true" || value === "yes" || value === "1";
        break;
      case "favorite":
      case "fav":
        operators.favorite = value === "true" || value === "yes" || value === "1";
        break;
      case "from":
      case "since":
        operators.from = value;
        break;
      case "to":
      case "until":
        operators.to = value;
        break;
      case "sort":
      case "order":
        if (SORT_MAP[value]) {
          operators.sort = SORT_MAP[value];
        }
        break;
      case "group":
      case "groupby":
        if (GROUP_MAP[value]) {
          operators.group = GROUP_MAP[value];
        }
        break;
    }

    // Remove ALL occurrences of the matched pattern, not just the first.
    remaining = remaining.split(fullMatch).join("");
  }

  // Reset lastIndex in case an exception interrupted the loop above.
  OPERATOR_PATTERN.lastIndex = 0;

  // Extract remaining text as search terms
  const textTerms = remaining
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  operators.text = textTerms;

  return operators;
}

export function buildSearchQuery(
  rawQuery: string,
  baseQuery: SearchQuery,
): SearchQuery {
  const parsed = parseSearchQuery(rawQuery);

  // Build the final query
  const query: SearchQuery = {
    ...baseQuery,
  };

  // Set text search
  if (parsed.text.length > 0) {
    query.text = parsed.text.join(" ");
  }

  // Set content types (merge with existing)
  if (parsed.type.length > 0) {
    query.content_types = [
      ...new Set([...query.content_types, ...parsed.type]),
    ];
  }

  // Set kinds (merge with existing)
  if (parsed.kind.length > 0) {
    query.kinds = [...new Set([...query.kinds, ...parsed.kind])];
  }

  // Set languages
  if (parsed.lang.length > 0) {
    query.languages = [...new Set([...query.languages, ...parsed.lang])];
  }

  // Set pinned
  if (parsed.pinned !== null) {
    query.pinned = parsed.pinned;
  }

  // Set favorite
  if (parsed.favorite !== null) {
    query.favorite = parsed.favorite;
  }

  // Set date range
  if (parsed.from) {
    query.created_from = parsed.from;
  }
  if (parsed.to) {
    query.created_to = parsed.to;
  }

  // Set sort order
  query.sort = parsed.sort;

  // Set grouping
  if (parsed.group) {
    query.group_by = parsed.group;
  }

  return query;
}

export function getSearchHelpText(): string {
  return `Search operators:
  type:code - Filter by content type (text, code, json, sql, html, css, xml, shell, markdown, config, image)
  kind:snippet - Filter by item kind (clipboard, snippet, command, template, note)
  lang:python - Filter by programming language
  pinned:true - Show only pinned items
  favorite:true - Show only favorites
  from:2024-01-01 - Filter by start date
  to:2024-12-31 - Filter by end date
  sort:used - Sort by usage (newest, oldest, used)
  group:type - Group results (date, type, kind)

Example: "type:code lang:javascript pinned:true sort:used"`;
}

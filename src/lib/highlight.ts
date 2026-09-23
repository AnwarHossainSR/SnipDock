/**
 * A small, display-only highlighter for captures shown in full: the inspector
 * preview and Quick Paste's preview pane.
 *
 * It is deliberately shallow. A capture is a fragment - half a function, one
 * SQL statement, a curl line - so a real parser would fail on most of what it
 * is handed. This colours what a reader scans for (keywords, strings,
 * numbers, keys) and leaves everything else plain, and it never changes the
 * text: joining a line's tokens gives the line back exactly.
 */

export type TokenKind = "plain" | "keyword" | "string" | "number" | "key" | "comment" | "punct" | "heading";

export interface Token {
  text: string;
  kind: TokenKind;
}

export interface HighlightedLine {
  /** 1-based, for the gutter. */
  number: number;
  tokens: Token[];
}

/** Past this, a capture is shown plain: colouring is for reading, and nobody
 *  reads a 5,000-line paste in a 320px rail. */
export const HIGHLIGHT_LINE_LIMIT = 400;
const HIGHLIGHT_CHAR_LIMIT = 40_000;

const SQL_KEYWORDS = new Set(
  "select from where join left right inner outer full on and or not as group by order having limit offset insert into values update set delete create table alter drop index distinct union all case when then else end is null like in exists between count sum avg min max now interval desc asc returning with primary key references default"
    .split(" "),
);

const CODE_KEYWORDS = new Set(
  "abstract async await break case catch class const continue def default del do elif else enum export extends false final finally fn for from func function if impl import in interface is let match mod mut new nil none null package private protected pub public return self static struct super switch this throw true try type typeof undefined use var void while with yield number string boolean".split(
    " ",
  ),
);

const SHELL_COMMANDS = new Set(
  "curl wget git bun npm npx pnpm yarn cargo docker kubectl ssh scp cd ls cat grep sed awk echo export sudo rm cp mv mkdir chmod jq make python node".split(" "),
);

function push(out: Token[], text: string, kind: TokenKind) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.kind === kind) last.text += text;
  else out.push({ text, kind });
}

const GENERIC =
  /("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\/\/.*$|#.*$|--.*$)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|([\s\S])/g;

function lexGeneric(line: string, out: Token[], keywords: Set<string>, options: { jsonKeys?: boolean; comments?: RegExp; lowerKeywords?: boolean }) {
  GENERIC.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = GENERIC.exec(line))) {
    const [, str, comment, num, word, space, other] = match;
    if (str !== undefined) {
      const isKey = options.jsonKeys && /^\s*:/.test(line.slice(GENERIC.lastIndex));
      push(out, str, isKey ? "key" : "string");
    } else if (comment !== undefined) {
      if (options.comments?.test(comment)) push(out, comment, "comment");
      else {
        // Not a comment in this language (`#` in JSON, `--` in code): lex its
        // first character alone and carry on after it.
        push(out, comment[0], "punct");
        GENERIC.lastIndex = match.index + 1;
      }
    } else if (num !== undefined) push(out, num, "number");
    else if (word !== undefined) {
      const probe = options.lowerKeywords ? word.toLowerCase() : word;
      push(out, word, keywords.has(probe) ? "keyword" : "plain");
    } else if (space !== undefined) push(out, space, "plain");
    else push(out, other ?? "", "punct");
  }
}

function lexShell(line: string, out: Token[]) {
  if (/^\s*#/.test(line)) return push(out, line, "comment");
  let first = true;
  for (const part of line.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) push(out, part, "plain");
    else if (/^--?[A-Za-z]/.test(part)) push(out, part, "keyword");
    else if (/^["'`]/.test(part) || /["'`]$/.test(part)) push(out, part, "string");
    else if (/^[|\\&;>]+$/.test(part)) push(out, part, "punct");
    else if (part.includes("$") || part.startsWith("@")) push(out, part, "number");
    else if (first && SHELL_COMMANDS.has(part)) push(out, part, "keyword");
    else push(out, part, "plain");
    if (!/^\s+$/.test(part)) first = /^[|&;]+$/.test(part);
  }
}

function lexConfig(line: string, out: Token[]) {
  if (/^\s*[#;]/.test(line)) return push(out, line, "comment");
  const pair = line.match(/^(\s*-?\s*)([A-Za-z_][\w.-]*)(\s*[:=])(.*)$/);
  if (pair) {
    push(out, pair[1], "punct");
    push(out, pair[2], "key");
    push(out, pair[3], "punct");
    lexGeneric(pair[4], out, new Set(["true", "false", "null", "yes", "no"]), {});
    return;
  }
  lexGeneric(line, out, new Set(), {});
}

function lexMarkdown(line: string, out: Token[]) {
  if (/^\s*#{1,6}\s/.test(line)) return push(out, line, "heading");
  const bullet = line.match(/^(\s*(?:[-*+]|\d+\.)\s)(.*)$/);
  if (bullet) {
    push(out, bullet[1], "punct");
    push(out, bullet[2], "plain");
    return;
  }
  push(out, line, "plain");
}

function lexHtml(line: string, out: Token[]) {
  const re = /(<\/?)([\w-]+)|([\w-]+)(=)("[^"]*"|'[^']*')|(\/?>)|([^<]+?(?=<|$))|([\s\S])/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line))) {
    if (match[2] !== undefined) {
      push(out, match[1], "punct");
      push(out, match[2], "keyword");
    } else if (match[3] !== undefined) {
      push(out, match[3], "key");
      push(out, match[4], "punct");
      push(out, match[5], "string");
    } else if (match[6] !== undefined) push(out, match[6], "punct");
    else push(out, match[7] ?? match[8] ?? "", "plain");
  }
}

function lexCss(line: string, out: Token[]) {
  const decl = line.match(/^(\s*)([\w-]+)(\s*:)(.*)$/);
  if (decl && !/[{]/.test(line)) {
    push(out, decl[1], "plain");
    push(out, decl[2], "key");
    push(out, decl[3], "punct");
    lexGeneric(decl[4], out, new Set(), {});
    return;
  }
  lexGeneric(line, out, new Set(), { comments: /^\/\// });
}

function tokenizeLine(line: string, contentType: string): Token[] {
  const out: Token[] = [];
  switch (contentType) {
    case "json":
      lexGeneric(line, out, new Set(["true", "false", "null"]), { jsonKeys: true });
      break;
    case "sql":
      lexGeneric(line, out, SQL_KEYWORDS, { comments: /^--/, lowerKeywords: true });
      break;
    case "shell":
      lexShell(line, out);
      break;
    case "config":
      lexConfig(line, out);
      break;
    case "markdown":
      lexMarkdown(line, out);
      break;
    case "html":
    case "xml":
      lexHtml(line, out);
      break;
    case "css":
      lexCss(line, out);
      break;
    case "code":
      lexGeneric(line, out, CODE_KEYWORDS, { comments: /^(\/\/|#)/ });
      break;
    default:
      push(out, line, "plain");
  }
  return out;
}

/**
 * Split a capture into numbered, coloured lines. Content past the limits is
 * returned as plain lines, so the caller never has to special-case it.
 */
export function highlightLines(content: string, contentType: string): HighlightedLine[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const colour = lines.length <= HIGHLIGHT_LINE_LIMIT && content.length <= HIGHLIGHT_CHAR_LIMIT;
  return lines.map((line, index) => ({
    number: index + 1,
    tokens: colour ? tokenizeLine(line, contentType) : line ? [{ text: line, kind: "plain" }] : [],
  }));
}

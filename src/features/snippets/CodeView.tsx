import { useState } from "react";
import type { ReactNode } from "react";

interface CodeViewProps {
  content: string;
  language?: string | null;
  showLineNumbers?: boolean;
}

type TokenKind = "keyword" | "string" | "comment" | "number" | "plain";

const KEYWORDS = new Set([
  // Shared across the languages SnipDock detects; purely cosmetic.
  "fn", "let", "mut", "impl", "pub", "use", "match", "struct", "enum", "trait", "mod",
  "const", "static", "async", "await", "return", "if", "else", "for", "while", "loop",
  "function", "var", "class", "interface", "type", "extends", "implements", "new",
  "import", "export", "from", "default", "def", "elif", "lambda", "self", "None", "True",
  "False", "null", "undefined", "true", "false", "try", "catch", "except", "finally",
  "throw", "raise", "in", "of", "not", "and", "or", "select", "from", "where", "insert",
  "update", "delete", "create", "table", "into", "values", "join", "on", "group", "order",
  "by", "limit",
]);

/**
 * Tokenizes one line of code into safe text nodes. This is a deliberately
 * simple line-local lexer: output is only ever rendered as React text
 * children (never HTML), so untrusted content cannot inject markup.
 */
function tokenizeLine(line: string): Array<{ kind: TokenKind; text: string }> {
  const tokens: Array<{ kind: TokenKind; text: string }> = [];
  let index = 0;

  const commentStart = findCommentStart(line);

  while (index < line.length) {
    if (commentStart !== -1 && index === commentStart) {
      tokens.push({ kind: "comment", text: line.slice(index) });
      break;
    }
    const char = line[index];

    if (char === '"' || char === "'" || char === "`") {
      let end = index + 1;
      while (end < line.length && line[end] !== char) {
        if (line[end] === "\\") end += 1;
        end += 1;
      }
      end = Math.min(end + 1, line.length);
      tokens.push({ kind: "string", text: line.slice(index, end) });
      index = end;
      continue;
    }

    if (/[0-9]/.test(char) && !/[A-Za-z0-9_]/.test(line[index - 1] ?? "")) {
      let end = index;
      while (end < line.length && /[0-9._xXa-fA-F]/.test(line[end])) end += 1;
      tokens.push({ kind: "number", text: line.slice(index, end) });
      index = end;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      let end = index;
      while (end < line.length && /[A-Za-z0-9_]/.test(line[end])) end += 1;
      const word = line.slice(index, end);
      tokens.push({
        kind: KEYWORDS.has(word) || KEYWORDS.has(word.toLowerCase()) ? "keyword" : "plain",
        text: word,
      });
      index = end;
      continue;
    }

    let end = index;
    while (end < line.length && !/[A-Za-z0-9_"'`]/.test(line[end])) {
      if (commentStart !== -1 && end === commentStart) break;
      end += 1;
    }
    tokens.push({ kind: "plain", text: line.slice(index, Math.max(end, index + 1)) });
    index = Math.max(end, index + 1);
  }

  return tokens;
}

function findCommentStart(line: string): number {
  let inString: string | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === inString) inString = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      inString = char;
      continue;
    }
    if (char === "/" && line[index + 1] === "/") return index;
    if (char === "#" && !/[A-Za-z0-9]/.test(line[index - 1] ?? "")) return index;
    if (char === "-" && line[index + 1] === "-" && line[index + 2] === " ") return index;
  }
  return -1;
}

function renderLine(line: string): ReactNode[] {
  return tokenizeLine(line).map((token, index) =>
    token.kind === "plain"
      ? token.text
      : (
        <span
          className={token.kind === "number"
            ? "code-view__number-token"
            : `code-view__${token.kind}`}
          key={index}
        >
          {token.text}
        </span>
      )
  );
}

/**
 * Syntax-highlighted, text-node-only code viewer. Content is rendered
 * exclusively through React text children — no HTML strings — preserving
 * indentation and supporting selection, wrapping, and line numbers.
 */
export default function CodeView({ content, language, showLineNumbers = true }: CodeViewProps) {
  const [wrap, setWrap] = useState(false);
  const [numbers, setNumbers] = useState(showLineNumbers);
  const lines = content.split("\n");

  return (
    <figure className="code-view">
      <figcaption className="code-view__bar">
        {language && <span className="code-view__badge">{language}</span>}
        <span className="snippet-heading__actions">
          <button
            type="button"
            className="button-secondary"
            aria-pressed={numbers}
            onClick={() => setNumbers((current) => !current)}
          >
            Line numbers
          </button>
          <button
            type="button"
            className="button-secondary"
            aria-pressed={wrap}
            onClick={() => setWrap((current) => !current)}
          >
            Wrap
          </button>
        </span>
      </figcaption>
      <pre
        className={wrap ? "code-view__code code-view__code--wrap" : "code-view__code"}
        tabIndex={0}
      >
        <code>
          {lines.map((line, index) => (
            <span className="code-view__line" key={index}>
              {numbers && (
                <span className="code-view__number" aria-hidden="true">
                  {index + 1}
                </span>
              )}
              {renderLine(line)}
              {"\n"}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}

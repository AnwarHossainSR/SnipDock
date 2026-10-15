/**
 * Reading environment variables out of pasted text, and writing a set back
 * out in the shape a tool expects.
 *
 * Parsing lives here rather than in Rust so the import dialog can preview
 * exactly what will be written, line errors included, before anything is.
 */

import type { EnvVarEntry } from "../api/types";

export type ImportFormat = "auto" | "dotenv" | "json";
export type ExportFormat = "dotenv" | "json" | "shell" | "powershell" | "yaml";

export const EXPORT_FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: "dotenv", label: ".env", hint: "KEY=value lines for a .env file" },
  { value: "json", label: "JSON", hint: "One JSON object" },
  { value: "shell", label: "Shell", hint: "export lines for bash and zsh" },
  { value: "powershell", label: "PowerShell", hint: "$env: assignments" },
  { value: "yaml", label: "YAML", hint: "A map for Compose or Kubernetes" },
];

export interface ParseError {
  /** 1-based line the problem starts on; 0 when the text as a whole is wrong. */
  line: number;
  message: string;
}

export interface ParseResult {
  /** The format the text was read as, once `auto` has been decided. */
  format: Exclude<ImportFormat, "auto">;
  entries: EnvVarEntry[];
  errors: ParseError[];
}

/** Mirrors `validate_env_key` in `src-tauri/src/storage/env_vars.rs`. */
const MAX_KEY_CHARS = 256;
// Control characters as Rust's `char::is_control` counts them: C0, DEL and C1.
// eslint-disable-next-line no-control-regex
const FORBIDDEN_KEY = /[=\s\u0000-\u001f\u007f-\u009f]/;

/** Why the backend would refuse this key, or null when it would take it. */
export function keyProblem(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return "Enter a key.";
  if ([...trimmed].length > MAX_KEY_CHARS) return "Keep the key to 256 characters.";
  if (FORBIDDEN_KEY.test(trimmed)) return "A key cannot contain spaces, “=” or control characters.";
  // A `.env` line that starts with `#` is a comment, so it could never be read back.
  if (trimmed.startsWith("#")) return "A key cannot start with “#”.";
  return null;
}

/** A name every shell can `export` and every OS can hold. Anything else is
 *  stored, but flagged, because not every tool will read it back. */
export function isPortableKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

const SECRET_KEY =
  /(SECRET|TOKEN|PASSWORD|PASSWD|PASSPHRASE|PRIVATE|CREDENTIAL|API_?KEY|ACCESS_?KEY|AUTH|SIGNING|ENCRYPTION|SALT|_KEY$|^KEY$|_PWD$|_PASS$|DSN$|WEBHOOK)/i;
// `scheme://user:password@host` - a connection string carrying its password.
// The user may be empty, as in Redis's `redis://:password@host`.
const CREDENTIALS_IN_URL = /^[a-z][a-z0-9+.-]*:\/\/[^\s/:@]*:[^\s/@]+@/i;
const PEM_BLOCK = /-----BEGIN [A-Z ]*(PRIVATE KEY|CERTIFICATE)-----/;

/**
 * A guess at whether a value should be masked, used to pre-tick the secret
 * box on import and on a new variable. Errs towards masking: an extra click
 * to reveal costs less than a token shown over a shoulder.
 */
export function looksSecret(key: string, value = ""): boolean {
  return SECRET_KEY.test(key) || CREDENTIALS_IN_URL.test(value) || PEM_BLOCK.test(value);
}

export type ValueKind = "json" | "multiline" | "empty" | "text";

/** What a value holds, for the badge beside it. JSON means an object or an
 *  array - a bare number or `true` is just text that happens to parse. */
export function valueKind(value: string): ValueKind {
  if (value === "") return "empty";
  if (parseJsonDocument(value) !== undefined) return "json";
  if (value.includes("\n")) return "multiline";
  return "text";
}

/** The value parsed as a JSON object or array, or undefined when it is not one. */
export function parseJsonDocument(value: string): unknown {
  const trimmed = value.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* ------------------------------------------------------------------------- */

export function parseEnvText(text: string, format: ImportFormat = "auto"): ParseResult {
  const resolved = format === "auto" ? detectFormat(text) : format;
  const result = resolved === "json" ? parseJson(text) : parseDotenv(text);
  return { format: resolved, entries: dedupe(result.entries), errors: result.errors };
}

/** JSON when the text is a JSON document, `.env` otherwise. */
export function detectFormat(text: string): Exclude<ImportFormat, "auto"> {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // A `.env` value can start with a brace too; fall through.
    }
  }
  return "dotenv";
}

/** A key given twice keeps its last value, as `docker compose` and most
 *  dotenv loaders do, and keeps the place of its first appearance. */
function dedupe(entries: EnvVarEntry[]): EnvVarEntry[] {
  const byKey = new Map<string, EnvVarEntry>();
  for (const entry of entries) byKey.set(entry.key, entry);
  return [...byKey.values()];
}

function entry(key: string, value: string): EnvVarEntry {
  return { key, value, secret: looksSecret(key, value) };
}

// What a backslash means inside double quotes: the usual `.env` escapes, plus
// the rest of JSON's, which the YAML export writes through `JSON.stringify`.
const ESCAPES: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  "/": "/",
  '"': '"',
  "\\": "\\",
  $: "$",
};

/**
 * Reads `.env` text: `KEY=value` lines, with `#` comments, blank lines, and
 * single, double or backtick quotes that may span lines. The `export`, `set`
 * and `$env:` prefixes are accepted too, so the Shell and PowerShell exports
 * read straight back in.
 */
export function parseDotenv(text: string): Omit<ParseResult, "format"> {
  // Split on LF alone: a CR inside a quoted value is part of the value, and
  // every other trailing CR goes with the whitespace each line is trimmed of.
  const lines = text.split("\n");
  const entries: EnvVarEntry[] = [];
  const errors: ParseError[] = [];

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    // Only the front is trimmed here: the end may be inside a quoted value.
    let line = lines[index].replace(/^\s+/, "");
    if (!line.trim() || line.startsWith("#")) continue;

    line = line.replace(/^(export|set)\s+/i, "");
    let separator: number;
    let key: string;
    let quotedKey: RegExpExecArray | null;
    // `$env:KEY = …`, or `${env:my-key} = …` for a name PowerShell cannot
    // write bare, with its backtick escapes.
    const powershell =
      /^\$env:([^=\s]+)\s*=\s*/i.exec(line) ?? /^\$\{env:((?:[^}`]|`.)+)\}\s*=\s*/i.exec(line);
    if (powershell) {
      key = powershell[1].replace(/`(.)/g, "$1");
      separator = powershell[0].length - 1;
    } else if ((quotedKey = /^("(?:[^"\\]|\\.)*"):\s/.exec(line))) {
      // `"ProgramFiles(x86)": …` - YAML quotes a key that is not a plain name.
      try {
        key = JSON.parse(quotedKey[1]) as string;
      } catch {
        errors.push({ line: lineNumber, message: "The quoted key is not valid." });
        continue;
      }
      separator = quotedKey[1].length;
    } else {
      separator = line.indexOf("=");
      // `KEY: value` is how YAML and some `.env` dialects write it. The colon
      // wins when it comes first: the value may hold an `=` of its own.
      const colon = /^([^\s:=]+):\s/.exec(line);
      if (colon && (separator === -1 || colon[1].length < separator)) separator = colon[1].length;
      if (separator === -1) {
        errors.push({ line: lineNumber, message: "Expected KEY=value." });
        continue;
      }
      key = line.slice(0, separator).trim();
    }

    const problem = keyProblem(key);
    if (problem) {
      errors.push({ line: lineNumber, message: problem });
      continue;
    }

    let rest = line.slice(separator + 1).replace(/^\s+/, "");
    const quote = rest[0];
    if (quote === '"' || quote === "'" || quote === "`") {
      // A quoted value runs to its closing quote, across lines if need be.
      const dialect = powershell ? "powershell" : "posix";
      let body = rest.slice(1);
      let value = readQuoted(body, quote, dialect);
      let lastLine = index;
      while (value === null && lastLine + 1 < lines.length) {
        lastLine++;
        body += "\n" + lines[lastLine];
        value = readQuoted(body, quote, dialect);
      }
      if (value === null) {
        // Report it and carry on from the next line: reading the rest of the
        // file as one value would hide every line after it from the preview.
        errors.push({ line: lineNumber, message: `The ${quote} quote is never closed.` });
        continue;
      }
      entries.push(entry(key, value));
      index = lastLine;
      continue;
    }

    // Unquoted: a `#` after whitespace starts a comment.
    const comment = rest.search(/\s#/);
    if (comment !== -1) rest = rest.slice(0, comment);
    entries.push(entry(key, rest.trim()));
  }

  return { entries, errors };
}

/**
 * The text after an opening quote, up to its closing quote, or null when the
 * quote never closes. Double quotes take backslash escapes. Inside single
 * quotes a quote is written as `'\''` by POSIX shells (and `.env` files they
 * source) and as `''` by PowerShell - the shapes the Shell and PowerShell
 * exports produce. Backticks are literal.
 */
function readQuoted(body: string, quote: string, dialect: "posix" | "powershell"): string | null {
  let value = "";
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (quote === '"' && char === "\\" && index + 1 < body.length) {
      const next = body[++index];
      const hex = next === "u" ? /^[0-9a-fA-F]{4}/.exec(body.slice(index + 1)) : null;
      if (hex) {
        value += String.fromCharCode(parseInt(hex[0], 16));
        index += 4;
      } else {
        value += ESCAPES[next] ?? `\\${next}`;
      }
    } else if (char !== quote) {
      value += char;
    } else if (quote === "'" && dialect === "powershell" && body[index + 1] === "'") {
      value += "'";
      index += 1;
    } else if (quote === "'" && dialect === "posix" && body.startsWith("\\''", index + 1)) {
      value += "'";
      index += 3;
    } else {
      return value;
    }
  }
  return null;
}

/**
 * Reads JSON: an object of `{ "KEY": value }`, or an array of
 * `{ "name" | "key": ..., "value": ... }` as ECS task definitions and most
 * hosting dashboards export. Strings are kept as they are, numbers and
 * booleans as their text, and nested objects or arrays as compact JSON.
 *
 * A number keeps the text it was written with - `1.10` stays `1.10` and a
 * 20-digit ID keeps every digit - wherever the engine hands the reviver its
 * source text (Chromium, WebKit and Bun do); elsewhere it falls back to the
 * parsed number's own text.
 */
export function parseJson(text: string): Omit<ParseResult, "format"> {
  let document: unknown;
  // Each number's source text, by the object holding it and its key there.
  const numberText = new WeakMap<object, Map<string, string>>();
  function keepNumberText(this: object, key: string, value: unknown, context?: { source?: string }) {
    if (typeof value === "number" && typeof context?.source === "string") {
      const byKey = numberText.get(this) ?? new Map<string, string>();
      byKey.set(key, context.source);
      numberText.set(this, byKey);
    }
    return value;
  }
  try {
    document = JSON.parse(text.trim(), keepNumberText as Parameters<typeof JSON.parse>[1]);
  } catch (error) {
    return { entries: [], errors: [{ line: 0, message: `Not valid JSON: ${(error as Error).message}` }] };
  }

  const pairs: [string, unknown, string | undefined][] = [];
  if (Array.isArray(document)) {
    for (const element of document) {
      const record = element as Record<string, unknown> | null;
      const key = record?.name ?? record?.key;
      if (typeof key !== "string" || !record || !("value" in record)) {
        return {
          entries: [],
          errors: [{ line: 0, message: "Each array element needs a “name” (or “key”) and a “value”." }],
        };
      }
      pairs.push([key, record.value, numberText.get(record)?.get("value")]);
    }
  } else if (document && typeof document === "object") {
    const holder = document;
    for (const [key, value] of Object.entries(holder)) pairs.push([key, value, numberText.get(holder)?.get(key)]);
  } else {
    return { entries: [], errors: [{ line: 0, message: "Expected a JSON object of KEY: value pairs." }] };
  }

  const entries: EnvVarEntry[] = [];
  const errors: ParseError[] = [];
  for (const [key, raw, source] of pairs) {
    const problem = keyProblem(key);
    if (problem) {
      errors.push({ line: 0, message: `“${key}”: ${problem}` });
      continue;
    }
    entries.push(entry(key.trim(), typeof raw === "number" && source ? source : jsonValueText(raw)));
  }
  return { entries, errors };
}

function jsonValueText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/* ------------------------------------------------------------------------- */
/* Exporting                                                                  */
/* ------------------------------------------------------------------------- */

export interface ExportableVar {
  key: string;
  value: string;
}

export function formatEnv(vars: ExportableVar[], format: ExportFormat): string {
  switch (format) {
    case "json":
      return JSON.stringify(Object.fromEntries(vars.map(({ key, value }) => [key, value])), null, 2);
    case "shell":
      // `export` takes shell names only; anything else would break the whole
      // block when it is pasted or sourced, so it is named and left out.
      return vars
        .map(({ key, value }) =>
          isPortableKey(key) ? `export ${key}=${shellQuote(value)}` : `# ${key} is not a valid shell name; left out`,
        )
        .join("\n");
    case "powershell":
      return vars.map(({ key, value }) => `${powershellTarget(key)} = '${value.replace(/'/g, "''")}'`).join("\n");
    case "yaml":
      return vars.map(({ key, value }) => `${yamlKey(key)}: ${JSON.stringify(value)}`).join("\n");
    default:
      return vars.map(({ key, value }) => `${key}=${dotenvQuote(value)}`).join("\n");
  }
}

/** One variable as a `.env` line - what "Copy as KEY=value" puts on the clipboard. */
export function formatEnvLine(variable: ExportableVar): string {
  return formatEnv([variable], "dotenv");
}

const SAFE_BARE = /^[A-Za-z0-9_./:@%+,-]+$/;

/**
 * Bare when nothing in the value could be misread; single-quoted (literal,
 * never expanded) when it fits on one line; double-quoted with escapes when
 * it spans lines or holds a single quote. `$` is left alone: the common
 * loaders disagree on `\$`, and the most used one would keep the backslash.
 */
function dotenvQuote(value: string): string {
  if (SAFE_BARE.test(value)) return value;
  if (!value.includes("'") && !value.includes("\n") && !value.includes("\r")) return `'${value}'`;
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
  return `"${escaped}"`;
}

/** POSIX single quotes: nothing inside is special, and a quote is spelled `'\''`. */
function shellQuote(value: string): string {
  if (SAFE_BARE.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function powershellTarget(key: string): string {
  return isPortableKey(key) ? `$env:${key}` : `\${env:${key.replace(/[{}`]/g, "`$&")}}`;
}

function yamlKey(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key) ? key : JSON.stringify(key);
}

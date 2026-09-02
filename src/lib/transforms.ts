import type { Transform, TransformKind } from "../api/types";

/**
 * Mirror of the Rust `apply_transform` pipeline. The preview pane and the
 * single-key chips both depend on the same client-side implementation so
 * the user sees exactly the bytes that will land on the clipboard.
 */
export class TransformError extends Error {
  readonly variant: Transform;
  constructor(variant: Transform, message: string) {
    super(message);
    this.name = "TransformError";
    this.variant = variant;
  }
}

export function applyTransform(content: string, transform: Transform): string {
  switch (transform) {
    case "trim":
      return content.trim();
    case "lowercase":
      return content.toLowerCase();
    case "uppercase":
      return content.toUpperCase();
    case "sort_dedupe_lines": {
      // `split("\n")` would emit a trailing empty string for an input that
      // ends in "\n"; keep that signal so the joined output also ends in "\n".
      const trailing = content.endsWith("\n");
      const body = trailing ? content.slice(0, -1) : content;
      const lines = body.length === 0 ? [] : body.split("\n");
      const sorted = [...lines].sort();
      const dedup: string[] = [];
      for (const line of sorted) {
        if (dedup.length === 0 || dedup[dedup.length - 1] !== line) {
          dedup.push(line);
        }
      }
      return dedup.length === 0 ? "" : dedup.join("\n") + (trailing ? "\n" : "");
    }
    case "json_pretty": {
      const parsed = tryParseJson(content);
      if (!parsed.ok) throw new TransformError(transform, parsed.message);
      return JSON.stringify(parsed.value, null, 2);
    }
    case "json_minify": {
      const parsed = tryParseJson(content);
      if (!parsed.ok) throw new TransformError(transform, parsed.message);
      return JSON.stringify(parsed.value);
    }
    case "base64_encode": {
      // `unescape(encodeURIComponent(...))` is the documented way to round-trip
      // arbitrary UTF-8 through `btoa`, which only accepts Latin-1.
      const bytes = unescape(encodeURIComponent(content));
      return btoa(bytes);
    }
    case "base64_decode": {
      try {
        const decoded = atob(content);
        return decodeURIComponent(escape(decoded));
      } catch (error) {
        throw new TransformError(
          transform,
          error instanceof Error ? error.message : "invalid base64 input",
        );
      }
    }
    case "url_encode": {
      return encodeURIComponent(content)
        // `encodeURIComponent` leaves `!`, `*`, `'`, `(`, `)` unescaped, which
        // the Rust byte-level encoder percent-encodes; tighten it to RFC
        // 3986's unreserved set so the preview shown here and the value the
        // Rust side pastes are the same string. `~` is unreserved and stays
        // literal in both.
        .replace(/!/g, "%21")
        .replace(/\*/g, "%2A")
        .replace(/'/g, "%27")
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29");
    }
    case "url_decode":
      try {
        return decodeURIComponent(content.replace(/\+/g, " "));
      } catch (error) {
        throw new TransformError(
          transform,
          error instanceof Error ? error.message : "invalid percent-encoded input",
        );
      }
  }
}

function tryParseJson(content: string):
  | { ok: true; value: unknown }
  | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(content) };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "invalid JSON",
    };
  }
}

export const TRANSFORM_KINDS: readonly TransformKind[] = [
  { variant: "trim", label: "Trim", hint: "Strip leading and trailing whitespace", shortcut: "T" },
  { variant: "lowercase", label: "Lower", hint: "lowercase the whole selection", shortcut: "L" },
  { variant: "uppercase", label: "Upper", hint: "UPPERCASE the whole selection", shortcut: "U" },
  { variant: "sort_dedupe_lines", label: "Sort/dedupe lines", hint: "Sort lines alphabetically and drop duplicates", shortcut: "S" },
  { variant: "json_pretty", label: "JSON pretty", hint: "Re-indent JSON with two-space indent", shortcut: "J" },
  { variant: "json_minify", label: "JSON minify", hint: "Collapse JSON to a single line", shortcut: "M" },
  { variant: "base64_encode", label: "B64 encode", hint: "Base64-encode the selection", shortcut: "B" },
  { variant: "base64_decode", label: "B64 decode", hint: "Decode a base64 payload", shortcut: "D" },
  { variant: "url_encode", label: "URL encode", hint: "Percent-encode for a URL", shortcut: "E" },
  { variant: "url_decode", label: "URL decode", hint: "Decode a percent-encoded string", shortcut: "X" },
];

/** Indexable by variant, so the chip can look up its metadata. */
export const TRANSFORM_BY_VARIANT: ReadonlyMap<Transform, TransformKind> = new Map(
  TRANSFORM_KINDS.map((kind) => [kind.variant, kind] as const),
);

/** Single-key binding lookup. The same character twice in TRANSFORM_KINDS
 *  would shadow the earlier entry - intentional, so a chip that re-uses a
 *  key can override one earlier in the list (it never happens in practice
 *  but the lookup is one-way so the assumption is safe to state). */
export const TRANSFORM_BY_SHORTCUT: ReadonlyMap<string, TransformKind> = (() => {
  const map = new Map<string, TransformKind>();
  for (const kind of TRANSFORM_KINDS) {
    if (kind.shortcut) map.set(kind.shortcut, kind);
  }
  return map;
})();

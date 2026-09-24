import type { CSSProperties } from "react";
import type { ContentType } from "../api/types";

/**
 * What each content type is called in the interface. The row, the inspector,
 * and the usage breakdown all name types, and all three used to carry their
 * own copy of this map.
 */
const labels: Record<ContentType, string> = {
  plain_text: "Plain text",
  code: "Code",
  json: "JSON",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  xml: "XML",
  shell: "Shell",
  markdown: "Markdown",
  config: "Config",
  image: "Image",
};

/** Every content type the backend detects, in the order the app lists them. */
export const contentTypes = Object.keys(labels) as ContentType[];

/** Everything except images, which the clear dialog scopes against. */
export const textContentTypes = contentTypes.filter((type) => type !== "image");

export function contentTypeLabel(contentType: string): string {
  return labels[contentType as ContentType] ?? contentType;
}

/**
 * What to call one capture. A detected language is more useful than the word
 * "Code", so it wins where there is one - the row and the inspector both said
 * this in their own words before.
 */
export function itemTypeLabel(item: { content_type: string; language: string | null }): string {
  if (item.content_type === "code" && item.language) return item.language;
  return contentTypeLabel(item.content_type);
}

/**
 * Maps each detected content type to its `--type-*` token.
 * Types with no dedicated colour (code/sql/html/css/xml/markdown/plain_text)
 * fall back to the plain-text colour per the design-tokens spec.
 */
const typeTokenName: Partial<Record<ContentType, string>> = {
  image: "image",
  shell: "shell",
  json: "json",
  config: "config",
};

export function contentTypeTokenName(contentType: ContentType): string {
  return typeTokenName[contentType] ?? "text";
}

/**
 * The type colour as a custom property, for the spine down a row's left edge.
 * A clipboard manager's first question is always "what kind of thing did I
 * copy", so the type is what the list is colour-coded by.
 */
export function contentTypeSpineStyle(contentType: ContentType): CSSProperties {
  return {
    ["--spine" as string]: `var(--type-${contentTypeTokenName(contentType)})`,
  } as CSSProperties;
}

/** The type colour as text, for the label that names it on the meta line. */
export function contentTypeTextStyle(contentType: ContentType): CSSProperties {
  return { color: `var(--type-${contentTypeTokenName(contentType)})` };
}

/**
 * The type colour plus its tint, for the chip that names the type on a row's
 * meta line. Colour and background are returned together so the pair can
 * never drift; the `color-mix` tint is the same pattern the row hover uses.
 */
export function contentTypeChipStyle(contentType: ContentType): CSSProperties {
  const token = `var(--type-${contentTypeTokenName(contentType)})`;
  return {
    color: token,
    background: `color-mix(in srgb, ${token} 12%, transparent)`,
  };
}

/**
 * Whether a type's preview should be set in monospace. Reserving mono for
 * content that is actually code-shaped is what makes a JSON capture look
 * different from a sentence at a glance.
 */
const codeShaped = new Set<string>([
  "json",
  "shell",
  "code",
  "sql",
  "html",
  "css",
  "xml",
  "config",
]);

export function isCodeShaped(contentType: string): boolean {
  return codeShaped.has(contentType);
}

/** What a capture's type tile shows: a short glyph, or an icon where no
 *  glyph reads as the thing (a picture, a link, a hidden secret). */
export interface TypeGlyph {
  glyph?: string;
  icon?: "image" | "link" | "lock";
  /** The `--type-*` token the tile is tinted with. */
  token: string;
}

const glyphs: Partial<Record<ContentType, string>> = {
  plain_text: "Aa",
  code: "</>",
  json: "{ }",
  sql: "SQL",
  html: "<>",
  css: "#{}",
  xml: "xml",
  shell: ">_",
  markdown: "#",
  config: "cfg",
};

const SINGLE_URL = /^https?:\/\/\S+$/i;

/** Plain text that is nothing but one address. Shown as a link, since that is
 *  what it is used as; its content type stays plain text everywhere else. */
export function isBareLink(item: { content_type: string; content: string }): boolean {
  return item.content_type === "plain_text" && SINGLE_URL.test(item.content.trim());
}

export function typeGlyph(item: { content_type: string; content: string; private?: boolean }): TypeGlyph {
  // A private capture is identified by being private, not by its type: the
  // tile is the one place that says so before the text is revealed.
  if (item.private) return { icon: "lock", token: "secret" };
  if (item.content_type === "image") return { icon: "image", token: "image" };
  if (isBareLink(item)) return { icon: "link", token: "config" };
  const type = item.content_type as ContentType;
  return { glyph: glyphs[type] ?? "Aa", token: contentTypeTokenName(type) };
}

/** How the detector's language ids are written as names. */
const languageNames: Record<string, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  tsx: "TSX",
  jsx: "JSX",
  python: "Python",
  rust: "Rust",
  go: "Go",
  java: "Java",
  kotlin: "Kotlin",
  swift: "Swift",
  csharp: "C#",
  cpp: "C++",
  c: "C",
  php: "PHP",
  ruby: "Ruby",
  sql: "SQL",
  yaml: "YAML",
  toml: "TOML",
};

/** The type as a row names it: a bare address reads "Link", a detected
 *  language by its proper name ("TypeScript", not "typescript"), everything
 *  else as `itemTypeLabel` says. */
export function displayTypeLabel(item: { content_type: string; content: string; language: string | null }): string {
  if (isBareLink(item)) return "Link";
  const label = itemTypeLabel(item);
  if (item.content_type === "code" && item.language) {
    const id = item.language.toLowerCase();
    return languageNames[id] ?? label.charAt(0).toUpperCase() + label.slice(1);
  }
  return label;
}

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
 * Maps each detected content type to its `--color-type-*` token pair.
 * Types with no dedicated pair (code/sql/html/css/xml/markdown/plain_text)
 * fall back to the plain-text pair per the design-tokens spec.
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

export function contentTypeColorStyle(contentType: ContentType): CSSProperties {
  const name = contentTypeTokenName(contentType);
  return {
    color: `var(--color-type-${name})`,
    backgroundColor: `var(--color-type-${name}-bg)`,
  };
}

/**
 * The type colour as a custom property, for the spine down a row's left edge.
 * A clipboard manager's first question is always "what kind of thing did I
 * copy", so the type is what the list is colour-coded by.
 */
export function contentTypeSpineStyle(contentType: ContentType): CSSProperties {
  return {
    ["--spine" as string]: `var(--color-type-${contentTypeTokenName(contentType)})`,
  } as CSSProperties;
}

/** The type colour as text, for the label that names it on the meta line. */
export function contentTypeTextStyle(contentType: ContentType): CSSProperties {
  return { color: `var(--color-type-${contentTypeTokenName(contentType)})` };
}

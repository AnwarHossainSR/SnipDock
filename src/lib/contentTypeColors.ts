import type { CSSProperties } from "react";
import type { ContentType } from "../api/types";

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

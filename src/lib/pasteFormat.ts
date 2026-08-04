import type { PasteFormat } from "../api/types";

/**
 * Format text content according to the specified paste format.
 */
export function formatForPaste(content: string, format: PasteFormat): string {
  switch (format) {
    case "plain_text":
      return stripFormatting(content);
    case "strip_whitespace":
      return stripWhitespace(content);
    case "preserve":
    default:
      return content;
  }
}

/**
 * Strip HTML formatting and convert to plain text.
 */
function stripFormatting(content: string): string {
  // Remove HTML tags
  let text = content.replace(/<[^>]*>/g, "\n");
  
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  
  // Normalize line breaks
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  
  // Remove excessive blank lines (more than 2 consecutive)
  text = text.replace(/\n{3,}/g, "\n\n");
  
  return text.trim();
}

/**
 * Strip extra whitespace while preserving structure.
 */
function stripWhitespace(content: string): string {
  return content
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Get a human-readable label for the paste format.
 */
export function getPasteFormatLabel(format: PasteFormat): string {
  switch (format) {
    case "plain_text":
      return "Plain text (strip formatting)";
    case "strip_whitespace":
      return "Strip extra whitespace";
    case "preserve":
    default:
      return "Preserve original";
  }
}

/**
 * Get a description for the paste format.
 */
export function getPasteFormatDescription(format: PasteFormat): string {
  switch (format) {
    case "plain_text":
      return "Removes HTML tags and converts to plain text";
    case "strip_whitespace":
      return "Trims lines and removes excess blank lines";
    case "preserve":
    default:
      return "Keeps the original content exactly as captured";
  }
}

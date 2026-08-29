const absoluteFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});
const dayFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "2m ago" / "3h ago" / "Yesterday", falling back to an absolute date beyond that window. */
export function formatRelativeTime(value: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  const elapsed = now.getTime() - date.getTime();

  if (elapsed < MINUTE) return "Just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return dayFormatter.format(date);
}

export function formatAbsoluteTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return absoluteFormatter.format(date);
}

/** A date on its own, for lists where the time of day is not the point. */
export function formatDate(timestamp: string | null, fallback = "never"): string {
  if (!timestamp) return fallback;
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? fallback : dayFormatter.format(parsed);
}

/** A date with its time, for the moment something happened. */
export function formatDateTime(timestamp: string | null, fallback = "never"): string {
  if (!timestamp) return fallback;
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? fallback : absoluteFormatter.format(parsed);
}

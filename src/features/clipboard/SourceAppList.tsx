import { useEffect, useRef, useState } from "react";
import { commands } from "../../api/commands";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { UNKNOWN_SOURCE, useClipboardStore } from "../../stores/clipboardStore";
import type { SourceAppCount } from "../../api/types";

interface SourceAppOption {
  key: string;
  /** Either an executable name or the `UNKNOWN_SOURCE` sentinel. */
  value: string;
  /** What the user sees in the list. "Unknown source" is the friendly form
   *  of the sentinel; named executables are shown verbatim. */
  label: string;
  count: number;
}

const UNKNOWN_LABEL = "Unknown source";

function toOptions(counts: SourceAppCount[]): SourceAppOption[] {
  return counts.map((entry) => {
    if (entry.source_app === null) {
      return {
        key: UNKNOWN_SOURCE,
        value: UNKNOWN_SOURCE,
        label: UNKNOWN_LABEL,
        count: entry.count,
      };
    }
    return {
      key: entry.source_app,
      value: entry.source_app,
      label: entry.source_app,
      count: entry.count,
    };
  });
}

function optionMatchesActive(option: SourceAppOption, active: readonly string[] | null): boolean {
  if (!active || active.length === 0) return false;
  return active.includes(option.value);
}

/**
 * One clickable list of source apps with their counts. Used by both the
 * sidebar's "Sources" section and the toolbar's "Source" filter button so
 * the two views stay aligned. The `dense` variant strips the surrounding
 * panel and the empty-state copy for use inside another surface.
 */
export function SourceAppList({
  active,
  onSelect,
  dense = false,
  className,
}: {
  active: readonly string[] | null;
  onSelect: (value: string | null) => void;
  dense?: boolean;
  className?: string;
}) {
  const [counts, setCounts] = useState<SourceAppCount[] | null>(null);
  // The counts are derived from the stored items, so they have to be re-read
  // whenever those change. Reading them once at mount left the list empty
  // when the sidebar rendered before the first capture, and stale after every
  // later capture, delete, or archive. `items` gets a new identity on each of
  // those paths, so it is the refresh signal.
  const items = useClipboardStore((state) => state.items);
  useEffect(() => {
    let alive = true;
    void commands
      .getSourceAppCounts()
      .then((rows) => {
        if (alive) setCounts(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        // A failed read is the same outcome as "no items" for the user; the
        // empty-state copy is already an invitation to act.
        if (alive) setCounts([]);
      });
    return () => {
      alive = false;
    };
  }, [items]);

  if (counts === null) {
    return dense ? null : (
      <p className={cn("px-3 text-xs leading-relaxed text-muted-foreground", className)}>
        Loading sources…
      </p>
    );
  }

  if (counts.length === 0) {
    return dense ? null : (
      <p className={cn("px-3 text-xs leading-relaxed text-muted-foreground", className)}>
        Sources show up here once you copy something.
      </p>
    );
  }

  const options = toOptions(counts);
  const total = options.reduce((sum, option) => sum + option.count, 0);
  // The bars are proportional to the busiest app, not to the total: against
  // the total every individual app is a sliver and the ranking is lost.
  const max = options.reduce((highest, option) => Math.max(highest, option.count), 0);
  const listClass = dense
    ? "grid min-w-0 gap-0.5"
    : "grid min-w-0 gap-0.5 overflow-y-auto";

  return (
    <ul className={cn(listClass, className)}>
      <li className="min-w-0">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "grid w-full min-w-0 gap-1.5 rounded-md px-3 py-2 text-left text-xs transition-colors",
            active === null
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate">All sources</span>
            <span className="shrink-0 font-mono text-[0.62rem] tabular-nums text-[var(--text-muted)]">
              {total}
            </span>
          </span>
          {/* The aggregate row always reads full, so a single app's bar is
              read against the whole history rather than against nothing. */}
          <SourceBar width={100} tone="all" />
        </button>
      </li>
      {options.map((option) => {
        const selected = optionMatchesActive(option, active);
        return (
          <li key={option.key} className="min-w-0">
            <button
              type="button"
              onClick={() => onSelect(option.value)}
              title={option.label}
              className={cn(
                "grid w-full min-w-0 gap-1.5 rounded-md px-3 py-2 text-left text-xs transition-colors",
                selected
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                <span className="shrink-0 font-mono text-[0.62rem] tabular-nums text-[var(--text-muted)]">
                  {option.count}
                </span>
              </span>
              <SourceBar width={max > 0 ? (option.count / max) * 100 : 0} tone="app" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The proportional bar under a source's label. Which app dominates is the
 *  thing the bare counts never said at a glance. */
function SourceBar({ width, tone }: { width: number; tone: "all" | "app" }) {
  return (
    <span aria-hidden="true" className="block h-[3px] w-full overflow-hidden rounded-[2px] bg-muted">
      <span
        className="block h-full rounded-[2px]"
        style={{
          width: `${Math.max(0, Math.min(100, width))}%`,
          // The aggregate row stays visually dominant: individual apps get a
          // desaturated accent so they read as parts of it.
          background:
            tone === "all"
              ? "var(--accent)"
              : "color-mix(in srgb, var(--accent) 60%, var(--surface-2))",
        }}
      />
    </span>
  );
}

/**
 * The toolbar's "Source" filter button. Renders the active selection as the
 * label; opens a small popover with the shared source-app list when clicked.
 * The popover is a plain div anchored under the button so no popover
 * primitive has to be introduced for a single use site.
 */
export function SourceFilterButton({ className }: { className?: string }) {
  const sourceApps = useClipboardStore((state) => state.sourceApps);
  const setSourceApps = useClipboardStore((state) => state.setSourceApps);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocumentPointer(event: PointerEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDocumentPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = sourceApps && sourceApps.length > 0 ? sourceApps[0] : null;
  const label = active === null
    ? "All sources"
    : active === UNKNOWN_SOURCE
      ? UNKNOWN_LABEL
      : active;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Button
        className="h-8 gap-1.5 rounded-sm px-2.5 text-xs font-semibold text-muted-foreground transition-[background-color,color,box-shadow] hover:bg-card/70 hover:text-foreground aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-[var(--shadow-panel)] aria-pressed:ring-1 aria-pressed:ring-primary/25"
        variant="ghost"
        size="sm"
        type="button"
        aria-pressed={active !== null}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        title="Filter the history by the application that produced each capture"
      >
        <span className="text-[var(--text-muted)]">Source</span>
        <span className="max-w-[10rem] truncate">{label}</span>
      </Button>
      {open && (
        <div
          role="group"
          aria-label="Filter by source application"
          className="absolute left-0 top-[calc(100%+0.4rem)] z-30 w-64 max-h-80 overflow-y-auto rounded-md border border-border bg-card p-1 shadow-[var(--shadow-panel)]"
        >
          <SourceAppList
            dense
            active={sourceApps}
            onSelect={(value) => {
              setSourceApps(value === null ? null : [value]);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

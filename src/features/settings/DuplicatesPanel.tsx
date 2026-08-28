import { useCallback, useEffect, useState } from "react";
import { commands } from "../../api/commands";
import type { DuplicateGroup, DuplicateItem } from "../../api/types";
import { Button } from "@/components/ui/button";

/**
 * The copy that is kept: the one used most, and among equals the oldest, so a
 * merge never throws away the row the rest of the history already points at.
 */
function keeperOf(group: DuplicateGroup): DuplicateItem {
  return group.items.reduce((best, candidate) => {
    if (candidate.usage_count !== best.usage_count) {
      return candidate.usage_count > best.usage_count ? candidate : best;
    }
    return candidate.created_at < best.created_at ? candidate : best;
  }, group.items[0]);
}

function labelOf(item: DuplicateItem): string {
  const title = item.title?.trim();
  if (title) return title;
  return item.content_type === "image" ? "Captured image" : "Untitled capture";
}

function formatWhen(timestamp: string): string {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? timestamp : parsed.toLocaleString();
}

export default function DuplicatesPanel({ className }: { className?: string }) {
  const [groupCount, setGroupCount] = useState<number | null>(null);
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [merged, setMerged] = useState(0);

  const refreshCount = useCallback(async () => {
    try {
      setGroupCount(await commands.getDuplicateCount());
    } catch {
      // A count that cannot be read is not worth an error banner: the Review
      // button below reports the same failure with something to act on.
      setGroupCount(null);
    }
  }, []);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  async function review() {
    setBusy(true);
    setError("");
    try {
      setGroups(await commands.findDuplicates());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not look for duplicates.");
    } finally {
      setBusy(false);
    }
  }

  async function merge(group: DuplicateGroup) {
    const keeper = keeperOf(group);
    const rest = group.items.filter((item) => item.id !== keeper.id).map((item) => item.id);
    if (rest.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const removed = await commands.mergeDuplicates(keeper.id, rest);
      setMerged((count) => count + removed);
      setGroups((current) =>
        (current ?? []).filter((entry) => entry.content_hash !== group.content_hash),
      );
      await refreshCount();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Those copies could not be merged.");
    } finally {
      setBusy(false);
    }
  }

  async function mergeAll() {
    const pending = groups ?? [];
    setBusy(true);
    setError("");
    let removed = 0;
    try {
      for (const group of pending) {
        const keeper = keeperOf(group);
        const rest = group.items.filter((item) => item.id !== keeper.id).map((item) => item.id);
        if (rest.length > 0) removed += await commands.mergeDuplicates(keeper.id, rest);
      }
      setGroups([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Some copies could not be merged.");
      // Whatever did go through is already gone, so re-read rather than
      // leaving the list claiming groups that no longer exist.
      try {
        setGroups(await commands.findDuplicates());
      } catch {
        setGroups(null);
      }
    } finally {
      setMerged((count) => count + removed);
      setBusy(false);
      await refreshCount();
    }
  }

  const summary =
    groupCount === null
      ? "SnipDock groups captures that hold exactly the same content."
      : groupCount === 0
        ? "No repeated captures. Nothing to merge."
        : `${groupCount} ${groupCount === 1 ? "group of copies" : "groups of copies"} in your history.`;

  return (
    <section className={className} aria-labelledby="settings-duplicates">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.06em] text-primary">Duplicates</span>
          <h3 className="mt-1 text-xl font-semibold tracking-tight" id="settings-duplicates">
            Repeated captures
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{summary}</p>
        </div>
        {groupCount !== null && groupCount > 0 && (
          <span className="rounded-sm border border-border bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
            {groupCount}
          </span>
        )}
      </header>

      <p className="m-0 text-sm leading-relaxed text-muted-foreground">
        Merging keeps the copy you have used most and folds the others into it, adding their use
        counts together. The copies are moved to the trash, not erased.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void review()}>
          {busy ? "Working…" : "Review duplicates"}
        </Button>
        {groups && groups.length > 0 && (
          <Button type="button" disabled={busy} onClick={() => void mergeAll()}>
            Merge all {groups.length}
          </Button>
        )}
        {merged > 0 && (
          <span className="text-xs text-muted-foreground">
            {merged} {merged === 1 ? "copy" : "copies"} merged
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}

      {groups && groups.length === 0 && (
        <p className="m-0 text-sm text-muted-foreground">Nothing repeated is left in your history.</p>
      )}

      {groups && groups.length > 0 && (
        <ul className="grid gap-2" aria-label="Duplicate groups">
          {groups.map((group) => {
            const keeper = keeperOf(group);
            return (
              <li
                key={group.content_hash}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-sm border border-border bg-muted px-3 py-2.5"
              >
                <div className="grid min-w-0 gap-0.5">
                  <span className="truncate text-sm font-semibold text-foreground">{labelOf(keeper)}</span>
                  <span className="text-xs text-muted-foreground">
                    {group.count} copies · keeping the one from {formatWhen(keeper.created_at)} ·{" "}
                    {keeper.usage_count} {keeper.usage_count === 1 ? "use" : "uses"}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void merge(group)}
                >
                  Merge {group.count - 1}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

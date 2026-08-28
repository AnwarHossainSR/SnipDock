import { useCallback, useEffect, useState } from "react";
import { commands } from "../../api/commands";
import type { StoredImage } from "../../api/types";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { formatBytes } from "../../lib/formatBytes";

interface ImageBulkBarProps {
  /** Removes the deleted rows from the list and raises the undo toast. */
  onDelete: (ids: string[]) => Promise<void>;
  busy: boolean;
}

function formatWhen(timestamp: string): string {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? timestamp : parsed.toLocaleDateString();
}

/**
 * Shown only under the Images filter. Image files are what fill the disk, and
 * the history list sorts by date, so the biggest ones can sit pages deep. This
 * lists them by size and deletes the ones ticked, through the same undoable
 * path the list's own delete uses.
 */
export default function ImageBulkBar({ onDelete, busy }: ImageBulkBarProps) {
  const [imageBytes, setImageBytes] = useState<number | null>(null);
  const [largest, setLargest] = useState<StoredImage[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refreshSize = useCallback(() => {
    void commands.getStorageSize().then(
      (size) => setImageBytes(size?.images_bytes ?? null),
      () => setImageBytes(null),
    );
  }, []);

  useEffect(refreshSize, [refreshSize]);

  async function review() {
    if (largest) {
      setLargest(null);
      setPicked(new Set());
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await commands.largestImages(10);
      setLargest(Array.isArray(result) ? result : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The images could not be measured.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deletePicked() {
    if (picked.size === 0) return;
    setLoading(true);
    setError("");
    try {
      await onDelete([...picked]);
      setLargest((current) => (current ?? []).filter((entry) => !picked.has(entry.id)));
      setPicked(new Set());
      refreshSize();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Those images could not be deleted.");
    } finally {
      setLoading(false);
    }
  }

  const pickedBytes = (largest ?? [])
    .filter((entry) => picked.has(entry.id))
    .reduce((total, entry) => total + entry.bytes, 0);

  return (
    <div className="mb-3 grid gap-2 rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-panel)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[0.7rem] font-bold uppercase tracking-[0.06em] text-[var(--color-text-subtle)]">
          Images on disk
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {imageBytes === null ? "—" : formatBytes(imageBytes)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={loading || busy}
          onClick={() => void review()}
        >
          {largest ? "Hide largest" : loading ? "Measuring…" : "Review largest"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="m-0 text-xs text-destructive">
          {error}
        </p>
      )}

      {largest && largest.length === 0 && (
        <p className="m-0 text-xs text-muted-foreground">No images are stored.</p>
      )}

      {largest && largest.length > 0 && (
        <>
          <ul className="grid gap-0.5" aria-label="Largest images">
            {largest.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-sm px-1 py-1 hover:bg-muted"
              >
                <CheckboxField
                  checked={picked.has(entry.id)}
                  onCheckedChange={() => toggle(entry.id)}
                  disabled={busy}
                  label={<span className="text-xs">Captured {formatWhen(entry.created_at)}</span>}
                />
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {formatBytes(entry.bytes)}
                </span>
              </li>
            ))}
          </ul>
          {/* Nothing ticked is not a state that needs a disabled "Delete 0
              images" sitting there; the row simply is not offered yet. */}
          {picked.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy || loading}
                onClick={() => void deletePicked()}
              >
                Delete {picked.size} {picked.size === 1 ? "image" : "images"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Frees {formatBytes(pickedBytes)} · undoable for 30 seconds
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

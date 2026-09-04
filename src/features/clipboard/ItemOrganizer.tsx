import { useCallback, useEffect, useState } from "react";
import { commands } from "../../api/commands";
import type { LibraryItem, Project, Tag } from "../../api/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useClipboardStore } from "../../stores/clipboardStore";

/** New tags cycle through these so a fresh label is never colourless. */
const TAG_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6"];

const expiryOptions = [
  { value: "", label: "Never" },
  { value: "60", label: "1 hour" },
  { value: "1440", label: "1 day" },
  { value: "10080", label: "1 week" },
] as const;

/** The column stores UTC RFC 3339, which is what `toISOString` produces. */
function expiryTimestamp(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function describeExpiry(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const at = new Date(expiresAt);
  if (Number.isNaN(at.getTime())) return null;
  const minutes = Math.round((at.getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return "Due to be removed on the next sweep";
  if (minutes < 60) return `Removed in ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Removed in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `Removed in ${Math.round(hours / 24)} days`;
}

/**
 * Tags and project for one capture, inside the inspector's Details tab. Both
 * write straight through and replace the item in the store, so the sidebar
 * lists and the row itself follow without a reload.
 */
export default function ItemOrganizer({ item }: { item: LibraryItem }) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const replaceItem = useClipboardStore((state) => state.replaceItem);

  const refresh = useCallback(() => {
    void commands.listTags().then(
      (result) => setTags(Array.isArray(result) ? result : []),
      () => {},
    );
    void commands.listProjects().then(
      (result) => setProjects(Array.isArray(result) ? result : []),
      () => {},
    );
  }, []);

  useEffect(refresh, [refresh]);

  async function setItemTags(tagIds: string[]) {
    setBusy(true);
    setError("");
    try {
      replaceItem(await commands.setItemTags(item.id, tagIds));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That tag could not be applied.");
    } finally {
      setBusy(false);
    }
  }

  function toggleTag(tagId: string) {
    const next = item.tag_ids.includes(tagId)
      ? item.tag_ids.filter((id) => id !== tagId)
      : [...item.tag_ids, tagId];
    void setItemTags(next);
  }

  async function createTag() {
    const name = newTag.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      const tag = await commands.saveTag({
        name,
        color: TAG_COLORS[tags.length % TAG_COLORS.length],
      });
      setNewTag("");
      setCreating(false);
      refresh();
      // A tag made from this capture is meant for it, so apply it at once.
      replaceItem(await commands.setItemTags(item.id, [...item.tag_ids, tag.id]));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That tag could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function setExpiry(value: string) {
    setBusy(true);
    setError("");
    try {
      replaceItem(
        await commands.setItemExpiry(item.id, value ? expiryTimestamp(Number(value)) : null),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That timer could not be set.");
    } finally {
      setBusy(false);
    }
  }

  async function moveTo(projectId: string) {
    setBusy(true);
    setError("");
    try {
      replaceItem(await commands.moveItem(item.id, projectId || null));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That capture could not be filed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 grid gap-3 border-t border-border pt-3">
      <div className="grid gap-1.5">
        <span className="text-[0.62rem] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
          Tags
        </span>
        {tags.length === 0 && !creating && (
          <p className="m-0 text-xs text-muted-foreground">No tags yet.</p>
        )}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tags on this capture">
            {tags.map((tag) => {
              const on = item.tag_ids.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={on}
                  disabled={busy}
                  onClick={() => toggleTag(tag.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                    on
                      ? "border-[var(--accent)] bg-accent font-semibold text-primary"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="size-[0.4rem] shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color || "var(--accent)" }}
                  />
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
        {creating ? (
          <div className="flex items-center gap-1.5">
            <input
              aria-label="New tag name"
              className="min-h-7 min-w-0 flex-1 rounded-sm border border-border bg-muted px-2 py-1 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              value={newTag}
              autoFocus
              disabled={busy}
              placeholder="release-notes"
              onChange={(event) => setNewTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void createTag();
                if (event.key === "Escape") {
                  setCreating(false);
                  setNewTag("");
                }
              }}
            />
            <Button type="button" size="sm" disabled={busy || newTag.trim().length === 0} onClick={() => void createTag()}>
              Add
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-self-start"
            disabled={busy}
            onClick={() => setCreating(true)}
          >
            New tag
          </Button>
        )}
      </div>

      {projects.length > 0 && (
        <div className="grid gap-1.5">
          <label
            className="text-[0.62rem] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]"
            htmlFor={`inspector-project-${item.id}`}
          >
            Project
          </label>
          <select
            id={`inspector-project-${item.id}`}
            className="min-h-8 w-full rounded-sm border border-border bg-muted px-2 py-1 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            value={item.project_id ?? ""}
            disabled={busy}
            onChange={(event) => void moveTo(event.target.value)}
          >
            <option value="">Not filed</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-1.5">
        <span className="text-[0.62rem] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
          Delete itself after
        </span>
        {/* Buttons rather than a select: the stored value is an absolute time,
            so no option can honestly claim to be the one currently chosen. The
            line underneath says what is actually set. */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Delete itself after">
          {expiryOptions.map((option) => (
            <button
              key={option.label}
              type="button"
              disabled={busy}
              aria-pressed={option.value === "" && !item.expires_at}
              onClick={() => void setExpiry(option.value)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                option.value === "" && !item.expires_at
                  ? "border-[var(--accent)] bg-accent font-semibold text-primary"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="m-0 text-[0.68rem] leading-snug text-muted-foreground">
          {describeExpiry(item.expires_at) ??
            "A timer set here removes the capture for good, pinned or not."}
        </p>
      </div>

      {error && (
        <p role="alert" className="m-0 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

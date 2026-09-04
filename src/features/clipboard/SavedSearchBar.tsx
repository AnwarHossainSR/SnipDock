import { useState } from "react";
import { commands } from "../../api/commands";
import { Button } from "@/components/ui/button";
import { savableQuery, useClipboardStore } from "../../stores/clipboardStore";

interface SavedSearchBarProps {
  /** The naming form is opened from the header, so its state lives up there. */
  naming: boolean;
  onNamingChange: (naming: boolean) => void;
}

/**
 * Says which saved search is open, and names a new one. It renders nothing
 * while there is neither, so the filter row is not shadowed by an empty band.
 */
export default function SavedSearchBar({ naming, onNamingChange }: SavedSearchBarProps) {
  const filter = useClipboardStore((state) => state.filter);
  const savedSearch = useClipboardStore((state) => state.savedSearch);
  const applySavedSearch = useClipboardStore((state) => state.applySavedSearch);
  const clearSavedSearch = useClipboardStore((state) => state.clearSavedSearch);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setError("");
    try {
      const folder = await commands.saveSmartFolder({
        name: trimmed,
        query: savableQuery(filter),
      });
      onNamingChange(false);
      setName("");
      // Opening it straight away both shows the result and tells the sidebar
      // to re-read its list.
      applySavedSearch({
        id: folder.id,
        name: folder.name,
        query: folder.query,
        source: "folder",
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That search could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      await commands.deleteSmartFolder(id);
      clearSavedSearch();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That search could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    onNamingChange(false);
    setName("");
  }

  if (savedSearch) {
    const eyebrow =
      savedSearch.source === "tag"
        ? "Tag"
        : savedSearch.source === "project"
          ? "Project"
          : "Saved search";
    return (
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--accent)] bg-accent px-3 py-2">
        <span className="text-[0.7rem] font-bold uppercase tracking-[0.06em] text-primary">
          {eyebrow}
        </span>
        <span className="text-sm font-semibold text-foreground">{savedSearch.name}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={clearSavedSearch}>
            Close
          </Button>
          {savedSearch.source === "folder" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void remove(savedSearch.id)}
            >
              Delete
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="m-0 w-full text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (!naming) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-[var(--shadow-panel)]">
      <label className="text-[0.7rem] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]" htmlFor="saved-search-name">
        Name this view
      </label>
      <input
        id="saved-search-name"
        className="min-h-8 flex-1 rounded-sm border border-border bg-muted px-3 py-1.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        value={name}
        autoFocus
        disabled={busy}
        placeholder="Screenshots from this week"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void save();
          if (event.key === "Escape") cancel();
        }}
      />
      <Button type="button" size="sm" disabled={busy || name.trim().length === 0} onClick={() => void save()}>
        Save
      </Button>
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={cancel}>
        Cancel
      </Button>
      {error && (
        <p role="alert" className="m-0 w-full text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

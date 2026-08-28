import { useState } from "react";
import { commands } from "../../api/commands";
import { Button } from "@/components/ui/button";
import { savableQuery, useClipboardStore } from "../../stores/clipboardStore";

/**
 * Turns whichever filter is showing into a saved search, and says which saved
 * search is open. It sits above the filters because that is what a folder is
 * made of: the row reads as "this view, kept".
 */
export default function SavedSearchBar() {
  const filter = useClipboardStore((state) => state.filter);
  const savedSearch = useClipboardStore((state) => state.savedSearch);
  const applySavedSearch = useClipboardStore((state) => state.applySavedSearch);
  const clearSavedSearch = useClipboardStore((state) => state.clearSavedSearch);
  const [naming, setNaming] = useState(false);
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
      setNaming(false);
      setName("");
      // Opening it straight away both shows the result and tells the sidebar
      // to re-read its list.
      applySavedSearch({ id: folder.id, name: folder.name, query: folder.query });
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

  if (savedSearch) {
    return (
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border-accent)] bg-accent px-3 py-2">
        <span className="text-[0.7rem] font-bold uppercase tracking-[0.06em] text-primary">
          Saved search
        </span>
        <span className="text-sm font-semibold text-foreground">{savedSearch.name}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={clearSavedSearch}>
            Close
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void remove(savedSearch.id)}
          >
            Delete
          </Button>
        </div>
        {error && (
          <p role="alert" className="m-0 w-full text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (!naming) {
    return (
      <div className="mb-3 flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={() => setNaming(true)}>
          Save this view
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-[var(--shadow-panel)]">
      <label className="text-[0.7rem] font-bold uppercase tracking-[0.06em] text-[var(--color-text-subtle)]" htmlFor="saved-search-name">
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
          if (event.key === "Escape") {
            setNaming(false);
            setName("");
          }
        }}
      />
      <Button type="button" size="sm" disabled={busy || name.trim().length === 0} onClick={() => void save()}>
        Save
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => {
          setNaming(false);
          setName("");
        }}
      >
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

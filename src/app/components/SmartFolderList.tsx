import { useCallback, useEffect, useState } from "react";
import { commands } from "../../api/commands";
import type { SmartFolder } from "../../api/types";
import { cn } from "@/lib/utils";
import { useClipboardStore } from "../../stores/clipboardStore";

/**
 * The saved searches, listed under Pinned. Opening one hands its query to the
 * history view; the Clipboard page shows which folder is open and how to leave
 * it. Creating and deleting happens there too, beside the filters the folder
 * is made from.
 */
export default function SmartFolderList() {
  const [folders, setFolders] = useState<SmartFolder[]>([]);
  const savedSearch = useClipboardStore((state) => state.savedSearch);
  const applySavedSearch = useClipboardStore((state) => state.applySavedSearch);

  const refresh = useCallback(() => {
    void commands.listSmartFolders().then(
      (result) => setFolders(Array.isArray(result) ? result : []),
      () => {},
    );
  }, []);

  useEffect(() => {
    refresh();
    // Saving or deleting a folder happens on the Clipboard page, which sets
    // `savedSearch`; re-reading on that change keeps this list current without
    // a second channel between the two.
    const unsubscribe = useClipboardStore.subscribe((state) => state.savedSearch, refresh);
    return unsubscribe;
  }, [refresh]);

  if (folders.length === 0) return null;

  return (
    <div className="mt-5 grid min-h-0 min-w-0 gap-1 max-[47rem]:hidden">
      <p className="flex items-center gap-2 px-3 text-[0.62rem] font-bold uppercase tracking-[0.06em] text-[var(--color-text-subtle)]">
        Saved searches
        <span className="rounded-full bg-muted px-1.5 font-mono text-[0.6rem] tabular-nums text-muted-foreground">
          {folders.length}
        </span>
      </p>
      <ul className="grid min-w-0 gap-0.5 overflow-y-auto">
        {folders.map((folder) => {
          const open = savedSearch?.id === folder.id;
          return (
            <li key={folder.id} className="min-w-0">
              <button
                type="button"
                aria-current={open ? "true" : undefined}
                onClick={() =>
                  applySavedSearch({
                    id: folder.id,
                    name: folder.name,
                    query: folder.query,
                    source: "folder",
                  })
                }
                title={folder.description ?? folder.name}
                className={cn(
                  "flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-3 text-left text-xs transition-colors",
                  open
                    ? "bg-accent font-semibold text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-[0.4rem] shrink-0 rounded-full"
                  style={{ backgroundColor: folder.color || "var(--color-accent)" }}
                />
                <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

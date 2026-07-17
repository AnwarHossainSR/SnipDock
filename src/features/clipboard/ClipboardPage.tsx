import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { commands } from "../../lib/commands";
import type { LibraryItem, SearchQuery } from "../../lib/types";
import ClipboardItem from "./ClipboardItem";

const clipboardQuery: SearchQuery = {
  text: null,
  kinds: ["clipboard"],
  content_types: [],
  languages: [],
  project_ids: [],
  category_ids: [],
  tag_ids: [],
  pinned: null,
  favorite: null,
  created_from: null,
  created_to: null,
  sort: "newest",
  limit: 100,
  offset: 0,
};

type HistoryState =
  | { status: "loading"; items: LibraryItem[]; total: number }
  | { status: "ready"; items: LibraryItem[]; total: number }
  | { status: "error"; items: LibraryItem[]; total: number };

function ContentState({ status }: { status: "loading" | "empty" | "error" }) {
  if (status === "loading") {
    return (
      <div className="content-state" role="status" aria-busy="true">
        <span className="loading-ring" aria-hidden="true" />
        <p>Loading history…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="content-state content-state-error" role="alert">
        <span className="state-mark" aria-hidden="true">
          !
        </span>
        <div>
          <h3>Clipboard history unavailable</h3>
          <p>Close and reopen SnipDock to try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-state" role="status">
      <span className="empty-dock" aria-hidden="true">
        <span />
      </span>
      <div>
        <h3>Your clipboard is quiet</h3>
        <p>Copy text and it will appear here, ready when you need it.</p>
      </div>
    </div>
  );
}

export default function ClipboardPage({
  trackingPaused = false,
}: {
  trackingPaused?: boolean;
}) {
  const [history, setHistory] = useState<HistoryState>({
    status: "loading",
    items: [],
    total: 0,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    commands.searchItems(clipboardQuery).then(
      (result) => {
        if (!active) return;
        setHistory({ status: "ready", items: result.items, total: result.total });
        setSelectedId((current) =>
          result.items.some((item) => item.id === current)
            ? current
            : (result.items[0]?.id ?? null),
        );
      },
      () => {
        if (active) setHistory({ status: "error", items: [], total: 0 });
      },
    );

    return () => {
      active = false;
    };
  }, []);

  function selectByKeyboard(
    event: KeyboardEvent<HTMLDivElement>,
    currentIndex: number,
  ) {
    let nextIndex = currentIndex;

    if (event.key === "ArrowDown") {
      nextIndex = Math.min(currentIndex + 1, history.items.length - 1);
    } else if (event.key === "ArrowUp") {
      nextIndex = Math.max(currentIndex - 1, 0);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = history.items.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextItem = history.items[nextIndex];
    if (!nextItem) return;
    setSelectedId(nextItem.id);
    document.getElementById(`clipboard-item-${nextItem.id}`)?.focus();
  }

  const hasItems = history.status === "ready" && history.items.length > 0;

  return (
    <main className="workspace-content">
      <header className="content-heading">
        <div>
          <p>Clipboard history</p>
          <h2 id="workspace-title">Recent captures</h2>
        </div>
        <div className="history-summary">
          <span className={trackingPaused ? "tracking-status paused" : "tracking-status"}>
            <span aria-hidden="true" />
            {trackingPaused ? "Tracking paused" : "Tracking active"}
          </span>
          <span className="item-count">
            {history.total} {history.total === 1 ? "item" : "items"}
          </span>
        </div>
      </header>
      <section
        className={hasItems ? "content-panel clipboard-panel has-items" : "content-panel clipboard-panel"}
        aria-label="Recent clipboard items"
      >
        {history.status === "loading" && <ContentState status="loading" />}
        {history.status === "error" && <ContentState status="error" />}
        {history.status === "ready" && history.items.length === 0 && (
          <ContentState status="empty" />
        )}
        {hasItems && (
          <div className="clipboard-list" role="listbox" aria-label="Clipboard history">
            {history.items.map((item, index) => (
              <ClipboardItem
                item={item}
                selected={item.id === selectedId}
                onSelect={() => setSelectedId(item.id)}
                onKeyDown={(event) => selectByKeyboard(event, index)}
                key={item.id}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

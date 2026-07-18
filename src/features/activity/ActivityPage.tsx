import { useEffect, useMemo, useState } from "react";
import { commands } from "../../lib/commands";
import type { LibraryItem, SearchQuery } from "../../lib/types";
import Recommendations from "./Recommendations";

const baseQuery: SearchQuery = {
  text: null,
  kinds: [],
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

function title(item: LibraryItem) {
  return item.title?.trim() || item.content.slice(0, 48) || "Untitled";
}

export default function ActivityPage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    commands.searchItems(baseQuery).then(
      (page) => setItems(page.items),
      () => setError("Activity unavailable."),
    );
  }, []);

  const mostUsed = useMemo(
    () => [...items].sort((a, b) => b.usage_count - a.usage_count || b.updated_at.localeCompare(a.updated_at)).slice(0, 5),
    [items],
  );
  const duplicates = useMemo(() => {
    const seen = new Map<string, LibraryItem>();
    return items.filter((item) => {
      const key = item.content.trim();
      if (!key || !seen.has(key)) {
        seen.set(key, item);
        return false;
      }
      return true;
    });
  }, [items]);

  async function archiveDuplicate(item: LibraryItem) {
    if (!window.confirm("Archive this exact duplicate?")) return;
    await commands.setItemFlags(item.id, { pinned: null, favorite: null, archived: true });
    setItems((current) => current.filter((entry) => entry.id !== item.id));
  }

  return (
    <main className="workspace-content">
      <header className="content-heading">
        <div>
          <p>Activity</p>
          <h2 id="workspace-title" tabIndex={-1}>Usage and cleanup</h2>
        </div>
      </header>
      {error && <p className="action-error" role="alert">{error}</p>}
      <section className="activity-layout">
        <Recommendations items={mostUsed} />
        <section className="template-preview" aria-label="Recent activity">
          <h3>Recent items</h3>
          <div className="activity-list">
            {items.slice(0, 12).map((item) => (
              <article className="activity-item" key={item.id}>
                <strong>{title(item)}</strong>
                <span>{item.kind} - {item.usage_count} uses</span>
              </article>
            ))}
          </div>
        </section>
        <section className="template-preview" aria-label="Duplicate items">
          <h3>Exact duplicates</h3>
          {duplicates.length === 0 ? (
            <p className="template-preview__note">No exact duplicates found.</p>
          ) : duplicates.map((item) => (
            <article className="activity-item" key={item.id}>
              <strong>{title(item)}</strong>
              <button type="button" className="button-secondary" onClick={() => void archiveDuplicate(item)}>
                Archive duplicate
              </button>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}

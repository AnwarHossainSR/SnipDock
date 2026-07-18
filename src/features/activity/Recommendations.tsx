import type { LibraryItem } from "../../lib/types";

interface RecommendationsProps {
  items: LibraryItem[];
}

function title(item: LibraryItem) {
  return item.title?.trim() || item.content.slice(0, 40) || "Untitled";
}

export default function Recommendations({ items }: RecommendationsProps) {
  return (
    <section className="template-fill" aria-label="Recommendations">
      <h3>Recommendations</h3>
      {items.length === 0 ? (
        <p className="template-preview__note">Copy snippets to build recommendations.</p>
      ) : (
        <div className="activity-list">
          {items.map((item) => (
            <article className="activity-item" key={item.id}>
              <strong>{title(item)}</strong>
              <span>{item.usage_count} uses</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

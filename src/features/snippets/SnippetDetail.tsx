import ItemActions from "../../components/ItemActions";
import type { LibraryItem } from "../../api/types";
import CodeView from "./CodeView";
import PrivateSnippetDialog from "./PrivateSnippetDialog";
import SensitivePreview, { findSecrets } from "./SensitivePreview";

const CODE_CONTENT_TYPES = new Set(["code", "json", "sql", "html", "css", "xml", "shell"]);

function itemTitle(item: LibraryItem) {
  return item.title?.trim() || item.kind[0].toUpperCase() + item.kind.slice(1);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

interface SnippetDetailProps {
  item: LibraryItem;
  busy: boolean;
  destructiveDisabled: boolean;
  onCopy: () => void;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export default function SnippetDetail({
  item,
  busy,
  destructiveDisabled,
  onCopy,
  onTogglePin,
  onToggleFavorite,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
}: SnippetDetailProps) {
  const sensitive = findSecrets(item.content).length > 0;
  return (
    <article className="snippet-detail">
      <header className="snippet-detail__header">
        <div>
          <span className="snippet-detail__kind">{item.kind}</span>
          <h3>{itemTitle(item)}</h3>
        </div>
        <ItemActions
          item={item}
          busy={busy}
          deleteDisabled={destructiveDisabled}
          archiveDisabled={destructiveDisabled}
          onCopy={onCopy}
          onTogglePin={onTogglePin}
          onToggleFavorite={onToggleFavorite}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onToggleArchive={onArchive}
          onDelete={onDelete}
        />
      </header>
      <div className="snippet-detail__usage">
        <PrivateSnippetDialog item={item} onMakePrivate={onEdit} />
      </div>
      {item.description && <p className="snippet-detail__description">{item.description}</p>}
      {sensitive
        ? <SensitivePreview content={item.content} busy={busy} onCopyRaw={onCopy} />
        : CODE_CONTENT_TYPES.has(item.content_type)
        ? (
          <CodeView
            content={item.content}
            language={item.language ?? item.content_type}
          />
        )
        : <pre className="snippet-detail__content">{item.content}</pre>}
      {item.notes && (
        <section className="snippet-detail__notes" aria-label="Notes">
          <h4>Notes</h4>
          <p>{item.notes}</p>
        </section>
      )}
      <footer className="snippet-detail__usage">
        <span>Used {item.usage_count} {item.usage_count === 1 ? "time" : "times"}</span>
        {item.last_used_at && (
          <span>
            Last used <time dateTime={item.last_used_at}>{formatDate(item.last_used_at)}</time>
          </span>
        )}
      </footer>
    </article>
  );
}

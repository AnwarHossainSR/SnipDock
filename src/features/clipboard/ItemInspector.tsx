import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import ItemThumbnail from "../../components/ItemThumbnail";
import type { LibraryItem, PasteFormat } from "../../api/types";

const contentTypeLabels = {
  plain_text: "Plain text",
  code: "Code",
  json: "JSON",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  xml: "XML",
  shell: "Shell",
  markdown: "Markdown",
  config: "Config",
  image: "Image",
} as const;

const pasteFormatLabels: Record<PasteFormat, string> = {
  preserve: "Preserve original",
  plain_text: "Plain text",
  strip_whitespace: "Strip extra whitespace",
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const factRow = "flex items-baseline justify-between gap-3 border-b border-dashed border-border pb-1 last:border-0";
const factLabel = "text-[0.7rem] text-[var(--color-text-subtle)]";
const factValue = "font-mono text-[0.7rem] tabular-nums text-muted-foreground";

interface ItemInspectorProps {
  item: LibraryItem | null;
  busy: boolean;
  revealed: boolean;
  pasteFormat: PasteFormat | null;
  onReveal: () => void;
  onCopy: () => void;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
}

/**
 * Detail pane beside the history list: the whole item, its metadata, and its
 * actions, without leaving the list or opening a dialog.
 */
export default function ItemInspector({
  item,
  busy,
  revealed,
  pasteFormat,
  onReveal,
  onCopy,
  onTogglePin,
  onToggleFavorite,
}: ItemInspectorProps) {
  const stats = useMemo(() => {
    if (!item || item.content_type === "image") return null;
    return {
      characters: item.content.length,
      lines: item.content.split("\n").length,
    };
  }, [item]);

  if (!item) {
    return (
      <aside
        className="hidden min-w-0 flex-col rounded-lg border border-border bg-card min-[64rem]:flex"
        aria-label="Item detail"
      >
        <p className="m-0 p-5 text-sm text-muted-foreground">
          Select a capture to see all of it here.
        </p>
      </aside>
    );
  }

  const typeLabel = item.content_type === "code" && item.language
    ? item.language
    : contentTypeLabels[item.content_type];
  const hidden = item.private && !revealed;

  return (
    <aside
      className="hidden min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card min-[64rem]:flex"
      aria-label="Item detail"
    >
      <header className="grid gap-1 border-b border-border p-4">
        <h3 className="m-0 font-display text-sm font-semibold tracking-[-0.02em]">{typeLabel} capture</h3>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[0.64rem] text-[var(--color-text-subtle)]">
          <time dateTime={item.created_at}>{dateFormatter.format(new Date(item.created_at))}</time>
          {item.pinned && <span className="rounded-full bg-[var(--color-chip)] px-2 py-0.5 font-bold uppercase">Pinned</span>}
          {item.favorite && <span className="rounded-full bg-[var(--color-chip)] px-2 py-0.5 font-bold uppercase">Favorite</span>}
          {item.private && (
            <span className="rounded-full px-2 py-0.5 font-bold uppercase text-[var(--color-warning)] [background:color-mix(in_srgb,var(--color-warning)_16%,transparent)]">
              {revealed ? "Revealed" : "Sensitive"}
            </span>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {item.content_type === "image" ? (
          <ItemThumbnail item={item} />
        ) : hidden ? (
          <div className="grid gap-3 rounded-sm border border-border bg-muted p-4 text-center">
            <p className="m-0 text-xs text-muted-foreground">
              Hidden because this looks like a credential.
            </p>
            <Button variant="outline" size="sm" type="button" onClick={onReveal}>
              Reveal
            </Button>
          </div>
        ) : (
          <pre className="m-0 max-w-full overflow-x-auto whitespace-pre-wrap rounded-sm border border-border bg-muted p-3 font-mono text-xs leading-relaxed [overflow-wrap:anywhere]">
            {item.content}
          </pre>
        )}

        <dl className="mt-4 grid gap-1.5">
          {stats && (
            <>
              <div className={factRow}>
                <dt className={factLabel}>Characters</dt>
                <dd className={`m-0 ${factValue}`}>{stats.characters.toLocaleString()}</dd>
              </div>
              <div className={factRow}>
                <dt className={factLabel}>Lines</dt>
                <dd className={`m-0 ${factValue}`}>{stats.lines.toLocaleString()}</dd>
              </div>
            </>
          )}
          <div className={factRow}>
            <dt className={factLabel}>Copied</dt>
            <dd className={`m-0 ${factValue}`}>{item.usage_count}×</dd>
          </div>
          {item.language && (
            <div className={factRow}>
              <dt className={factLabel}>Language</dt>
              <dd className={`m-0 ${factValue}`}>{item.language}</dd>
            </div>
          )}
        </dl>
      </div>

      <footer className="grid gap-2 border-t border-border p-4">
        {pasteFormat && (
          <p className="m-0 text-[0.68rem] text-[var(--color-text-subtle)]">
            Pasting as <span className="font-mono text-muted-foreground">{pasteFormatLabels[pasteFormat]}</span>.{" "}
            <a className="text-primary hover:underline" href="#settings">Change</a>
          </p>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" size="sm" type="button" disabled={busy} onClick={onCopy}>
            Copy
          </Button>
          <Button variant="outline" size="sm" type="button" disabled={busy} onClick={onTogglePin}>
            {item.pinned ? "Unpin" : "Pin"}
          </Button>
          <Button variant="outline" size="sm" type="button" disabled={busy} onClick={onToggleFavorite}>
            {item.favorite ? "Unstar" : "Star"}
          </Button>
        </div>
      </footer>
    </aside>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import CodeView from "../../components/CodeView";
import ItemThumbnail from "../../components/ItemThumbnail";
import TypeTile from "../../components/TypeTile";
import { useImageMeta } from "../../lib/imageMeta";
import { applyTransform, TRANSFORM_KINDS } from "../../lib/transforms";
import ItemOrganizer from "./ItemOrganizer";
import { displayTypeLabel, isCodeShaped } from "../../lib/contentTypeColors";
import type { LibraryItem, PasteFormat, Transform } from "../../api/types";
import { cn } from "@/lib/utils";

const pasteFormatLabels: Record<PasteFormat, string> = {
  preserve: "Preserve original",
  plain_text: "Plain text",
  strip_whitespace: "Strip extra whitespace",
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const factRow = "flex items-baseline justify-between gap-3 border-b border-border py-2.5 last:border-0";
const factLabel = "text-[0.76rem] text-[var(--text-muted)]";
const factValue = "font-mono text-[0.72rem] tabular-nums text-foreground";

const tabs = [
  { id: "preview", label: "Preview" },
  { id: "details", label: "Details" },
  { id: "transform", label: "Transform" },
] as const;
type TabId = (typeof tabs)[number]["id"];

const outlineAction =
  "grid size-[38px] min-h-0 shrink-0 place-items-center rounded-[9px] p-0 text-muted-foreground hover:bg-card hover:text-foreground aria-pressed:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] aria-pressed:text-[var(--accent)]";

interface ItemInspectorProps {
  item: LibraryItem | null;
  busy: boolean;
  revealed: boolean;
  pasteFormat: PasteFormat | null;
  onReveal: () => void;
  /** Copies the capture, through `transform` when one is chosen. */
  onCopy: (transform: Transform | null) => void;
  onTogglePin: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** A transform's output, or the reason it has none (JSON that does not
 *  parse, base64 that is not base64). */
function transformed(content: string, transform: Transform): { ok: true; text: string } | { ok: false; message: string } {
  try {
    return { ok: true, text: applyTransform(content, transform) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "This transform does not apply here." };
  }
}

/**
 * Right rail beside the history list: Preview/Details/Transform tabs for the
 * currently selected item, with Copy/Pin/Star anchored to the bottom.
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
  onDelete,
  onClose,
}: ItemInspectorProps) {
  const [activeTab, setActiveTab] = useState<TabId>("preview");
  const [transform, setTransform] = useState<Transform | null>(null);
  // Hooks cannot be called conditionally, so this runs even with nothing
  // selected; it returns null for anything that is not an image.
  const imageMeta = useImageMeta(item);

  // A transform is chosen for one capture. Carrying it to the next would
  // copy that one changed without the user having looked at it.
  useEffect(() => setTransform(null), [item?.id]);

  const stats = useMemo(() => {
    if (!item || item.content_type === "image") return null;
    return {
      characters: item.content.length,
      lines: item.content.split("\n").length,
    };
  }, [item]);

  const output = useMemo(
    () => (item && transform && item.content_type !== "image" ? transformed(item.content, transform) : null),
    [item, transform],
  );

  if (!item) {
    return (
      <aside
        className="sticky top-4 grid min-w-0 place-items-center rounded-xl border border-border bg-background p-5 text-center shadow-[var(--shadow-panel)]"
        aria-label="Item detail"
      >
        <p className="m-0 text-sm text-muted-foreground">
          Select a capture to see all of it here.
        </p>
      </aside>
    );
  }

  const typeLabel = displayTypeLabel(item);
  const hidden = item.private && !revealed;
  const isImage = item.content_type === "image";
  // Copy goes through the transform only when it produced something; a
  // failed one falls back to the capture as it is, and says so.
  const copyTransform = output?.ok ? transform : null;

  return (
    <aside
      // Sticky so the detail of the selected capture stays beside the list
      // while scrolling a long history.
      //
      // Capped at the list panel's own height, so the two end on one line and
      // the page is as tall whichever capture is selected. The rail was
      // allowed 11rem more than the list, so a long capture made the page
      // taller and selecting a short one shrank it: scrolled to the bottom,
      // the page jumped under the pointer mid-click, and a press on a row's
      // "More actions" landed on the row itself and copied it.
      className="sticky top-4 flex max-h-[calc(100vh-17rem)] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-[var(--shadow-menu)]"
      aria-label="Item detail"
    >
      <header className="grid gap-2 px-4 pb-3 pt-4">
        <div className="flex items-center gap-3">
          {/* The same tile the row carries, so the rail is visibly about the
              row that was clicked. */}
          <TypeTile item={item} size="lg" />
          {/* Title over timestamp, not beside it: at 318px a date long enough
              to carry a time left the title truncated to a few letters. */}
          <div className="min-w-0 flex-1">
            {/* No negative tracking at this size. The display face has a
                narrow space, and -0.02em at 14px shrank it to under 2px, so
                "JSON capture" read as one word. Tight tracking is an optical
                correction for large type, not small. */}
            <h3 className="m-0 truncate font-display text-[0.94rem] font-bold">
              {typeLabel} capture
            </h3>
            <p className="m-0 mt-0.5 truncate font-mono text-[0.66rem] tabular-nums text-[var(--text-muted)]">
              <time dateTime={item.created_at}>{dateFormatter.format(new Date(item.created_at))}</time>
              {item.source_app && ` · ${item.source_app}`}
            </p>
          </div>
          {/* Dismisses the rail for this capture only: selecting another row
              brings it back, so there is no mode to remember to leave. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close item detail"
            title="Close"
            className="grid size-7 shrink-0 place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 fill-none stroke-current [stroke-linecap:round] [stroke-width:2]">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {(item.pinned || item.favorite || item.private) && (
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[0.62rem] text-[var(--text-muted)]">
            {item.pinned && <span className="rounded-full bg-muted px-2 py-0.5 font-bold uppercase">Pinned</span>}
            {item.favorite && <span className="rounded-full bg-muted px-2 py-0.5 font-bold uppercase">Favorite</span>}
            {item.private && (
              <span className="rounded-full px-2 py-0.5 font-bold uppercase text-[var(--warning)] [background:color-mix(in_srgb,var(--warning)_16%,transparent)]">
                {revealed ? "Revealed" : "Sensitive"}
              </span>
            )}
          </div>
        )}
      </header>

      {/* A segmented control in a well, not an underline: three peers that
          swap the pane below, which is what a segmented control says. */}
      <div className="px-4 pb-3">
        <div
          role="tablist"
          aria-label="Item detail view"
          className="flex gap-0.5 rounded-[10px] border border-border bg-card p-[3px]"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`inspector-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`inspector-panel-${tab.id}`}
              className={
                "h-[30px] min-h-0 flex-1 rounded-[7px] px-2 text-[0.78rem] font-semibold transition-colors duration-100 motion-reduce:transition-none " +
                (activeTab === tab.id
                  ? "bg-background text-foreground shadow-[var(--shadow-panel)]"
                  : "text-[var(--text-muted)] hover:text-foreground")
              }
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 animate-[fade-in_160ms_ease-out] overflow-y-auto border-t border-border px-4 py-3.5 motion-reduce:animate-none" key={activeTab}>
        {activeTab === "preview" && (
          <div id="inspector-panel-preview" role="tabpanel" aria-labelledby="inspector-tab-preview">
            {/* `variant="full"`: the inspector is the one place the real image
                belongs, since it is drawn large and a 256px thumbnail would be
                visibly soft there. Every list row takes the thumbnail. */}
            {isImage ? (
              <div className="overflow-hidden rounded-[10px] border border-border bg-white">
                <ItemThumbnail item={item} variant="full" className="mt-0 block max-h-none w-full max-w-full rounded-none border-0" />
              </div>
            ) : hidden ? (
              <div className="grid justify-items-start gap-3 rounded-[10px] border border-dashed border-[color-mix(in_srgb,var(--warning)_45%,var(--border))] p-4 [background:color-mix(in_srgb,var(--warning)_6%,transparent)]">
                {/* Placeholder dots, never the text itself: a blurred secret
                    is still in the page for anything that reads it. */}
                <span aria-hidden="true" className="select-none font-mono text-[0.78rem] tracking-[0.2em] text-[var(--text-muted)]">
                  ••••••••••••••••
                </span>
                <p className="m-0 text-[0.78rem] text-muted-foreground">
                  <span>Hidden because this looks like a credential.</span> <span>Copy still works.</span>
                </p>
                <Button variant="outline" size="sm" type="button" onClick={onReveal}>
                  Reveal
                </Button>
              </div>
            ) : isCodeShaped(item.content_type) ? (
              <CodeView content={item.content} contentType={item.content_type} />
            ) : (
              <pre className="m-0 max-w-full whitespace-pre-wrap rounded-[9px] border border-border bg-card p-3.5 font-sans text-[0.84rem] leading-relaxed [overflow-wrap:anywhere]">
                {item.content}
              </pre>
            )}

            {/* The few facts worth having beside the preview itself. The full
                reading is one tab over; this is what answers "which capture
                is this" without leaving the pane. */}
            <dl className="mt-2 grid">
              {isImage && imageMeta?.width && imageMeta.height && (
                <div className={factRow}>
                  <dt className={factLabel}>Dimensions</dt>
                  <dd className={`m-0 ${factValue}`}>
                    {imageMeta.width} × {imageMeta.height}
                  </dd>
                </div>
              )}
              {item.source_app && (
                <div className={factRow}>
                  <dt className={factLabel}>Source</dt>
                  <dd className={`m-0 ${factValue} max-w-[12rem] truncate`} title={item.source_app}>
                    {item.source_app}
                  </dd>
                </div>
              )}
              {pasteFormat && (
                <div className={factRow}>
                  <dt className={factLabel}>Paste as</dt>
                  <dd className={`m-0 ${factValue}`}>
                    <a className="text-primary hover:underline" href="#settings">
                      {pasteFormatLabels[pasteFormat]}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {activeTab === "details" && (
          <div id="inspector-panel-details" role="tabpanel" aria-labelledby="inspector-tab-details">
            <dl className="grid">
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
              {item.source_app && (
                <div className={factRow}>
                  <dt className={factLabel}>Source</dt>
                  <dd className={`m-0 ${factValue} max-w-[12rem] truncate`} title={item.source_app}>
                    {item.source_app}
                  </dd>
                </div>
              )}
              {item.language && (
                <div className={factRow}>
                  <dt className={factLabel}>Language</dt>
                  <dd className={`m-0 ${factValue}`}>{item.language}</dd>
                </div>
              )}
            </dl>
            <ItemOrganizer item={item} />
          </div>
        )}

        {activeTab === "transform" && (
          <div id="inspector-panel-transform" role="tabpanel" aria-labelledby="inspector-tab-transform" className="grid gap-3">
            {isImage || hidden ? (
              <p className="m-0 py-4 text-center text-[0.78rem] text-muted-foreground">
                {isImage ? "Images have no text to transform." : "Reveal this capture to transform it."}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Transforms">
                  {TRANSFORM_KINDS.map((kind) => {
                    const on = transform === kind.variant;
                    return (
                      <button
                        key={kind.variant}
                        type="button"
                        aria-pressed={on}
                        title={kind.hint}
                        onClick={() => setTransform(on ? null : kind.variant)}
                        className={cn(
                          "inline-flex h-7 min-h-0 items-center rounded-lg border px-2.5 text-[0.74rem] font-medium transition-colors duration-100",
                          on
                            ? "border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[var(--accent-subtle)] text-[var(--accent-ink)]"
                            : "border-border text-muted-foreground hover:border-[var(--border-strong)] hover:text-foreground",
                        )}
                      >
                        {kind.label}
                      </button>
                    );
                  })}
                </div>
                {output && !output.ok ? (
                  <p className="m-0 rounded-[9px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-[0.76rem] text-destructive" role="alert">
                    {output.message}
                  </p>
                ) : (
                  <CodeView
                    content={output?.ok ? output.text : item.content}
                    contentType={isCodeShaped(item.content_type) ? item.content_type : "plain_text"}
                  />
                )}
                <p className="m-0 text-[0.74rem] text-[var(--text-muted)]">
                  {copyTransform
                    ? "Copy uses the transformed text. The capture itself is unchanged."
                    : "Pick a transform to preview it before copying."}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-border px-4 pb-3.5 pt-3">
        <Button
          className="h-[38px] flex-1 justify-center gap-2 rounded-[9px] text-[0.82rem] shadow-[0_1px_2px_rgb(0_0_0/14%),inset_0_1px_0_rgb(255_255_255/12%)]"
          size="sm"
          type="button"
          disabled={busy}
          onClick={() => onCopy(copyTransform)}
        >
          Copy
          {/* The key that does the same thing from the list, so the two
              ways of copying are visibly the same action. */}
          <span aria-hidden="true" className="font-mono opacity-60">↵</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          type="button"
          className={outlineAction}
          disabled={busy}
          onClick={onTogglePin}
          aria-label={item.pinned ? "Unpin" : "Pin"}
          aria-pressed={item.pinned}
          title={item.pinned ? "Unpin" : "Pin"}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]">
            <path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5Z" />
            <path d="M12 14v6" />
          </svg>
        </Button>
        <Button
          variant="outline"
          size="sm"
          type="button"
          className={outlineAction}
          disabled={busy}
          onClick={onToggleFavorite}
          aria-label={item.favorite ? "Unstar" : "Star"}
          aria-pressed={item.favorite}
          title={item.favorite ? "Unstar" : "Star"}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className={item.favorite ? "size-4 fill-[var(--warning)] text-[var(--warning)]" : "size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]"}
          >
            <path d="m12 4.5 2.3 4.9 5.2.7-3.8 3.6 1 5.3-4.7-2.6-4.7 2.6 1-5.3L4.5 10l5.2-.7L12 4.5Z" />
          </svg>
        </Button>
        {/* Destructive stays an outline that only tints on hover: it sits
            beside two ordinary controls and must not read as the thing to
            press. */}
        <Button
          variant="outline"
          size="sm"
          type="button"
          className={cn(outlineAction, "hover:bg-destructive/[0.12] hover:text-destructive")}
          disabled={busy}
          onClick={onDelete}
          aria-label="Delete capture"
          title="Delete capture"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]">
            <path d="M5 7h14M10 7V5h4v2M9 11v6M15 11v6M6.5 7l.8 12a1 1 0 0 0 1 .95h7.4a1 1 0 0 0 1-.95l.8-12" />
          </svg>
        </Button>
      </footer>
    </aside>
  );
}

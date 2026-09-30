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

const factRow = "flex items-baseline justify-between gap-3 py-1.5";
const factLabel = "text-[0.8rem] text-muted-foreground";
const factValue = "text-[0.8rem] tabular-nums text-foreground";

// "Copy it as" chips: outlined at rest, filled with ink when chosen.
const copyAsChip =
  "inline-flex h-[30px] min-h-0 items-center rounded-full border px-3 text-[0.78rem] transition-colors duration-100";
const copyAsOn = "border-foreground bg-foreground text-background";
const copyAsOff = "border-[var(--border-strong)] text-foreground hover:bg-card";

const outlineAction =
  "grid size-[46px] min-h-0 shrink-0 place-items-center rounded-[12px] border-[var(--border-strong)] bg-card p-0 text-muted-foreground hover:bg-card hover:text-foreground aria-pressed:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] aria-pressed:text-[var(--accent)]";

/** The panel's own ground: between the page and a card, as in the design. */
const panelClass =
  "flex min-h-0 min-w-0 flex-col border-l border-border bg-[color-mix(in_srgb,var(--surface-1)_55%,var(--page))] max-[60rem]:border-l-0 max-[60rem]:border-t";

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
 * The reading panel beside the desk: the chosen capture in full, how to copy
 * it, and what is known about it, with Copy, Pin, Star and Delete anchored at
 * the foot.
 *
 * One column rather than Preview/Details/Transform tabs. The transforms are
 * choices of what to copy, so they sit under the preview they change -
 * choosing one changes the preview in place - instead of a tab away from it.
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
      <aside className={cn(panelClass, "items-center justify-center p-8 text-center")} aria-label="Item detail">
        <p className="m-0 font-display text-[1.05rem] italic text-muted-foreground">
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
    <aside className={panelClass} aria-label="Item detail">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[30px] pb-5 pt-[26px] max-[31rem]:px-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-primary">Reading</span>
          {/* Dismisses the panel for this capture only: choosing another card
              brings it back, so there is no mode to remember to leave. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close item detail"
            title="Close"
            className="-mr-1.5 grid size-7 shrink-0 place-items-center rounded-[7px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 fill-none stroke-current [stroke-linecap:round] [stroke-width:2]">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-3 flex items-start gap-3">
          <TypeTile item={item} size="lg" className="mt-1" />
          <div className="min-w-0 flex-1">
            <h3 className="m-0 font-display text-[1.6rem] font-semibold leading-[1.15] tracking-[-0.02em] [overflow-wrap:anywhere]">
              {item.title?.trim() || `${typeLabel} capture`}
            </h3>
            <p className="m-0 mt-1.5 text-[0.8rem] text-muted-foreground">
              {typeLabel}
              {item.source_app && ` from ${item.source_app}`} ·{" "}
              <time dateTime={item.created_at}>{dateFormatter.format(new Date(item.created_at))}</time>
            </p>
          </div>
        </div>
        {(item.pinned || item.favorite || item.private) && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[0.72rem] font-medium">
            {item.pinned && <span className="rounded-md bg-[var(--accent-subtle)] px-2 py-0.5 text-[var(--accent-ink)]">Pinned</span>}
            {item.favorite && <span className="rounded-md bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-2 py-0.5 text-[var(--warning)]">Favorite</span>}
            {item.private && (
              <span className="rounded-md bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-2 py-0.5 text-[var(--warning)]">
                {revealed ? "Revealed" : "Sensitive"}
              </span>
            )}
          </div>
        )}

        <div className="mt-5">
          {/* `variant="full"`: the panel is the one place the real image
              belongs, since it is drawn large and a 256px thumbnail would be
              visibly soft here. Every card takes the thumbnail. */}
          {isImage ? (
            <div className="overflow-hidden rounded-[12px] border border-border bg-white">
              <ItemThumbnail item={item} variant="full" className="mt-0 block max-h-none w-full max-w-full rounded-none border-0" />
            </div>
          ) : hidden ? (
            <div className="grid justify-items-start gap-3 rounded-[12px] border border-dashed border-[color-mix(in_srgb,var(--warning)_45%,var(--border))] p-4 [background:color-mix(in_srgb,var(--warning)_6%,transparent)]">
              {/* Placeholder dots, never the text itself: a blurred secret
                  is still in the page for anything that reads it. */}
              <span aria-hidden="true" className="select-none font-mono text-[0.78rem] tracking-[0.2em] text-[var(--text-muted)]">
                ••••••••••••••••
              </span>
              <p className="m-0 text-[0.8rem] text-muted-foreground">
                <span>Hidden because this looks like a credential.</span> <span>Copy still works.</span>
              </p>
              <Button variant="outline" size="sm" type="button" onClick={onReveal}>
                Reveal
              </Button>
            </div>
          ) : output && !output.ok ? (
            <p className="m-0 rounded-[12px] border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-[0.8rem] text-destructive" role="alert">
              {output.message}
            </p>
          ) : isCodeShaped(item.content_type) || output?.ok ? (
            // With a transform chosen the preview is its output: what Copy
            // will put on the clipboard, not what was captured.
            <CodeView
              content={output?.ok ? output.text : item.content}
              contentType={isCodeShaped(item.content_type) ? item.content_type : "plain_text"}
            />
          ) : (
            <pre className="m-0 max-w-full whitespace-pre-wrap rounded-[12px] border border-border bg-card px-[18px] py-4 font-display text-[1.02rem] leading-[1.5] [overflow-wrap:anywhere]">
              {item.content}
            </pre>
          )}
        </div>

        {!isImage && !hidden && (
          <div className="mt-5 grid gap-2.5">
            <span className="text-[0.8rem] text-muted-foreground">Copy it as</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Transforms">
              <button
                type="button"
                aria-pressed={transform === null}
                onClick={() => setTransform(null)}
                className={cn(copyAsChip, transform === null ? copyAsOn : copyAsOff)}
              >
                As is
              </button>
              {TRANSFORM_KINDS.map((kind) => {
                const on = transform === kind.variant;
                return (
                  <button
                    key={kind.variant}
                    type="button"
                    aria-pressed={on}
                    title={kind.hint}
                    onClick={() => setTransform(on ? null : kind.variant)}
                    className={cn(copyAsChip, on ? copyAsOn : copyAsOff)}
                  >
                    {kind.label}
                  </button>
                );
              })}
            </div>
            {transform && (
              <p className="m-0 text-[0.76rem] text-muted-foreground">
                {copyTransform
                  ? "Copy uses the transformed text. The capture itself is unchanged."
                  : "This one does not apply here, so Copy takes the capture as it is."}
              </p>
            )}
          </div>
        )}

        <dl className="mt-6 grid border-t border-border pt-4">
          {item.source_app && (
            <div className={factRow}>
              <dt className={factLabel}>Captured from</dt>
              <dd className={`m-0 ${factValue} max-w-[12rem] truncate`} title={item.source_app}>
                {item.source_app}
              </dd>
            </div>
          )}
          <div className={factRow}>
            <dt className={factLabel}>Copied back</dt>
            <dd className={`m-0 ${factValue}`}>{item.usage_count}×</dd>
          </div>
          {isImage && imageMeta?.width && imageMeta.height && (
            <div className={factRow}>
              <dt className={factLabel}>Dimensions</dt>
              <dd className={`m-0 ${factValue}`}>
                {imageMeta.width} × {imageMeta.height}
              </dd>
            </div>
          )}
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
          {item.language && (
            <div className={factRow}>
              <dt className={factLabel}>Language</dt>
              <dd className={`m-0 ${factValue}`}>{item.language}</dd>
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
        <div className="mt-3">
          <ItemOrganizer item={item} />
        </div>
      </div>

      <footer className="flex items-center gap-2.5 border-t border-border px-[30px] pb-5 pt-4 max-[31rem]:px-4">
        <Button
          className="h-[46px] flex-1 justify-center gap-2 rounded-[12px] text-[0.9rem] font-semibold shadow-[0_1px_2px_rgb(0_0_0/14%),inset_0_1px_0_rgb(255_255_255/12%)]"
          type="button"
          disabled={busy}
          onClick={() => onCopy(copyTransform)}
        >
          Copy
          {/* The key that does the same thing from the desk, so the two ways
              of copying are visibly the same action. */}
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
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[17px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]">
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
            className={item.favorite ? "size-[17px] fill-[var(--warning)] text-[var(--warning)]" : "size-[17px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]"}
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
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[17px] fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]">
            <path d="M5 7h14M10 7V5h4v2M9 11v6M15 11v6M6.5 7l.8 12a1 1 0 0 0 1 .95h7.4a1 1 0 0 0 1-.95l.8-12" />
          </svg>
        </Button>
      </footer>
    </aside>
  );
}

import { useEffect, useRef, useState } from "react";
import { CommandError, commands } from "../../api/commands";
import type { LibraryItem } from "../../api/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Mirrors the repository's own ceiling (`validate_item_input`), so an
// over-long entry is reported here instead of being rejected after the round
// trip. Bytes, not characters, is what the backend measures.
const MAX_CONTENT_BYTES = 1_000_000;
const MAX_TITLE_CHARS = 200;

const field =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors placeholder:text-[var(--text-muted)] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export default function SaveItemDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (item: LibraryItem) => void;
}) {
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pasting, setPasting] = useState(false);
  const contentField = useRef<HTMLTextAreaElement>(null);

  // Each opening starts from a blank form: a half-written entry from last time
  // is more likely to be saved by accident than to be wanted.
  useEffect(() => {
    if (!open) return;
    setContent("");
    setTitle("");
    setError("");
    setSaving(false);
    setPasting(false);
  }, [open]);

  const bytes = byteLength(content);
  const tooLong = bytes > MAX_CONTENT_BYTES;
  const empty = content.trim().length === 0;

  async function pasteFromClipboard() {
    setPasting(true);
    setError("");
    try {
      const text = await commands.readClipboardText();
      if (!text) {
        setError("The clipboard holds no text to paste.");
        return;
      }
      setContent(text);
      contentField.current?.focus();
    } catch {
      setError("Could not read the clipboard.");
    } finally {
      setPasting(false);
    }
  }

  async function save() {
    if (empty || tooLong || saving) return;
    setSaving(true);
    setError("");
    try {
      const item = await commands.saveManualItem({
        content,
        title: title.trim() ? title.trim() : null,
      });
      onSaved(item);
      onOpenChange(false);
    } catch (reason) {
      setError(
        reason instanceof CommandError && reason.code === "validation"
          ? reason.message
          : "Could not save this item.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl"
        aria-describedby="save-item-description"
        onKeyDown={(event) => {
          // The textarea owns Enter, so the accelerator carries a modifier -
          // the same one that submits a message in most editors.
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            void save();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Save an item</DialogTitle>
          <DialogDescription id="save-item-description">
            Paste or type anything. It is stored exactly like something you
            copied, so it appears in the history and copies back the same way.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              Title <span className="font-normal normal-case tracking-normal">(optional)</span>
            </span>
            <input
              className={field}
              type="text"
              value={title}
              maxLength={MAX_TITLE_CHARS}
              placeholder="Deployment command"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="flex items-baseline justify-between gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              Content
              <span
                className={
                  "font-mono text-[0.65rem] normal-case tracking-normal tabular-nums " +
                  (tooLong ? "text-destructive" : "text-[var(--text-muted)]")
                }
              >
                {bytes.toLocaleString()} / {MAX_CONTENT_BYTES.toLocaleString()} bytes
              </span>
            </span>
            <textarea
              ref={contentField}
              className={`${field} min-h-40 resize-y font-mono text-xs leading-relaxed`}
              value={content}
              autoFocus
              spellCheck={false}
              placeholder="Paste or type the content to keep…"
              onChange={(event) => setContent(event.target.value)}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={pasting || saving}
              onClick={() => void pasteFromClipboard()}
            >
              {pasting ? "Reading…" : "Paste from clipboard"}
            </Button>
            <p className="text-[0.68rem] text-[var(--text-muted)]">
              The type is detected for you. Anything that looks like a secret is
              saved as private, so it stays masked in the list.
            </p>
          </div>
        </div>

        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" type="button" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={empty || tooLong || saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

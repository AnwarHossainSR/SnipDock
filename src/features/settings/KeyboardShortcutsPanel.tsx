import { useCallback, useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  formatBinding,
  isMac,
  parseBinding,
  SHORTCUT_SCHEMA,
  validateBinding,
  type ShortcutEntry,
} from "../../lib/shortcuts";
import type { Settings } from "../../api/types";
import { Button } from "@/components/ui/button";

interface KeyboardShortcutsPanelProps {
  settings: Settings;
  onSave: (customShortcuts: Record<string, string>) => Promise<void>;
  schema?: ShortcutEntry[];
}

function bindingsAreEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export default function KeyboardShortcutsPanel({
  settings,
  onSave,
  schema = SHORTCUT_SCHEMA,
}: KeyboardShortcutsPanelProps) {
  const overrides = settings.custom_shortcuts ?? {};
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const mac = isMac();

  useEffect(() => {
    setResult("");
  }, [overrides]);

  const setDraft = useCallback((actionId: string, value: string) => {
    setDrafts((current) => ({ ...current, [actionId]: value }));
  }, []);

  const persist = useCallback(
    async (entry: ShortcutEntry, raw: string) => {
      const previous = { ...overrides };
      const next: Record<string, string> = { ...previous };
      if (bindingsAreEqual(entry.defaultBinding, raw)) {
        delete next[entry.actionId];
      } else {
        next[entry.actionId] = raw;
      }
      setBusy(true);
      setResult("");
      try {
        await onSave(next);
        setDraft(entry.actionId, raw);
        const parsed = parseBinding(raw);
        const rendered = parsed.ok ? formatBinding(parsed.value, mac) : raw;
        setResult(`${entry.label} set to ${rendered}.`);
      } catch (reason) {
        setErrors((current) => ({
          ...current,
          [entry.actionId]:
            reason instanceof Error ? reason.message : "Could not save binding.",
        }));
      } finally {
        setBusy(false);
      }
    },
    [mac, onSave, overrides],
  );

  // Resetting removes the override and persists that map directly. Going
  // through `commit` instead would read `drafts` before React had applied the
  // cleared value and save the previous binding all over again.
  const reset = useCallback(
    (entry: ShortcutEntry) => {
      setDraft(entry.actionId, "");
      if (!(entry.actionId in overrides)) return;
      const next: Record<string, string> = { ...overrides };
      delete next[entry.actionId];
      setBusy(true);
      setResult("");
      void onSave(next)
        .then(() => {
          setErrors((current) => {
            if (!(entry.actionId in current)) return current;
            const cleared = { ...current };
            delete cleared[entry.actionId];
            return cleared;
          });
          setResult(`${entry.label} reset to default.`);
        })
        .catch((reason) => {
          setErrors((current) => ({
            ...current,
            [entry.actionId]:
              reason instanceof Error ? reason.message : "Could not save binding.",
          }));
        })
        .finally(() => setBusy(false));
    },
    [onSave, overrides, setDraft],
  );

  const commit = useCallback(
    (entry: ShortcutEntry) => {
      const raw = (drafts[entry.actionId] ?? "").trim();
      // Empty string clears the override: see "Empty binding clears the
      // override" in the spec. The parser is skipped because the cleared
      // value is the sentinel for "use the default".
      if (raw === "") {
        reset(entry);
        return;
      }
      const verdict = validateBinding(raw, entry.actionId, schema, overrides);
      if (!verdict.ok) {
        setErrors((current) => ({ ...current, [entry.actionId]: verdict.reason }));
        return;
      }
      setErrors((current) => {
        if (!(entry.actionId in current)) return current;
        const next = { ...current };
        delete next[entry.actionId];
        return next;
      });
      void persist(entry, raw);
    },
    [drafts, overrides, persist, reset, schema],
  );

  const onKeyDown = useCallback(
    (entry: ShortcutEntry) =>
      (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        commit(entry);
      },
    [commit],
  );

  const onBlur = useCallback(
    (entry: ShortcutEntry) =>
      () => {
        const draftValue = (drafts[entry.actionId] ?? "").trim();
        if (draftValue === "") return;
        // An untouched field must not commit on the way out: clicking Reset
        // blurs the input first, and re-saving the binding shown there would
        // undo the reset before it happened.
        const current = (overrides[entry.actionId] ?? entry.defaultBinding).trim();
        if (draftValue === current) return;
        commit(entry);
      },
    [commit, drafts, overrides],
  );

  if (schema.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No keyboard shortcuts are documented.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        Override the binding for any action. Press <kbd className="font-mono">Enter</kbd> to commit,
        or clear the field to fall back to the default.
      </p>
      {result && (
        <p className="text-xs text-[var(--success)]" role="status" aria-live="polite">
          {result}
        </p>
      )}
      <ul className="grid gap-2" aria-label="Keyboard shortcuts">
        {schema.map((entry) => {
          const override = overrides[entry.actionId];
          const currentBinding = override ?? entry.defaultBinding;
          const parsed = parseBinding(currentBinding);
          const rendered = parsed.ok ? formatBinding(parsed.value, mac) : currentBinding;
          const draftValue = drafts[entry.actionId] ?? currentBinding;
          const error = errors[entry.actionId];
          const isCustom = Boolean(override);
          return (
            <li
              key={entry.actionId}
              className="grid gap-1 rounded-md border border-border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{entry.label}</span>
                  {isCustom && (
                    <span className="rounded-sm bg-accent px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.06em] text-primary">
                      Custom
                    </span>
                  )}
                </div>
                <span className="font-mono text-xs text-muted-foreground" aria-hidden="true">
                  {rendered}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  className="w-56 max-w-full rounded-sm border border-border bg-muted px-2 py-1 font-mono text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  aria-label={`${entry.label} binding`}
                  value={draftValue}
                  disabled={busy}
                  onChange={(event) => setDraft(entry.actionId, event.target.value)}
                  onKeyDown={onKeyDown(entry)}
                  onBlur={onBlur(entry)}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => commit(entry)}
                  disabled={busy}
                >
                  Save
                </Button>
                {isCustom && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => reset(entry)}
                    disabled={busy}
                  >
                    Reset
                  </Button>
                )}
              </div>
              {error && (
                <p className="text-xs text-destructive" role="alert" aria-live="polite">
                  {error}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

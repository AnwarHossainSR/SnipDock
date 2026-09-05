import { useCallback, useState } from "react";
import type { KeyboardEvent } from "react";
import { commands } from "../../api/commands";
import type { Settings } from "../../api/types";
import { Button } from "@/components/ui/button";
import { SettingRow, SettingSection } from "@/components/ui/setting-section";
import { cn } from "@/lib/utils";

/**
 * Settings editor for `Settings.ignored_apps`. The capture-time filter
 * already consults this list; the panel is just an editor for it, so the
 * "Add currently focused app" action and the typed-name input both flow
 * through the same `save_settings` patch the rest of Settings uses.
 */
export default function IgnoredAppsPanel({
  className,
  settings,
  onSave,
  note = "Ignored apps saved.",
}: {
  className?: string;
  settings: Settings;
  onSave: (next: string[], note?: string) => Promise<void> | void;
  note?: string;
}) {
  const [draft, setDraft] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [focusExecutable, setFocusExecutable] = useState<string | null | undefined>(undefined);

  async function refreshFocusExecutable() {
    try {
      const value = await commands.getForegroundExecutable();
      setFocusExecutable(value);
      return value;
    } catch {
      setFocusExecutable(null);
      return null;
    }
  }

  const persist = useCallback(
    async (next: string[], message: string) => {
      setBusy(true);
      setError("");
      setResult("");
      try {
        await onSave(next, message);
        setResult("Setting saved.");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Could not save ignored apps.");
      } finally {
        setBusy(false);
      }
    },
    [onSave],
  );

  function commitDraft() {
    const value = draft.trim();
    if (!value) {
      setFieldError("Type an executable name first.");
      return;
    }
    if (settings.ignored_apps.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
      // Duplicates are a no-op, not an error - the user is just trying again.
      setFieldError("");
      setDraft("");
      return;
    }
    setFieldError("");
    setDraft("");
    void persist([...settings.ignored_apps, value], note);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitDraft();
  }

  async function addFocused() {
    const value = await refreshFocusExecutable();
    if (!value) return;
    if (settings.ignored_apps.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
      setResult(`${value} is already in the list.`);
      return;
    }
    void persist([...settings.ignored_apps, value], `${value} added.`);
  }

  function remove(app: string) {
    void persist(settings.ignored_apps.filter((entry) => entry !== app), `${app} removed.`);
  }

  return (
    <SettingSection
      className={className}
      title="Ignored apps"
      titleId="settings-ignored-apps-heading"
      description="Anything copied from a listed executable is dropped before it reaches storage."
      tone="var(--type-secret)"
      icon={
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]">
          <rect x="5" y="10.5" width="14" height="9" rx="2" />
          <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
        </svg>
      }
    >
      <SettingRow title="Excluded apps">
        {settings.ignored_apps.length === 0 ? (
          <p
            className="m-0 rounded-md border border-dashed border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground"
            role="status"
          >
            No apps are being ignored. Anything you copy from a listed executable is dropped before it reaches storage.
          </p>
        ) : (
          // Chips rather than rows: the list is a set of short names, and a
          // full-width row each made three exclusions look like a table.
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {settings.ignored_apps.map((app) => (
              <li key={app}>
                <span className="flex h-[30px] items-center gap-1.5 rounded-md border border-border bg-muted pl-2.5 pr-1">
                  <span className="font-mono text-[0.75rem] text-foreground" title={app}>
                    {app}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-6 rounded-sm p-0 text-base leading-none text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    disabled={busy}
                    onClick={() => remove(app)}
                    aria-label={`Remove ${app} from the ignored apps`}
                  >
                    <span aria-hidden="true">×</span>
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingRow>

      <SettingRow
        title={
          <label htmlFor="ignored-app-input" className="text-[0.8rem] font-medium text-foreground">
            Add by executable name
          </label>
        }
        description="The name as it appears in the task list, for example Code.exe."
        control={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <input
              id="ignored-app-input"
              type="text"
              className={cn(
                "min-h-9 w-52 min-w-0 rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:font-sans placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                fieldError && "border-destructive focus-visible:outline-destructive",
              )}
              placeholder="Code.exe"
              value={draft}
              disabled={busy}
              onChange={(event) => {
                setDraft(event.target.value);
                if (fieldError) setFieldError("");
              }}
              onKeyDown={onKeyDown}
              onBlur={commitDraft}
              aria-invalid={Boolean(fieldError) || undefined}
              aria-describedby={fieldError ? "ignored-app-error" : undefined}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
            />
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={commitDraft}
              aria-label="Add the typed executable to the ignored apps"
            >
              Add
            </Button>
          </div>
        }
      >
        {fieldError && (
          <p id="ignored-app-error" role="alert" className="m-0 text-xs text-destructive">
            {fieldError}
          </p>
        )}
      </SettingRow>

      <SettingRow
        title="Add the app you are focused on right now"
        description={
          focusExecutable === undefined
            ? "Looking up the foreground app…"
            : focusExecutable === null
              ? "No foreground app could be detected. Type the name above instead."
              : `Will add ${focusExecutable}.`
        }
        control={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || focusExecutable === null}
            onClick={addFocused}
            title={
              focusExecutable === undefined
                ? "Click to detect the currently focused app"
                : focusExecutable === null
                  ? "No foreground app is available right now."
                  : `Add ${focusExecutable} to the ignored apps`
            }
          >
            {focusExecutable === undefined ? "Detect..." : "Add currently focused app"}
          </Button>
        }
      >
        {(result || error) && (
          <p
            role={error ? "alert" : "status"}
            aria-live="polite"
            className={cn(
              "m-0 text-xs font-semibold",
              error ? "text-destructive" : "text-[var(--success)]",
            )}
          >
            {error || result}
          </p>
        )}
      </SettingRow>
    </SettingSection>
  );
}

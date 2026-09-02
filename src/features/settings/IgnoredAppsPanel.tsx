import { useCallback, useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { commands } from "../../api/commands";
import type { Settings } from "../../api/types";
import { Button } from "@/components/ui/button";
import { PanelHeader } from "@/components/ui/panel-header";
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

  useEffect(() => {
    if (focusExecutable !== undefined) return;
    let alive = true;
    commands
      .getForegroundExecutable()
      .then((value) => {
        if (alive) setFocusExecutable(value);
      })
      .catch(() => {
        if (alive) setFocusExecutable(null);
      });
    return () => {
      alive = false;
    };
  }, [focusExecutable]);

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
    if (settings.ignored_apps.includes(value)) {
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

  function addFocused() {
    if (!focusExecutable) return;
    if (settings.ignored_apps.includes(focusExecutable)) {
      setResult(`${focusExecutable} is already in the list.`);
      return;
    }
    void persist([...settings.ignored_apps, focusExecutable], `${focusExecutable} added.`);
  }

  function remove(app: string) {
    void persist(settings.ignored_apps.filter((entry) => entry !== app), `${app} removed.`);
  }

  return (
    <section className={className} aria-labelledby="settings-ignored-apps-heading">
      <PanelHeader
        eyebrow="Capture"
        title="Ignored apps"
        titleId="settings-ignored-apps-heading"
      />

      {settings.ignored_apps.length === 0 ? (
        <p
          className="m-0 rounded-sm border border-dashed border-border bg-muted/40 px-3 py-3 text-sm text-muted-foreground"
          role="status"
        >
          No apps are being ignored. Anything you copy from a listed executable is dropped before it reaches storage.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {settings.ignored_apps.map((app) => (
            <li
              key={app}
              className="flex min-h-9 items-center justify-between gap-3 rounded-sm border border-border bg-card px-3 py-1.5"
            >
              <span className="font-mono text-[0.8rem] text-foreground" title={app}>
                {app}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs font-semibold text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={() => remove(app)}
                aria-label={`Remove ${app} from the ignored apps`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-2">
        <label
          htmlFor="ignored-app-input"
          className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--color-text-subtle)]"
        >
          Add by executable name
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="ignored-app-input"
            type="text"
            className={cn(
              "min-h-9 min-w-0 flex-1 rounded-sm border border-border bg-muted px-3 py-2 font-mono text-sm text-foreground placeholder:font-sans placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
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
        {fieldError && (
          <p id="ignored-app-error" role="alert" className="m-0 text-xs text-destructive">
            {fieldError}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <p className="m-0 text-sm font-semibold text-foreground">
            Add the app you are focused on right now
          </p>
          <p className="m-0 text-xs text-muted-foreground">
            {focusExecutable === undefined
              ? "Looking up the foreground app…"
              : focusExecutable === null
                ? "No foreground app could be detected. Type the name above instead."
                : `Will add ${focusExecutable}.`}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || !focusExecutable}
          onClick={addFocused}
          title={
            focusExecutable === null
              ? "No foreground app is available right now."
              : `Add ${focusExecutable} to the ignored apps`
          }
        >
          Add currently focused app
        </Button>
      </div>

      {(result || error) && (
        <p
          role={error ? "alert" : "status"}
          aria-live="polite"
          className={cn(
            "m-0 mt-3 text-xs font-semibold",
            error ? "text-destructive" : "text-[var(--color-positive)]",
          )}
        >
          {error || result}
        </p>
      )}
    </section>
  );
}

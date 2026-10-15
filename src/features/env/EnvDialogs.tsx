import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import { CommandError, commands } from "../../api/commands";
import type { EnvGroup, EnvVar, EnvVarEntry, ImportEnvReport, Project } from "../../api/types";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SegmentedRadio } from "@/components/ui/radio-group";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import {
  isPortableKey,
  keyProblem,
  looksSecret,
  parseEnvText,
  parseJsonDocument,
  type ImportFormat,
} from "../../lib/envFormat";
import { cn } from "@/lib/utils";

// Mirrors the repository's limits in `src-tauri/src/storage/env_vars.rs`, so
// an over-long entry is reported here rather than after the round trip.
const MAX_VALUE_BYTES = 1_000_000;
const MAX_NAME_CHARS = 80;
const MAX_DESCRIPTION_CHARS = 500;
const MAX_NOTE_CHARS = 500;

export const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors placeholder:text-[var(--text-muted)] focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive";
const labelClass = "text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]";
const optionalClass = "font-normal normal-case tracking-normal";

/** The backend's own message for a validation failure, a fallback otherwise. */
export function commandMessage(reason: unknown, fallback: string): string {
  if (reason instanceof CommandError && reason.code === "validation") {
    return reason.message.charAt(0).toUpperCase() + reason.message.slice(1) + ".";
  }
  return fallback;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function Field({ label, optional, hint, children }: { label: string; optional?: boolean; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className={cn(labelClass, "flex items-baseline justify-between gap-2")}>
        <span>
          {label} {optional && <span className={optionalClass}>(optional)</span>}
        </span>
        {hint}
      </span>
      {children}
    </label>
  );
}

/** Saves on Ctrl/Cmd+Enter from anywhere in the dialog - a textarea owns
 *  plain Enter. */
function submitOnModEnter(submit: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  };
}

/* ------------------------------------------------------------------------- */

export type GroupDialogMode =
  | { kind: "create"; projectId: string | null }
  | { kind: "edit"; group: EnvGroup }
  | { kind: "duplicate"; group: EnvGroup };

/** The select's value for "No project", and for starting a new one. */
const NO_PROJECT = "";
const NEW_PROJECT = "__new__";
const MAX_PROJECT_NAME_CHARS = 200;

export function EnvGroupDialog({
  mode,
  projects,
  onOpenChange,
  onSaved,
  onProjectCreated,
}: {
  mode: GroupDialogMode | null;
  projects: Project[];
  onOpenChange: (open: boolean) => void;
  onSaved: (group: EnvGroup) => void;
  /** A project made from this dialog, so the page can list it at once. */
  onProjectCreated: (project: Project) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [project, setProject] = useState(NO_PROJECT);
  const [newProject, setNewProject] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!mode) return;
    setError("");
    setSaving(false);
    setNewProject("");
    if (mode.kind === "create") {
      setName("");
      setDescription("");
      setProject(mode.projectId ?? NO_PROJECT);
    } else if (mode.kind === "edit") {
      setName(mode.group.name);
      setDescription(mode.group.description ?? "");
      setProject(mode.group.project_id ?? NO_PROJECT);
    } else {
      setName(`${mode.group.name} copy`.slice(0, MAX_NAME_CHARS));
      setDescription("");
      setProject(mode.group.project_id ?? NO_PROJECT);
    }
  }, [mode]);

  const title = mode?.kind === "edit" ? "Edit set" : mode?.kind === "duplicate" ? "Duplicate set" : "New variable set";
  const action = mode?.kind === "edit" ? "Save" : mode?.kind === "duplicate" ? "Duplicate" : "Create set";
  const creatingProject = project === NEW_PROJECT;
  const incomplete = !name.trim() || (creatingProject && !newProject.trim());

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (!mode || incomplete || saving) return;
    setSaving(true);
    setError("");
    try {
      if (mode.kind === "duplicate") {
        onSaved(await commands.duplicateEnvGroup(mode.group.id, name.trim()));
        onOpenChange(false);
        return;
      }
      let projectId: string | null = project === NO_PROJECT ? null : project;
      if (creatingProject) {
        const created = await commands.saveProject({ name: newProject.trim(), tag_ids: [] });
        onProjectCreated(created);
        // Chosen from here on, so a failed save below cannot make it twice.
        setProject(created.id);
        projectId = created.id;
      }
      const saved = await commands.saveEnvGroup({
        id: mode.kind === "edit" ? mode.group.id : null,
        project_id: projectId,
        name: name.trim(),
        description: description.trim() || null,
      });
      onSaved(saved);
      onOpenChange(false);
    } catch (reason) {
      setError(commandMessage(reason, "Could not save the set."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="env-group-description">
        <form className="grid gap-4" onSubmit={(event) => void save(event)}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription id="env-group-description">
              {mode?.kind === "duplicate"
                ? `Copies every variable in “${mode.group.name}” into a new set in the same project.`
                : "A set is one place a project runs - production, staging, local."}
            </DialogDescription>
          </DialogHeader>
          {mode?.kind !== "duplicate" && (
            <Field label="Project">
              <select className={fieldClass} value={project} onChange={(event) => setProject(event.target.value)}>
                {projects.map((option) => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
                <option value={NO_PROJECT}>No project</option>
                <option value={NEW_PROJECT}>New project…</option>
              </select>
            </Field>
          )}
          {creatingProject && (
            <Field label="New project name">
              <input
                className={fieldClass}
                value={newProject}
                maxLength={MAX_PROJECT_NAME_CHARS}
                placeholder="acme-api"
                autoFocus
                onChange={(event) => setNewProject(event.target.value)}
              />
            </Field>
          )}
          <Field label="Name">
            <input
              className={fieldClass}
              value={name}
              maxLength={MAX_NAME_CHARS}
              placeholder="production"
              autoFocus={!creatingProject}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          {mode?.kind !== "duplicate" && (
            <Field label="Description" optional>
              <input
                className={fieldClass}
                value={description}
                maxLength={MAX_DESCRIPTION_CHARS}
                placeholder="Fly.io app, eu-west"
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          )}
          {error && <p className="m-0 text-xs text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={incomplete || saving}>{saving ? "Saving…" : action}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------- */

export type VarDialogMode = { kind: "create"; groupId: string } | { kind: "edit"; variable: EnvVar };

export function EnvVarDialog({
  mode,
  onOpenChange,
  onSaved,
}: {
  mode: VarDialogMode | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (variable: EnvVar, created: boolean) => void;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [secret, setSecret] = useState(false);
  // Once the switch has been touched the guess stops overriding it.
  const [secretTouched, setSecretTouched] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!mode) return;
    setError("");
    setSaving(false);
    if (mode.kind === "edit") {
      setKey(mode.variable.key);
      setValue(mode.variable.value);
      setSecret(mode.variable.secret);
      setSecretTouched(true);
      setNote(mode.variable.note ?? "");
    } else {
      setKey("");
      setValue("");
      setSecret(false);
      setSecretTouched(false);
      setNote("");
    }
  }, [mode]);

  useEffect(() => {
    if (!secretTouched) setSecret(looksSecret(key.trim(), value));
  }, [key, value, secretTouched]);

  const trimmedKey = key.trim();
  const problem = trimmedKey ? keyProblem(trimmedKey) : null;
  const keyHint =
    problem ??
    (trimmedKey && !isPortableKey(trimmedKey)
      ? "Stored as is, but shells can only export letters, digits and _ not starting with a digit."
      : null);
  const bytes = byteLength(value);
  const tooLong = bytes > MAX_VALUE_BYTES;
  const json = useMemo(() => parseJsonDocument(value), [value]);
  const canSave = Boolean(trimmedKey) && !problem && !tooLong && !saving;

  function reformat(indent: number | undefined) {
    if (json !== undefined) setValue(JSON.stringify(json, null, indent));
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (!mode || !canSave) return;
    setSaving(true);
    setError("");
    try {
      const saved = await commands.saveEnvVar({
        id: mode.kind === "edit" ? mode.variable.id : null,
        group_id: mode.kind === "edit" ? mode.variable.group_id : mode.groupId,
        key: trimmedKey,
        value,
        secret,
        note: note.trim() || null,
      });
      onSaved(saved, mode.kind === "create");
      onOpenChange(false);
    } catch (reason) {
      setError(commandMessage(reason, "Could not save the variable."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" aria-describedby="env-var-description" onKeyDown={submitOnModEnter(() => void save())}>
        <form className="grid gap-4" onSubmit={(event) => void save(event)}>
          <DialogHeader>
            <DialogTitle>{mode?.kind === "edit" ? "Edit variable" : "Add a variable"}</DialogTitle>
            <DialogDescription id="env-var-description">
              A value can be anything: one word, several lines, a whole JSON document. It is stored exactly as typed.
            </DialogDescription>
          </DialogHeader>

          <Field label="Key">
            <input
              className={cn(fieldClass, "font-mono")}
              value={key}
              aria-invalid={problem ? true : undefined}
              aria-describedby={keyHint ? "env-var-key-hint" : undefined}
              placeholder="DATABASE_URL"
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setKey(event.target.value)}
            />
          </Field>
          {keyHint && (
            <p id="env-var-key-hint" className={cn("-mt-2.5 text-[0.72rem]", problem ? "text-destructive" : "text-[var(--text-muted)]")}>
              {keyHint}
            </p>
          )}

          <Field
            label="Value"
            hint={
              <span className={cn("font-mono text-[0.65rem] normal-case tracking-normal tabular-nums", tooLong && "text-destructive")}>
                {bytes.toLocaleString()} bytes
              </span>
            }
          >
            <textarea
              className={cn(fieldClass, "min-h-28 resize-y font-mono text-[0.8rem] leading-relaxed")}
              rows={value.includes("\n") ? 8 : 4}
              value={value}
              aria-invalid={tooLong ? true : undefined}
              placeholder={"postgres://localhost:5432/app\n\nor a JSON object, a PEM key…"}
              spellCheck={false}
              onChange={(event) => setValue(event.target.value)}
            />
          </Field>
          {json !== undefined && (
            <div className="-mt-2 flex flex-wrap items-center gap-2 text-[0.72rem] text-[var(--text-muted)]">
              <span className="rounded-[5px] px-1.5 py-0.5 font-semibold" style={{ color: "var(--type-json)", background: "color-mix(in srgb, var(--type-json) 13%, transparent)" }}>
                JSON
              </span>
              Valid {Array.isArray(json) ? "array" : "object"}.
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2" onClick={() => reformat(2)}>Format</Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2" onClick={() => reformat(undefined)}>Minify</Button>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-muted/60 px-3 py-2.5">
            <div className="min-w-0">
              <p id="env-var-secret-label" className="m-0 text-[0.8rem] font-medium text-foreground">Secret</p>
              <p className="m-0 text-[0.72rem] text-[var(--text-muted)]">Masked in the list until revealed.</p>
            </div>
            <ToggleSwitch
              aria-labelledby="env-var-secret-label"
              checked={secret}
              onCheckedChange={(checked) => {
                setSecretTouched(true);
                setSecret(checked);
              }}
            />
          </div>

          <Field label="Note" optional>
            <input
              className={fieldClass}
              value={note}
              maxLength={MAX_NOTE_CHARS}
              placeholder="Rotated quarterly · from the team vault"
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>

          {error && <p className="m-0 text-xs text-destructive" role="alert">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!canSave}>{saving ? "Saving…" : mode?.kind === "edit" ? "Save" : "Add variable"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------- */

const importFormats: { value: ImportFormat; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "dotenv", label: ".env" },
  { value: "json", label: "JSON" },
];

const MAX_SHOWN_ERRORS = 4;

export function EnvImportDialog({
  group,
  label,
  onOpenChange,
  onImported,
}: {
  group: EnvGroup | null;
  /** How the set is named to the user: "acme-api · production". */
  label: string;
  onOpenChange: (open: boolean) => void;
  onImported: (report: ImportEnvReport) => void;
}) {
  const [text, setText] = useState("");
  const [format, setFormat] = useState<ImportFormat>("auto");
  const [overwrite, setOverwrite] = useState(false);
  // Keys the user switched away from the parser's secret guess.
  const [secretOverrides, setSecretOverrides] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!group) return;
    setText("");
    setFormat("auto");
    setOverwrite(false);
    setSecretOverrides({});
    setError("");
    setBusy(false);
  }, [group]);

  const parsed = useMemo(() => parseEnvText(text, format), [text, format]);
  const entries: EnvVarEntry[] = parsed.entries.map((entry) => ({
    ...entry,
    secret: secretOverrides[entry.key] ?? entry.secret,
  }));
  const secretCount = entries.filter((entry) => entry.secret).length;
  const hasText = text.trim().length > 0;

  async function readFile(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      setText(await file.text());
      if (file.name.toLowerCase().endsWith(".json")) setFormat("json");
    } catch {
      setError("Could not read that file.");
    }
  }

  async function pasteFromClipboard() {
    setError("");
    try {
      const clipboard = await commands.readClipboardText();
      if (clipboard) setText(clipboard);
      else setError("The clipboard holds no text to paste.");
    } catch {
      setError("Could not read the clipboard.");
    }
  }

  async function runImport() {
    if (!group || entries.length === 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      const report = await commands.importEnvVars({ group_id: group.id, entries, overwrite });
      onImported(report);
      onOpenChange(false);
    } catch (reason) {
      setError(commandMessage(reason, "Could not import these variables."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={group !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" aria-describedby="env-import-description" onKeyDown={submitOnModEnter(() => void runImport())}>
        <DialogHeader>
          <DialogTitle>Import into “{label}”</DialogTitle>
          <DialogDescription id="env-import-description">
            Paste a .env file or a JSON object, or open one. Nothing is written until you import.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <SegmentedRadio name="env-import-format" ariaLabel="Format" value={format} options={importFormats} onChange={setFormat} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void pasteFromClipboard()}>Paste</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>Open file…</Button>
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              accept=".env,.json,.txt,text/plain,application/json"
              onChange={(event) => {
                void readFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
        </div>

        <textarea
          aria-label="Variables to import"
          className={cn(fieldClass, "min-h-36 resize-y font-mono text-[0.78rem] leading-relaxed")}
          rows={7}
          value={text}
          autoFocus
          spellCheck={false}
          placeholder={'DATABASE_URL=postgres://localhost/app\nAPI_TOKEN="…"\n\nor {"PORT": 8080, "FEATURES": {"beta": true}}'}
          onChange={(event) => setText(event.target.value)}
        />

        {hasText && (
          <div className="grid gap-2">
            <p className="m-0 text-[0.78rem] text-muted-foreground" aria-live="polite">
              {entries.length === 0
                ? "No variables found yet."
                : `${entries.length} ${entries.length === 1 ? "variable" : "variables"} read as ${parsed.format === "json" ? "JSON" : ".env"} · ${secretCount} marked secret`}
            </p>
            {parsed.errors.length > 0 && (
              <ul className="m-0 grid list-none gap-0.5 p-0 text-[0.72rem] text-destructive" role="alert">
                {parsed.errors.slice(0, MAX_SHOWN_ERRORS).map((problem, index) => (
                  <li key={index}>{problem.line ? `Line ${problem.line}: ` : ""}{problem.message}</li>
                ))}
                {parsed.errors.length > MAX_SHOWN_ERRORS && <li>…and {parsed.errors.length - MAX_SHOWN_ERRORS} more lines skipped.</li>}
              </ul>
            )}
            {entries.length > 0 && (
              <ul className="m-0 grid max-h-44 list-none gap-px overflow-y-auto rounded-md border border-border p-0" aria-label="Variables found">
                {entries.map((entry) => (
                  <li key={entry.key} className="flex items-center gap-3 bg-card px-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate font-mono text-[0.76rem] font-semibold text-foreground">{entry.key}</span>
                    <span className="min-w-0 max-w-[45%] truncate font-mono text-[0.72rem] text-[var(--text-muted)]">
                      {entry.secret ? "••••••" : entry.value.replace(/\s+/g, " ") || "(empty)"}
                    </span>
                    <CheckboxField
                      className="shrink-0 text-[0.72rem]"
                      checked={entry.secret}
                      onCheckedChange={(checked) => setSecretOverrides((current) => ({ ...current, [entry.key]: checked }))}
                      label={<>Secret<span className="sr-only"> {entry.key}</span></>}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <CheckboxField
          checked={overwrite}
          onCheckedChange={setOverwrite}
          label="Replace values for keys this set already has"
        />

        {error && <p className="m-0 text-xs text-destructive" role="alert">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={entries.length === 0 || busy} onClick={() => void runImport()}>
            {busy ? "Importing…" : entries.length ? `Import ${entries.length}` : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------- */

export function ConfirmDeleteGroupDialog({
  group,
  label,
  onOpenChange,
  onConfirm,
}: {
  group: EnvGroup | null;
  label: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (group: EnvGroup) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  useEffect(() => setBusy(false), [group]);

  return (
    <Dialog open={group !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" role="alertdialog" aria-describedby="env-delete-description">
        <DialogHeader>
          <DialogTitle>Delete “{label}”?</DialogTitle>
          <DialogDescription id="env-delete-description">
            {group?.var_count
              ? `Its ${group.var_count} ${group.var_count === 1 ? "variable goes" : "variables go"} with it. This cannot be undone.`
              : "The set is empty. This cannot be undone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" autoFocus disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => {
              if (!group) return;
              setBusy(true);
              void onConfirm(group).finally(() => setBusy(false));
            }}
          >
            {busy ? "Deleting…" : "Delete set"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

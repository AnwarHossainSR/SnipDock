import { useEffect, useId, useMemo, useRef, useState } from "react";
import { commands } from "../../api/commands";
import type { Project, SaveProjectInput } from "../../api/types";

interface ProjectEditorProps {
  project?: Project | null;
  onSaved: (project: Project) => void;
  onCancel: () => void;
}

interface Fields {
  name: string;
  description: string;
}

type Errors = Partial<Record<keyof Fields, string>>;

function initialFields(project?: Project | null): Fields {
  return {
    name: project?.name ?? "",
    description: project?.description ?? "",
  };
}

function characterCount(value: string) {
  return Array.from(value).length;
}

function validate(fields: Fields): Errors {
  const errors: Errors = {};
  if (!fields.name.trim()) {
    errors.name = "Name is required.";
  } else if (characterCount(fields.name.trim()) > 200) {
    errors.name = "Name must be 200 characters or fewer.";
  }
  if (characterCount(fields.description.trim()) > 1_000) {
    errors.description = "Description must be 1,000 characters or fewer.";
  }
  return errors;
}

export default function ProjectEditor(props: ProjectEditorProps) {
  const { project, onSaved, onCancel } = props;
  const baseline = useMemo(() => initialFields(project), [project]);
  const [fields, setFields] = useState(baseline);
  const [errors, setErrors] = useState<Errors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formId = useId();
  const dirty = JSON.stringify(fields) !== JSON.stringify(baseline);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    setFields(baseline);
    setErrors({});
    setSaveError(null);
  }, [baseline]);

  useEffect(() => {
    if (!dirty) return;
    const guardUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guardUnload);
    return () => window.removeEventListener("beforeunload", guardUnload);
  }, [dirty]);

  function update<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setSaveError(null);
  }

  function cancel() {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onCancel();
  }

  async function save() {
    if (savingRef.current) return;
    const nextErrors = validate(fields);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const description = fields.description.trim();
    const input: SaveProjectInput = {
      id: project?.id ?? null,
      name: fields.name.trim(),
      description: description.length === 0 ? null : description,
      tag_ids: [],
    };

    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      onSaved(await commands.saveProject(input));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save project.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }

  function fieldProps(name: keyof Fields) {
    const error = errors[name];
    return {
      "aria-invalid": error ? (true as const) : undefined,
      "aria-describedby": error ? `${formId}-${name}-error` : undefined,
    };
  }

  return (
    <form
      className="snippet-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      onKeyDown={handleKeyDown}
      noValidate
    >
      <header className="snippet-editor__header">
        <div>
          <p className="snippet-editor__eyebrow">{project ? "Project" : "Create project"}</p>
          <h2 id="workspace-title" tabIndex={-1} ref={headingRef}>
            {project ? "Edit project" : "New project"}
          </h2>
        </div>
        <div className="snippet-editor__actions">
          <button type="button" className="button-secondary" onClick={cancel}>Cancel</button>
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? "Saving…" : "Save project"}
          </button>
        </div>
      </header>

      {saveError && <p className="snippet-editor__save-error" role="alert">{saveError}</p>}

      <label className="snippet-editor__field">
        <span>Name</span>
        <input
          value={fields.name}
          onChange={(event) => update("name", event.target.value)}
          {...fieldProps("name")}
        />
        {errors.name && <small id={`${formId}-name-error`}>{errors.name}</small>}
      </label>

      <label className="snippet-editor__field">
        <span>Description</span>
        <textarea
          className="snippet-editor__description"
          value={fields.description}
          onChange={(event) => update("description", event.target.value)}
          {...fieldProps("description")}
        />
        {errors.description && (
          <small id={`${formId}-description-error`}>{errors.description}</small>
        )}
      </label>

      <p className="snippet-editor__shortcut">Ctrl/⌘ S to save · Esc to cancel</p>
    </form>
  );
}

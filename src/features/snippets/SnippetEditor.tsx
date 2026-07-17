import { useEffect, useId, useMemo, useRef, useState } from "react";
import { commands } from "../../lib/commands";
import type { ItemKind, LibraryItem, SaveItemInput } from "../../lib/types";

type EditableKind = Exclude<ItemKind, "clipboard">;

interface SnippetEditorProps {
  item?: LibraryItem | null;
  onSaved: (item: LibraryItem) => void;
  onCancel: () => void;
}

interface Fields {
  kind: EditableKind;
  title: string;
  description: string;
  content: string;
  notes: string;
}

type Errors = Partial<Record<keyof Fields, string>>;

const kinds: { value: EditableKind; label: string }[] = [
  { value: "snippet", label: "Snippet" },
  { value: "command", label: "Command" },
  { value: "template", label: "Template" },
  { value: "note", label: "Note" },
];

function initialFields(item?: LibraryItem | null): Fields {
  const editableKind = item && item.kind !== "clipboard" ? item.kind : "snippet";
  return {
    kind: editableKind,
    title: item?.title ?? "",
    description: item?.description ?? "",
    content: item?.content ?? "",
    notes: item?.notes ?? "",
  };
}

function characterCount(value: string) {
  return Array.from(value).length;
}

function validate(fields: Fields): Errors {
  const errors: Errors = {};
  if ((fields.kind === "snippet" || fields.kind === "template") && !fields.title.trim()) {
    errors.title = `Title is required for ${fields.kind}s.`;
  } else if (characterCount(fields.title) > 200) {
    errors.title = "Title must be 200 characters or fewer.";
  }
  if (characterCount(fields.description) > 1_000) {
    errors.description = "Description must be 1,000 characters or fewer.";
  }
  if (new TextEncoder().encode(fields.content).length === 0) {
    errors.content = "Content is required.";
  } else if (new TextEncoder().encode(fields.content).length > 1_000_000) {
    errors.content = "Content must be 1,000,000 bytes or fewer.";
  }
  if (characterCount(fields.notes) > 10_000) {
    errors.notes = "Notes must be 10,000 characters or fewer.";
  }
  return errors;
}

function optional(value: string) {
  return value.length === 0 ? null : value;
}

export default function SnippetEditor(props: SnippetEditorProps) {
  const { item, onSaved, onCancel } = props;
  const baseline = useMemo(() => initialFields(item), [item]);
  const [fields, setFields] = useState(baseline);
  const [errors, setErrors] = useState<Errors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formId = useId();
  const dirty = JSON.stringify(fields) !== JSON.stringify(baseline);
  const kindName = fields.kind;

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

    const input: SaveItemInput = {
      id: item?.id ?? null,
      kind: fields.kind,
      title: fields.title.trim() ? fields.title : null,
      description: optional(fields.description),
      content: fields.content,
      notes: optional(fields.notes),
      project_id: item?.project_id ?? null,
      category_id: item?.category_id ?? null,
      tag_ids: [...(item?.tag_ids ?? [])],
      private: item?.private ?? false,
      expires_at: item?.expires_at ?? null,
    };

    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      onSaved(await commands.saveItem(input));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save item.");
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
          <p className="snippet-editor__eyebrow">{item ? "Library item" : "Create item"}</p>
          <h2 id="workspace-title" tabIndex={-1} ref={headingRef}>
            {item ? `Edit ${kindName}` : `New ${kindName}`}
          </h2>
        </div>
        <div className="snippet-editor__actions">
          <button type="button" className="button-secondary" onClick={cancel}>Cancel</button>
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? "Saving…" : `Save ${kindName}`}
          </button>
        </div>
      </header>

      {saveError && <p className="snippet-editor__save-error" role="alert">{saveError}</p>}

      <div className="snippet-editor__metadata">
        <label className="snippet-editor__field snippet-editor__kind">
          <span>Kind</span>
          <select
            value={fields.kind}
            onChange={(event) => update("kind", event.target.value as EditableKind)}
          >
            {kinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
          </select>
        </label>
        <label className="snippet-editor__field">
          <span>Title</span>
          <input
            value={fields.title}
            onChange={(event) => update("title", event.target.value)}
            {...fieldProps("title")}
          />
          {errors.title && <small id={`${formId}-title-error`}>{errors.title}</small>}
        </label>
      </div>

      <label className="snippet-editor__field">
        <span>Description</span>
        <textarea
          className="snippet-editor__description"
          value={fields.description}
          onChange={(event) => update("description", event.target.value)}
          {...fieldProps("description")}
        />
        {errors.description && <small id={`${formId}-description-error`}>{errors.description}</small>}
      </label>

      <label className="snippet-editor__field snippet-editor__content">
        <span>Content</span>
        <textarea
          value={fields.content}
          onChange={(event) => update("content", event.target.value)}
          spellCheck={false}
          {...fieldProps("content")}
        />
        {errors.content && <small id={`${formId}-content-error`}>{errors.content}</small>}
      </label>

      <label className="snippet-editor__field">
        <span>Notes</span>
        <textarea
          value={fields.notes}
          onChange={(event) => update("notes", event.target.value)}
          {...fieldProps("notes")}
        />
        {errors.notes && <small id={`${formId}-notes-error`}>{errors.notes}</small>}
      </label>

      <p className="snippet-editor__shortcut">Ctrl/⌘ S to save · Esc to cancel</p>
    </form>
  );
}

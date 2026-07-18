import { useState } from "react";
import { commands } from "../../api/commands";
import type { LibraryItem } from "../../api/types";

interface ReminderEditorProps {
  items: LibraryItem[];
  onSaved: (item: LibraryItem) => void;
}

export default function ReminderEditor({ items, onSaved }: ReminderEditorProps) {
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [expiresAt, setExpiresAt] = useState("");
  const [message, setMessage] = useState("");

  async function save() {
    const item = items.find((entry) => entry.id === itemId);
    if (!item || !expiresAt) return;
    const saved = await commands.saveItem({
      id: item.id,
      kind: item.kind === "clipboard" ? "snippet" : item.kind,
      title: item.title || "Reminder",
      description: item.description,
      content: item.content,
      notes: item.notes,
      project_id: item.project_id,
      category_id: item.category_id,
      tag_ids: item.tag_ids,
      private: item.private,
      expires_at: new Date(expiresAt).toISOString(),
    });
    onSaved(saved);
    setMessage("Reminder saved.");
  }

  return (
    <section className="template-fill" aria-label="Reminder and expiry">
      <h3>Reminder</h3>
      <label className="snippet-editor__field">
        <span>Item</span>
        <select value={itemId} onChange={(event) => setItemId(event.target.value)}>
          {items.map((item) => (
            <option value={item.id} key={item.id}>{item.title || item.content.slice(0, 48)}</option>
          ))}
        </select>
      </label>
      <label className="snippet-editor__field">
        <span>Expires at</span>
        <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
      </label>
      <button type="button" className="button-primary" disabled={!itemId || !expiresAt} onClick={() => void save()}>
        Save reminder
      </button>
      <p className="sr-only" aria-live="polite">{message}</p>
    </section>
  );
}

import { useEffect, useRef } from "react";
import type { ReleaseNote } from "../../api/releaseNotes";

export default function WhatsNewModal({
  note,
  onClose,
}: {
  note: ReleaseNote;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.focus();
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  }

  return (
    <div className="whats-new-backdrop">
      <div
        ref={dialog}
        className="whats-new-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <p className="panel-label">What's new</p>
        <h3 id="whats-new-title">Updated to SnipDock v{note.version}</h3>
        <ul className="whats-new-list">
          {note.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
        <div className="whats-new-actions">
          <button className="button-primary" type="button" autoFocus onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

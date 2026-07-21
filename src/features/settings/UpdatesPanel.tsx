import { useState } from "react";
import { commands } from "../../api/commands";
import type { UpdateInfo } from "../../api/types";

type Status = "idle" | "checking" | "current" | "available" | "installing";

export default function UpdatesPanel() {
  const [status, setStatus] = useState<Status>("idle");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState("");

  const busy = status === "checking" || status === "installing";

  async function check() {
    setStatus("checking");
    setError("");
    try {
      const found = await commands.checkForUpdate();
      setUpdate(found);
      setStatus(found ? "available" : "current");
    } catch (reason) {
      setStatus("idle");
      setError(reason instanceof Error ? reason.message : "Could not check for updates.");
    }
  }

  async function install() {
    setStatus("installing");
    setError("");
    try {
      await commands.installUpdate();
    } catch (reason) {
      setStatus("available");
      setError(reason instanceof Error ? reason.message : "Update could not be installed.");
    }
  }

  return (
    <section className="section-panel" aria-labelledby="settings-updates">
      <header>
        <p className="panel-label">Updates</p>
        <h3 id="settings-updates">App version</h3>
        <p>Check GitHub Releases for a signed update and review its release notes before installing.</p>
      </header>

      {error && <p className="action-error" role="alert">{error}</p>}

      {status === "current" && (
        <p className="template-preview__note" role="status">SnipDock is up to date.</p>
      )}

      {update && (status === "available" || status === "installing") && (
        <div className="update-notice" role="status">
          <p><strong>Version {update.version} is available.</strong>{update.date ? ` Released ${update.date}.` : ""}</p>
          {update.notes && (
            <details className="update-notes" open>
              <summary>Release notes</summary>
              <pre className="update-notes__body">{update.notes}</pre>
            </details>
          )}
        </div>
      )}

      <div className="snippet-editor__actions">
        <button type="button" className="button-secondary" disabled={busy} onClick={() => void check()}>
          {status === "checking" ? "Checking…" : "Check for updates"}
        </button>
        {(status === "available" || status === "installing") && (
          <button type="button" className="button-primary" disabled={busy} onClick={() => void install()}>
            {status === "installing" ? "Installing…" : "Install and restart"}
          </button>
        )}
      </div>
    </section>
  );
}

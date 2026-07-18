import { useEffect, useState } from "react";
import { commands } from "../../api/commands";
import type { SyncStatus } from "../../api/types";

export default function SyncSettings() {
  const [status, setStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    commands.getSyncStatus().then(setStatus, () => setStatus(null));
  }, []);

  return (
    <section className="snippet-detail" aria-labelledby="settings-sync">
      <header className="snippet-detail__header">
        <div>
          <span className="snippet-detail__kind">Sync</span>
          <h3 id="settings-sync">Encrypted sync</h3>
        </div>
      </header>
      <p className="template-preview__note">
        {status?.enabled ? "Sync enabled." : "Sync is off. No network requests are made."}
      </p>
      {status && (
        <div className="activity-item">
          <strong>Device</strong>
          <span>{status.device_id.slice(0, 8)}</span>
        </div>
      )}
      {status?.conflicts.map((conflict) => (
        <div className="activity-item" key={conflict}>
          <strong>{conflict}</strong>
          <span>Choose local, remote, or keep both when sync is enabled.</span>
        </div>
      ))}
    </section>
  );
}

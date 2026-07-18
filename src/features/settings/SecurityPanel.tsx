import { useState } from "react";
import { commands } from "../../api/commands";

export default function SecurityPanel() {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");

  async function unlock() {
    const result = await commands.unlockApp({ pin, use_biometric: false });
    setMessage(result.unlocked ? "App unlocked." : `Try again in ${result.retry_after_seconds ?? 0} seconds.`);
  }

  async function lock() {
    await commands.lockApp();
    setMessage("App locked.");
  }

  return (
    <section className="snippet-detail" aria-labelledby="settings-security-panel">
      <header className="snippet-detail__header">
        <div>
          <span className="snippet-detail__kind">Security</span>
          <h3 id="settings-security-panel">Lock and private mode</h3>
        </div>
      </header>
      <label className="snippet-editor__field">
        <span>PIN</span>
        <input type="password" value={pin} onChange={(event) => setPin(event.target.value)} />
      </label>
      <div className="snippet-editor__actions">
        <button type="button" className="button-primary" onClick={() => void unlock()}>Unlock</button>
        <button type="button" onClick={() => void lock()}>Lock</button>
      </div>
      <p className="template-preview__note" role="status">{message}</p>
    </section>
  );
}

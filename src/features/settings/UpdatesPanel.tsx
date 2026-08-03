import { useState } from "react";
import { commands } from "../../api/commands";
import type { UpdateInfo } from "../../api/types";
import { parseChangelog } from "../../lib/changelog";
import { Button } from "@/components/ui/button";
import ChangelogView from "../../app/components/ChangelogView";

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
    <section className="mb-4 grid content-start gap-4 rounded-lg border border-border bg-card p-5" aria-labelledby="settings-updates">
      <header className="grid gap-1 [&_h3]:m-0 [&_h3]:font-semibold">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-primary">Updates</p>
        <h3 id="settings-updates">App version</h3>
        <p className="mt-2 text-xs text-muted-foreground">Check GitHub Releases for a signed update and review its release notes before installing.</p>
      </header>

      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}

      {status === "current" && (
        <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground" role="status">SnipDock is up to date.</p>
      )}

      {update && (status === "available" || status === "installing") && (
        <div className="grid gap-3 rounded-md border border-border bg-muted p-4" role="status">
          <p className="m-0"><strong>Version {update.version} is available.</strong>{update.date ? ` Released ${update.date}.` : ""}</p>
          <details open>
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Release notes</summary>
            <div className="mt-2 max-h-64 overflow-auto rounded-sm border border-border bg-card p-3">
              <ChangelogView notes={update.notes} />
            </div>
          </details>
        </div>
      )}

      <div className="flex items-center gap-2 max-[38rem]:w-full [&>*]:max-[38rem]:flex-1">
        <Button variant="outline" type="button" disabled={busy} onClick={() => void check()}>
          {status === "checking" ? "Checking…" : "Check for updates"}
        </Button>
        {(status === "available" || status === "installing") && (
          <Button
            type="button"
            disabled={busy || !update || (update.notes !== null && !parseChangelog(update.notes).hasContent)}
            onClick={() => void install()}
          >
            {status === "installing" ? "Installing…" : "Install and restart"}
          </Button>
        )}
      </div>
    </section>
  );
}

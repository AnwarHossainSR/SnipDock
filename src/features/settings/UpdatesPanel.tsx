import { useState } from "react";
import { commands } from "../../api/commands";
import type { UpdateFrequency, UpdateInfo } from "../../api/types";
import { useAppUpdate } from "../../hooks/useAppUpdate";
import { Button } from "@/components/ui/button";
import { PanelHeader, PanelStat } from "@/components/ui/panel-header";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { TogglePill } from "@/components/ui/toggle-pill";
import ChangelogView from "../../app/components/ChangelogView";
import { GITHUB_URL } from "../../lib/constants";

type Status = "idle" | "checking" | "current" | "available" | "installing";

const frequencies: [UpdateFrequency, string][] = [
  ["on_launch", "On launch"],
  ["daily", "Daily"],
  ["weekly", "Weekly"],
];

function formatChecked(timestamp: string | null): string {
  if (!timestamp) return "Never checked";
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "Never checked";
  return `Last checked ${parsed.toLocaleString()}`;
}

export default function UpdatesPanel({ className }: { className?: string }) {
  const update = useAppUpdate();
  // Checks started from this panel are the user's own, and their result is
  // shown here rather than as a modal: they came to look, so a dialog on top of
  // the answer would be in the way.
  const [status, setStatus] = useState<Status>("idle");
  const [found, setFound] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState("");

  const settings = update.settings;
  const busy = status === "checking" || status === "installing" || update.installing;
  // A background check may already have turned one up before this panel opened.
  const available = found ?? update.update;

  async function check() {
    setStatus("checking");
    setError("");
    try {
      const result = await commands.checkForUpdate();
      setFound(result);
      setStatus(result ? "available" : "current");
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
    <section className={className} aria-labelledby="settings-updates">
      <PanelHeader
        eyebrow="Updates"
        title="Version and updates"
        titleId="settings-updates"
        description="SnipDock checks GitHub Releases for a signed update. Nothing from your clipboard is sent."
        action={
          <PanelStat label="Installed">
            <span className="font-mono tabular-nums">v{update.currentVersion || "…"}</span>
          </PanelStat>
        }
      />

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* The state readout. `current` and `available` are the two answers a
          check can give, and each says what to do next rather than only what
          happened. */}
      {status === "current" && !available && (
        <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground" role="status">
          SnipDock is up to date. Nothing to install.
        </p>
      )}

      {available ? (
        <div className="grid gap-3 rounded-md border border-[var(--accent)] bg-accent/40 p-4" role="status">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="m-0 text-sm font-semibold">
              Version {available.version} is available
              {available.date ? ` · released ${available.date.slice(0, 10)}` : ""}
            </p>
            <a
              className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
              href={`${GITHUB_URL}/releases/tag/v${available.version}`}
              target="_blank"
              rel="noreferrer"
            >
              Open on GitHub
            </a>
          </div>
          <div className="max-h-64 overflow-auto rounded-sm border border-border bg-card p-3">
            {available.notes && available.notes.trim() ? (
              <ChangelogView notes={available.notes} />
            ) : (
              <p className="m-0 text-sm text-muted-foreground">
                No release notes were published for this version.
              </p>
            )}
          </div>
          {settings?.skipped_version === available.version && (
            <p className="text-xs text-muted-foreground">
              You skipped this version, so it will not be offered on launch. Installing it here
              still works.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">
          {formatChecked(settings?.last_checked_at ?? null)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" type="button" disabled={busy} onClick={() => void check()}>
          {status === "checking" ? "Checking…" : "Check for updates"}
        </Button>
        {/* Enabled whenever an update exists. It used to be disabled unless the
            release body parsed into changelog sections, which made a release
            with plain or empty notes impossible to install from here. */}
        <Button type="button" disabled={busy || !available} onClick={() => void install()}>
          {status === "installing" || update.installing
            ? "Installing…"
            : available
              ? `Install v${available.version} and restart`
              : "Install update"}
        </Button>
        {!available && status !== "checking" && (
          <span className="text-xs text-[var(--text-muted)]">
            Nothing to install until a check finds a newer version.
          </span>
        )}
      </div>

      <div className="grid gap-3 border-t border-border pt-4">
        <label
          className="flex min-h-12 items-center justify-between gap-4 [&>span]:grid [&>span]:gap-1 [&_small]:font-normal [&_small]:text-muted-foreground"
          htmlFor="setting-update-notify"
        >
          <span>
            <strong>Tell me when an update is available</strong>
            <small>Shows the release notes on launch, with the choice to install, skip, or wait.</small>
          </span>
          <ToggleSwitch
            id="setting-update-notify"
            aria-label="Tell me when an update is available"
            checked={settings?.notify ?? true}
            disabled={!settings}
            onCheckedChange={update.setNotify}
          />
        </label>

        {settings?.notify && (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-xs font-semibold text-muted-foreground">
              How often to check
            </legend>
            <div className="flex flex-wrap gap-2">
              {frequencies.map(([value, label]) => (
                <TogglePill
                  key={value}
                  pressed={settings.frequency === value}
                  onClick={() => update.setFrequency(value)}
                >
                  {label}
                </TogglePill>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    </section>
  );
}

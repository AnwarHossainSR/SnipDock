import { useState } from "react";
import { commands } from "../../api/commands";
import type { UpdateFrequency, UpdateInfo } from "../../api/types";
import { useAppUpdate } from "../../hooks/useAppUpdate";
import { Button } from "@/components/ui/button";
import {
  SettingRow,
  SettingSection,
  SettingStatusPill,
} from "@/components/ui/setting-section";
import { cn } from "@/lib/utils";
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
    <SettingSection
      // An available update is the one card on the page that asks for an
      // action, so it is the one that is allowed to raise its voice.
      className={cn(className, available && "border-primary/30 ring-[3px] ring-primary/[0.06]")}
      title="Version and updates"
      titleId="settings-updates"
      description="SnipDock checks GitHub Releases for a signed update. Nothing from your clipboard is sent."
      icon={
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]">
          <path d="M12 20V8m0 0 4 4m-4-4-4 4" />
          <path d="M5 4.5h14" />
        </svg>
      }
      action={
        <SettingStatusPill tone={available ? "var(--accent)" : "var(--text-muted)"}>
          <span className="font-mono tabular-nums">v{update.currentVersion || "…"}</span>
        </SettingStatusPill>
      }
    >
      {error && (
        <SettingRow>
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        </SettingRow>
      )}

      <SettingRow
        title={available ? `Update available · v${available.version}` : "Check for updates"}
        description={formatChecked(settings?.last_checked_at ?? null)}
        control={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" type="button" disabled={busy} onClick={() => void check()}>
              {status === "checking" ? "Checking…" : "Check for updates"}
            </Button>
            {/* Enabled whenever an update exists. It used to be disabled unless
                the release body parsed into changelog sections, which made a
                release with plain or empty notes impossible to install here. */}
            <Button type="button" disabled={busy || !available} onClick={() => void install()}>
              {status === "installing" || update.installing
                ? "Installing…"
                : available
                  ? `Install v${available.version} and restart`
                  : "Install update"}
            </Button>
          </div>
        }
      >
        {available && (
          <div className="grid gap-3" role="status">
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
            <div className="max-h-64 overflow-auto rounded-md border border-border bg-background p-3">
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
        )}
        {status === "current" && !available && (
          <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground" role="status">
            SnipDock is up to date. Nothing to install.
          </p>
        )}
        {!available && status !== "checking" && (
          <span className="text-xs text-[var(--text-muted)]">
            Nothing to install until a check finds a newer version.
          </span>
        )}
      </SettingRow>

      <SettingRow
        title="Tell me when an update is available"
        description="Shows the release notes on launch, with the choice to install, skip, or wait."
        control={
          <ToggleSwitch
            id="setting-update-notify"
            aria-label="Tell me when an update is available"
            checked={settings?.notify ?? true}
            disabled={!settings}
            onCheckedChange={update.setNotify}
          />
        }
      />

      {settings?.notify && (
        <SettingRow
          title="How often to check"
          control={
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
          }
        />
      )}
    </SettingSection>
  );
}

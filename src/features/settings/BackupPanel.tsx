import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import { commands } from "../../api/commands";
import type {
  BackupSchedule,
  JsonValue,
  BackupSettings,
  BackupRunReport,
  CloudBackupSettings,
  CloudProvider,
  LocalBackup,
} from "../../api/types";
import { formatBytes } from "../../lib/formatBytes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SettingRow,
  SettingSection,
  SettingStatusPill,
} from "@/components/ui/setting-section";
import { Toast } from "@/components/ui/toast";
import { formatDateTime, formatRelativeTime } from "../../lib/relativeTime";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { TogglePill } from "@/components/ui/toggle-pill";
import { cn } from "@/lib/utils";

const fieldClass =
  "w-full rounded-sm border border-border bg-muted px-3 py-2 text-sm font-normal text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const labelClass = "grid content-start gap-1.5 text-xs font-semibold text-muted-foreground";
const hintClass = "font-normal normal-case tracking-normal text-[var(--text-muted)]";

const schedules: [BackupSchedule, string, string][] = [
  ["manual", "Manual", "Only when you press Back up now"],
  ["daily", "Daily", "Once every 24 hours while SnipDock runs"],
  ["weekly", "Weekly", "Once every 7 days while SnipDock runs"],
];

const providers: [CloudProvider, string][] = [
  ["none", "Off"],
  ["s3", "Amazon S3"],
  ["r2", "Cloudflare R2"],
];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const INTERVALS: Record<BackupSchedule, number | null> = { manual: null, daily: DAY, weekly: 7 * DAY };

/** How long a toast stays. A failure gets longer: it is the one worth reading. */
const NOTICE_MS = { success: 3200, error: 6000 } as const;

type Action = "backup" | "test" | "export" | "preview" | "restore" | "refresh";
type Tone = "success" | "warning" | "error";

interface Notice {
  tone: "success" | "error";
  text: string;
}

/** The detail of the last thing the panel was asked to do, kept on screen. */
interface Outcome {
  tone: Tone;
  title: string;
  lines: string[];
}

interface PendingConfirm {
  title: string;
  body: string;
  confirmLabel: string;
  run: () => Promise<void>;
}

const toneColor: Record<Tone | "muted" | "busy", string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  error: "var(--danger)",
  muted: "var(--text-muted)",
  busy: "var(--accent)",
};

function tinted(tone: string) {
  return {
    borderColor: `color-mix(in srgb, ${tone} 30%, var(--border))`,
    background: `color-mix(in srgb, ${tone} 7%, var(--surface-1))`,
  };
}

function messageOf(reason: unknown, fallback: string): string {
  const message = reason instanceof Error && reason.message ? reason.message : fallback;
  // Rust errors are written as clauses ("no backup destination is turned on").
  return message.charAt(0).toUpperCase() + message.slice(1);
}

/**
 * What an armed provider still needs. Mirrors `validate_backup` in
 * src-tauri/src/storage/settings.rs, which refuses the whole `backup` object
 * while any of these is missing. Checking here first is what lets a
 * half-typed destination stay a draft instead of failing on every field.
 */
export function missingCloudFields(cloud: CloudBackupSettings): string[] {
  if (cloud.provider === "none") return [];
  const missing: string[] = [];
  if (!cloud.bucket.trim()) missing.push("a bucket");
  if (!cloud.access_key_id.trim() || !cloud.secret_access_key) missing.push("an access key and secret");
  if (!cloud.passphrase) missing.push("a backup password");
  const endpoint = cloud.endpoint.trim();
  if (cloud.provider === "r2" && !endpoint) missing.push("the account endpoint");
  if (cloud.provider === "s3" && !endpoint && !cloud.region.trim()) missing.push("a region");
  if (endpoint && !endpoint.startsWith("https://")) missing.push("an https:// endpoint");
  return missing;
}

function listPhrase(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The one-line summary Rust records in `last_result`, for a run this panel just saw. */
function describeRun(report: BackupRunReport): string {
  if (report.local_path && report.cloud_url) return `Saved to ${report.local_path} and uploaded to ${report.cloud_url}`;
  if (report.local_path) return `Saved to ${report.local_path}`;
  if (report.cloud_url) return `Uploaded to ${report.cloud_url}`;
  return "Nothing was written";
}

function timeOf(stamp: string | null): number {
  const parsed = stamp ? Date.parse(stamp) : Number.NaN;
  return Number.isNaN(parsed) ? -Infinity : parsed;
}

/**
 * Keeps whichever record of the last run is newer. A run this panel saw is
 * applied straight away; a re-read from disk can then only move it forward,
 * so a slow or failed read never puts "Never" back over a backup that just
 * finished - and a scheduled run that happened in the background still shows.
 */
function withLatestRun(current: BackupSettings, other: BackupSettings): BackupSettings {
  if (timeOf(other.last_run_at) < timeOf(current.last_run_at)) return current;
  return { ...current, last_run_at: other.last_run_at, last_result: other.last_result };
}

type RunState = "never" | "ok" | "failed";

function runState(settings: BackupSettings): RunState {
  if (!settings.last_run_at) return "never";
  return settings.last_result?.startsWith("Failed") ? "failed" : "ok";
}

function untilText(ms: number): string {
  if (ms < HOUR) return "in under an hour";
  if (ms < DAY) return `in ${Math.round(ms / HOUR)}h`;
  const days = Math.round(ms / DAY);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** The schedule, said as what happens next rather than as a setting. */
function scheduleLine(settings: BackupSettings, now: number): string {
  const interval = INTERVALS[settings.schedule];
  if (interval === null) return "Automatic backups are off. Back up now, or pick a schedule below.";
  const last = timeOf(settings.last_run_at);
  const due = last + interval;
  // The scheduler wakes hourly, so "due" means within the hour, not this second.
  if (due <= now) return "The next automatic backup is due and runs within the hour while SnipDock is open.";
  return `Next automatic backup ${untilText(due - now)}.`;
}

/** Re-renders once a minute so "2m ago" and "in 21h" do not go stale on screen. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none",
        className,
      )}
    />
  );
}

function StatusGlyph({ state }: { state: RunState | "busy" }) {
  if (state === "busy") return <Spinner className="size-4" />;
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2.2]">
      {state === "ok" && <path d="m5 12 4.5 4.5L19 7" />}
      {state === "failed" && <path d="M12 8v5M12 16.5v.01M12 3.5l9 16H3Z" />}
      {state === "never" && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </>
      )}
    </svg>
  );
}

/** A button that says what it is doing while it does it. */
function ActionButton({
  running,
  runningLabel,
  children,
  ...props
}: ComponentProps<typeof Button> & { running: boolean; runningLabel: string }) {
  return (
    <Button aria-busy={running || undefined} {...props}>
      {running && <Spinner />}
      {running ? runningLabel : children}
    </Button>
  );
}

/**
 * Backup destinations, schedule, and the list of what can be restored.
 *
 * Two destinations, on purpose. A local copy is a plain SQLite file that any
 * tool can open if SnipDock itself will not start. An upload is sealed on this
 * machine first, so the bucket only ever holds ciphertext — which is why a
 * password is required before a provider can be turned on.
 *
 * The status card at the top is the point of the panel: it says whether the
 * last backup worked, from what Rust recorded, so a failed run can never read
 * as a date in green.
 */
export default function BackupPanel({ className }: { className?: string }) {
  /** What the form shows, including a cloud destination still being typed. */
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  /** The last copy the backend accepted, which is what a backup actually uses. */
  const [persisted, setPersisted] = useState<BackupSettings | null>(null);
  const [backups, setBackups] = useState<LocalBackup[]>([]);
  const [action, setAction] = useState<Action | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirming, setConfirming] = useState<PendingConfirm | null>(null);
  const [restorePath, setRestorePath] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [exportPath, setExportPath] = useState("");
  const [exportPassword, setExportPassword] = useState("");
  const mounted = useRef(true);
  const now = useNow();
  const busy = action !== null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS[notice.tone]);
    return () => clearTimeout(timer);
  }, [notice]);

  const notify = useCallback((tone: Notice["tone"], text: string) => setNotice({ tone, text }), []);

  const refreshBackups = useCallback(async () => {
    try {
      const listed = await commands.listLocalBackups();
      if (mounted.current) setBackups(listed);
    } catch {
      // The list is a convenience; failing to read a folder must not take the
      // destination controls down with it.
    }
  }, []);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const loaded = (await commands.getSettings()).backup;
      if (!mounted.current) return;
      setPersisted(loaded);
      setSettings(loaded);
    } catch {
      if (mounted.current) setLoadError("Could not load backup settings.");
    }
  }, []);

  /** Re-reads what Rust recorded about the last run, and the backup list. */
  const reconcile = useCallback(async () => {
    try {
      const loaded = (await commands.getSettings()).backup;
      if (!mounted.current) return;
      setSettings((current) => (current ? withLatestRun(current, loaded) : current));
      setPersisted((current) => (current ? withLatestRun(current, loaded) : current));
    } catch {
      // The status already shows what this panel saw; a failed re-read leaves it.
    }
    await refreshBackups();
  }, [refreshBackups]);

  useEffect(() => {
    void load();
    void refreshBackups();
  }, [load, refreshBackups]);

  // A scheduled backup runs in the background; coming back to the window is
  // when someone looks, so that is when the status is re-read.
  useEffect(() => {
    if (!settings) return;
    const onFocus = () => void reconcile();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [Boolean(settings), reconcile]); // eslint-disable-line react-hooks/exhaustive-deps

  function recordRun(at: string, result: string) {
    const apply = (current: BackupSettings | null) =>
      current ? { ...current, last_run_at: at, last_result: result } : current;
    setSettings(apply);
    setPersisted(apply);
  }

  /**
   * Writes the whole `backup` object every time. The settings patch replaces a
   * key rather than merging into it, so sending a partial object here would
   * silently blank every field it left out.
   *
   * A cloud destination is only sent once it is complete: the backend refuses
   * the whole object otherwise, which used to fail every field as it was typed
   * and leave the form showing a provider that was never turned on. Until then
   * the last accepted destination is written, and the form keeps the draft.
   */
  async function save(
    changes: Partial<BackupSettings>,
    cloud?: Partial<CloudBackupSettings>,
    note?: string,
  ) {
    if (!settings || !persisted) return;
    const draft: BackupSettings = { ...settings, ...changes, cloud: { ...settings.cloud, ...cloud } };
    setSettings(draft);
    const cloudReady = missingCloudFields(draft.cloud).length === 0;
    const outgoing: BackupSettings = { ...draft, cloud: cloudReady ? draft.cloud : persisted.cloud };
    // A blur with nothing changed is not a save, and not worth a notice.
    if (JSON.stringify(outgoing) === JSON.stringify(persisted)) return;

    const providerName = providers.find(([value]) => value === outgoing.cloud.provider)?.[1];
    const uploadsChanged = outgoing.cloud.provider !== persisted.cloud.provider;
    const message =
      note ??
      (uploadsChanged
        ? outgoing.cloud.provider === "none"
          ? "Uploads turned off"
          : `Uploads to ${providerName} are on`
        : "Backup settings saved");
    try {
      // `SettingsPatch` values are `JsonValue`, which a named interface does
      // not structurally satisfy without an index signature.
      const saved = (await commands.saveSettings({ values: { backup: outgoing as unknown as JsonValue } })).backup;
      if (!mounted.current) return;
      setPersisted(saved);
      setSettings((current) => (current ? { ...saved, cloud: cloudReady ? saved.cloud : current.cloud } : current));
      setSaveError("");
      notify("success", message);
    } catch (reason) {
      if (!mounted.current) return;
      const text = messageOf(reason, "Could not save backup settings.");
      // Back to what is in effect, so the form never shows a setting that is
      // not - but keep what was typed into the destination fields.
      setSettings((current) => (current ? { ...persisted, cloud: current.cloud } : current));
      setSaveError(text);
      notify("error", "Could not save backup settings");
    }
  }

  async function backUpNow() {
    setAction("backup");
    setOutcome(null);
    try {
      const report = await commands.runBackupNow();
      recordRun(report.created_at || new Date().toISOString(), describeRun(report));
      if (report.warnings.length) {
        setOutcome({ tone: "warning", title: "Backed up, with warnings", lines: report.warnings });
        notify("error", "Backup finished with warnings");
      } else {
        notify("success", `Backup complete · ${formatBytes(report.bytes)}`);
      }
    } catch (reason) {
      recordRun(new Date().toISOString(), `Failed: ${messageOf(reason, "Backup failed.")}`);
      notify("error", "Backup failed");
    } finally {
      await reconcile();
      if (mounted.current) setAction(null);
    }
  }

  async function testDestination() {
    setAction("test");
    setOutcome(null);
    try {
      const report = await commands.testBackupDestination();
      setOutcome({ tone: "success", title: "Connection works", lines: [report] });
      notify("success", "Connection works");
    } catch (reason) {
      setOutcome({
        tone: "error",
        title: "Could not reach the bucket",
        lines: [messageOf(reason, "Could not reach the bucket.")],
      });
      notify("error", "Connection failed");
    } finally {
      if (mounted.current) setAction(null);
    }
  }

  async function confirmAndRun() {
    const pending = confirming;
    setConfirming(null);
    if (pending) await pending.run();
  }

  function restoreLocal(backup: LocalBackup) {
    setConfirming({
      title: "Restore this backup?",
      body: `${backup.name} replaces all current SnipDock data, and SnipDock restarts to load it.`,
      confirmLabel: "Restore and restart",
      run: async () => {
        setAction("restore");
        setOutcome(null);
        try {
          const report = await commands.restoreLocalBackup(backup.path, false);
          setOutcome({
            tone: "success",
            title: "Restore staged",
            lines: [`${backup.name}, ${report.item_count} items. Restarting…`],
          });
          notify("success", "Restore staged. Restarting…");
          if (report.restart_required) await commands.restartApp();
        } catch (reason) {
          setOutcome({ tone: "error", title: "Restore failed", lines: [messageOf(reason, "Restore failed.")] });
          notify("error", "Restore failed");
        } finally {
          if (mounted.current) setAction(null);
        }
      },
    });
  }

  /**
   * A one-off encrypted file, for taking a backup somewhere SnipDock does not
   * manage -- a USB stick, another machine. Same envelope as an upload, so it
   * restores through the same path.
   */
  async function exportEncrypted() {
    setAction("export");
    setOutcome(null);
    try {
      const receipt = await commands.createBackup({ path: exportPath, passphrase: exportPassword });
      setOutcome({
        tone: "success",
        title: "Encrypted backup created",
        lines: [receipt.path, `Checksum ${receipt.checksum}`],
      });
      notify("success", "Encrypted backup created");
    } catch (reason) {
      setOutcome({ tone: "error", title: "Backup failed", lines: [messageOf(reason, "Backup failed.")] });
      notify("error", "Backup failed");
    } finally {
      if (mounted.current) setAction(null);
    }
  }

  async function restoreFromFile(dryRun: boolean) {
    setAction(dryRun ? "preview" : "restore");
    setOutcome(null);
    try {
      const report = await commands.restoreBackup({
        path: restorePath,
        passphrase: restorePassword,
        dry_run: dryRun,
      });
      const summary = `${report.item_count} items, schema ${report.schema_version}.`;
      setOutcome({
        tone: report.warnings.length ? "warning" : "success",
        title: dryRun ? "This backup can be restored" : "Restore staged. Restarting…",
        lines: [summary, ...report.warnings],
      });
      notify("success", dryRun ? `Backup checked: ${report.item_count} items` : "Restore staged. Restarting…");
      if (!dryRun && report.restart_required) await commands.restartApp();
    } catch (reason) {
      setOutcome({ tone: "error", title: "Restore failed", lines: [messageOf(reason, "Restore failed.")] });
      notify("error", dryRun ? "That backup could not be read" : "Restore failed");
    } finally {
      if (mounted.current) setAction(null);
    }
  }

  function askRestoreFromFile() {
    setConfirming({
      title: "Restore from this file?",
      body: "It replaces all current SnipDock data, and SnipDock restarts to load it.",
      confirmLabel: "Restore and restart",
      run: () => restoreFromFile(false),
    });
  }

  async function refreshList() {
    setAction("refresh");
    await refreshBackups();
    if (mounted.current) setAction(null);
  }

  if (!settings || !persisted) {
    return (
      <SettingSection
        className={className}
        title="Backup and restore"
        titleId="settings-backup-actions"
        tone="var(--type-config)"
      >
        <SettingRow>
          {loadError ? (
            <div className="flex flex-wrap items-center gap-3" role="alert">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button variant="outline" size="sm" type="button" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Spinner /> Loading backup settings…
            </p>
          )}
        </SettingRow>
      </SettingSection>
    );
  }

  const cloudOn = settings.cloud.provider !== "none";
  const missing = missingCloudFields(settings.cloud);
  // What a backup will actually write to: the accepted settings, not the draft.
  const destinations = [persisted.local && "this computer", persisted.cloud.provider !== "none" && "the bucket"].filter(
    Boolean,
  ) as string[];
  const canRun = destinations.length > 0;
  const cloudSaved = persisted.cloud.provider !== "none" && missing.length === 0;
  const savedProvider =
    persisted.cloud.provider === "none" ? null : providers.find(([value]) => value === persisted.cloud.provider)?.[1];
  const state = runState(settings);
  const running = action === "backup";
  const statusTone = running ? toneColor.busy : state === "ok" ? toneColor.success : state === "failed" ? toneColor.error : toneColor.muted;
  const lastAt = settings.last_run_at ?? "";
  const failure = settings.last_result?.replace(/^Failed:\s*/, "") ?? "";

  const pill = running
    ? "Backing up…"
    : state === "ok"
      ? `Backed up ${formatRelativeTime(lastAt, new Date(now)).toLowerCase()}`
      : state === "failed"
        ? "Last backup failed"
        : "Not backed up yet";

  let headline: ReactNode;
  let detail: string;
  if (running) {
    headline = "Backing up…";
    detail = `Writing a copy to ${listPhrase(destinations)}.`;
  } else if (state === "ok") {
    headline = (
      <>
        Last backup <time dateTime={lastAt}>{formatDateTime(lastAt)}</time>
      </>
    );
    detail = settings.last_result ?? "";
  } else if (state === "failed") {
    headline = (
      <>
        Last backup failed · <time dateTime={lastAt}>{formatDateTime(lastAt)}</time>
      </>
    );
    detail = failure;
  } else {
    headline = "No backup yet";
    detail = "Nothing has been backed up from this computer.";
  }

  return (
    <SettingSection
      className={className}
      title="Backup and restore"
      titleId="settings-backup-actions"
      description="SnipDock always backs up before it installs an update or upgrades its database, so nothing is lost to a new version."
      tone="var(--type-config)"
      icon={
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]">
          <ellipse cx="12" cy="6.5" rx="6.5" ry="2.5" />
          <path d="M5.5 6.5v11c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-11" />
          <path d="M5.5 12c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" />
        </svg>
      }
      action={
        <span title={state === "never" ? undefined : formatDateTime(lastAt)}>
          <SettingStatusPill tone={statusTone}>{pill}</SettingStatusPill>
        </span>
      }
    >
      <SettingRow className="grid gap-4">
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-md border p-3.5 transition-colors duration-200"
        style={tinted(statusTone)}
        data-testid="backup-status"
      >
        <span
          className="grid size-8 shrink-0 place-items-center self-start rounded-full"
          style={{ color: statusTone, background: `color-mix(in srgb, ${statusTone} 14%, transparent)` }}
        >
          <StatusGlyph state={running ? "busy" : state} />
        </span>
        <div className="grid min-w-0 flex-1 basis-56 gap-1">
          <p className="m-0 text-sm font-semibold text-foreground">{headline}</p>
          {detail && (
            <p className="m-0 text-xs [overflow-wrap:anywhere] text-muted-foreground">{detail}</p>
          )}
          <p className="m-0 text-xs text-[var(--text-muted)]">
            {canRun ? scheduleLine(settings, now) : "Turn on a destination below to start backing up."}
          </p>
        </div>
        <ActionButton
          type="button"
          running={running}
          runningLabel="Backing up…"
          disabled={busy || !canRun}
          onClick={() => void backUpNow()}
        >
          {state === "failed" ? "Try again" : "Back up now"}
        </ActionButton>
      </div>

      {saveError && (
        <p className="m-0 text-xs text-destructive" role="alert">
          {saveError}
        </p>
      )}

      {outcome && (
        <div
          className="flex items-start gap-3 rounded-md border px-3.5 py-3 text-xs"
          style={tinted(toneColor[outcome.tone])}
          data-testid="backup-outcome"
        >
          <div className="grid min-w-0 flex-1 gap-1">
            <p className="m-0 text-sm font-semibold" style={{ color: toneColor[outcome.tone] }}>
              {outcome.title}
            </p>
            {outcome.lines.map((line, index) => (
              <p key={`${index}-${line}`} className="m-0 [overflow-wrap:anywhere] text-muted-foreground">
                {line}
              </p>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            aria-label="Dismiss"
            className="-m-1 size-7 shrink-0 text-muted-foreground"
            onClick={() => setOutcome(null)}
          >
            <span aria-hidden="true">×</span>
          </Button>
        </div>
      )}

      <fieldset className="mt-1 grid gap-2">
        <legend className="mb-1 text-xs font-semibold text-muted-foreground">Schedule</legend>
        <div className="flex flex-wrap gap-2">
          {schedules.map(([value, label, hint]) => (
            <TogglePill
              key={value}
              pressed={settings.schedule === value}
              title={hint}
              disabled={busy}
              onClick={() =>
                void save(
                  { schedule: value },
                  undefined,
                  value === "manual" ? "Automatic backups off" : `Automatic backups: ${label.toLowerCase()}`,
                )
              }
            >
              {label}
            </TogglePill>
          ))}
        </div>
        <p className={cn("text-xs", hintClass)}>
          {schedules.find(([value]) => value === settings.schedule)?.[2]}
        </p>
      </fieldset>

      <div className="grid gap-3 rounded-md border border-border p-4">
        <label
          className="flex min-h-10 items-center justify-between gap-4 [&>span]:grid [&>span]:gap-1 [&_small]:font-normal [&_small]:text-muted-foreground"
          htmlFor="backup-local"
        >
          <span>
            <strong>Keep a copy on this computer</strong>
            <small>A plain SQLite file any tool can open, kept beside the database by default.</small>
          </span>
          <ToggleSwitch
            id="backup-local"
            aria-label="Keep a copy on this computer"
            checked={settings.local}
            disabled={busy}
            onCheckedChange={(checked) =>
              void save({ local: checked }, undefined, checked ? "Local copies on" : "Local copies off")
            }
          />
        </label>
        {settings.local && (
          <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-3 max-[50rem]:grid-cols-1">
            <label className={labelClass}>
              <span>Folder</span>
              <input
                className={fieldClass}
                value={settings.local_dir}
                disabled={busy}
                placeholder="Leave empty for the default backups folder"
                onChange={(event) => setSettings({ ...settings, local_dir: event.target.value })}
                onBlur={(event) => void save({ local_dir: event.target.value.trim() })}
              />
            </label>
            <label className={labelClass}>
              <span>Copies to keep</span>
              <input
                className={fieldClass}
                type="number"
                min={1}
                max={100}
                value={settings.keep}
                disabled={busy}
                onChange={(event) => setSettings({ ...settings, keep: Number(event.target.value) })}
                onBlur={(event) => {
                  const keep = Number(event.target.value);
                  if (Number.isInteger(keep) && keep >= 1 && keep <= 100) {
                    void save({ keep });
                    return;
                  }
                  setSettings({ ...settings, keep: persisted.keep });
                  notify("error", "Copies to keep must be a whole number from 1 to 100");
                }}
              />
              <span className={hintClass}>1-100</span>
            </label>
          </div>
        )}
      </div>

      <div className="grid gap-3 rounded-md border border-border p-4">
        <div className="grid gap-1">
          <p className="text-sm font-semibold">Upload to object storage</p>
          <p className="text-xs text-muted-foreground">
            S3 and R2 take the same signed request. Uploads are encrypted on this computer before
            they leave it, so the bucket only ever holds ciphertext.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {providers.map(([value, label]) => (
            <TogglePill
              key={value}
              pressed={settings.cloud.provider === value}
              disabled={busy}
              onClick={() =>
                void save({}, {
                  provider: value,
                  // R2 is single-region and rejects any other credential scope;
                  // filling it in is one less thing to get wrong.
                  region: value === "r2" ? "auto" : settings.cloud.region,
                })
              }
            >
              {label}
            </TogglePill>
          ))}
        </div>

        {cloudOn && missing.length > 0 && (
          <p
            className="m-0 rounded-sm border px-3 py-2 text-xs text-foreground"
            style={tinted(toneColor.warning)}
            data-testid="backup-cloud-draft"
          >
            {savedProvider
              ? `These changes are not saved yet. Add ${listPhrase(missing)} to save them; until then, backups keep uploading to ${savedProvider}.`
              : `Uploads are not on yet. Add ${listPhrase(missing)} to turn them on.`}
          </p>
        )}

        {cloudOn && (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3 max-[50rem]:grid-cols-1">
              <label className={labelClass}>
                <span>Bucket</span>
                <input
                  className={fieldClass}
                  value={settings.cloud.bucket}
                  disabled={busy}
                  onChange={(event) =>
                    setSettings({ ...settings, cloud: { ...settings.cloud, bucket: event.target.value } })
                  }
                  onBlur={(event) => void save({}, { bucket: event.target.value.trim() })}
                />
              </label>
              <label className={labelClass}>
                <span>Region</span>
                <input
                  className={fieldClass}
                  value={settings.cloud.region}
                  disabled={busy || settings.cloud.provider === "r2"}
                  placeholder="eu-west-2"
                  onChange={(event) =>
                    setSettings({ ...settings, cloud: { ...settings.cloud, region: event.target.value } })
                  }
                  onBlur={(event) => void save({}, { region: event.target.value.trim() })}
                />
                <span className={hintClass}>
                  {settings.cloud.provider === "r2" ? "R2 always signs as auto." : "AWS region of the bucket."}
                </span>
              </label>
            </div>
            <label className={labelClass}>
              <span>Endpoint</span>
              <input
                className={fieldClass}
                value={settings.cloud.endpoint}
                disabled={busy}
                placeholder={
                  settings.cloud.provider === "r2"
                    ? "https://<account>.r2.cloudflarestorage.com"
                    : "Leave empty for Amazon S3"
                }
                onChange={(event) =>
                  setSettings({ ...settings, cloud: { ...settings.cloud, endpoint: event.target.value } })
                }
                onBlur={(event) => void save({}, { endpoint: event.target.value.trim() })}
              />
              <span className={hintClass}>Must be https. Required for R2.</span>
            </label>
            <div className="grid grid-cols-2 gap-3 max-[50rem]:grid-cols-1">
              <label className={labelClass}>
                <span>Access key ID</span>
                <input
                  className={fieldClass}
                  autoComplete="off"
                  value={settings.cloud.access_key_id}
                  disabled={busy}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      cloud: { ...settings.cloud, access_key_id: event.target.value },
                    })
                  }
                  onBlur={(event) => void save({}, { access_key_id: event.target.value.trim() })}
                />
              </label>
              <label className={labelClass}>
                <span>Secret access key</span>
                <input
                  className={fieldClass}
                  type="password"
                  autoComplete="new-password"
                  value={settings.cloud.secret_access_key}
                  disabled={busy}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      cloud: { ...settings.cloud, secret_access_key: event.target.value },
                    })
                  }
                  onBlur={(event) => void save({}, { secret_access_key: event.target.value })}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3 max-[50rem]:grid-cols-1">
              <label className={labelClass}>
                <span>Key prefix</span>
                <input
                  className={fieldClass}
                  value={settings.cloud.prefix}
                  disabled={busy}
                  placeholder="snipdock/laptop"
                  onChange={(event) =>
                    setSettings({ ...settings, cloud: { ...settings.cloud, prefix: event.target.value } })
                  }
                  onBlur={(event) => void save({}, { prefix: event.target.value.trim() })}
                />
                <span className={hintClass}>Optional, so a bucket can hold more than backups.</span>
              </label>
              <label className={labelClass}>
                <span>Backup password</span>
                <input
                  className={fieldClass}
                  type="password"
                  autoComplete="new-password"
                  value={settings.cloud.passphrase}
                  disabled={busy}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      cloud: { ...settings.cloud, passphrase: event.target.value },
                    })
                  }
                  onBlur={(event) => void save({}, { passphrase: event.target.value })}
                />
                <span className={hintClass}>
                  Needed to restore an upload. SnipDock cannot recover it for you.
                </span>
              </label>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              These credentials are stored in SnipDock's local settings database. Use a key that can
              only write to this bucket, and set a lifecycle rule there if you want old uploads
              removed — SnipDock's "copies to keep" applies to local files only.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                variant="outline"
                size="sm"
                type="button"
                running={action === "test"}
                runningLabel="Testing…"
                disabled={busy || !cloudSaved}
                onClick={() => void testDestination()}
              >
                Test connection
              </ActionButton>
              {!cloudSaved && (
                <span className={cn("text-xs", hintClass)}>Available once the destination is complete.</span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-2 border-t border-border pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="m-0 text-sm font-semibold">
            Backups on this computer
            {backups.length > 0 && (
              <span className="ml-1.5 font-normal tabular-nums text-[var(--text-muted)]">{backups.length}</span>
            )}
          </h4>
          <ActionButton
            variant="ghost"
            size="sm"
            type="button"
            running={action === "refresh"}
            runningLabel="Refreshing…"
            disabled={busy}
            onClick={() => void refreshList()}
          >
            Refresh
          </ActionButton>
        </div>
        {backups.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No local backups yet. One is taken automatically before the next update.
          </p>
        ) : (
          <ul className="grid max-h-64 gap-1 overflow-auto">
            {backups.map((backup) => (
              <li
                key={backup.path}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm border border-border/70 px-3 py-2 transition-colors hover:bg-muted/60"
              >
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate font-mono text-xs" title={backup.path}>
                    {backup.name}
                  </span>
                  {backup.modified_at && (
                    <time
                      dateTime={backup.modified_at}
                      title={formatDateTime(backup.modified_at)}
                      className="text-[0.68rem] text-[var(--text-muted)]"
                    >
                      {formatRelativeTime(backup.modified_at, new Date(now))}
                    </time>
                  )}
                </span>
                {backup.pre_upgrade && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                    Before update
                  </span>
                )}
                <span className="font-mono text-[0.68rem] tabular-nums text-[var(--text-muted)]">
                  {formatBytes(backup.bytes)}
                </span>
                <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => restoreLocal(backup)}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="border-t border-border pt-4">
        <summary className="cursor-pointer text-sm font-semibold">Export an encrypted backup file</summary>
        <div className="mt-3 grid gap-3">
          <p className="text-xs text-muted-foreground">
            One sealed file you can keep anywhere. The password is the only way back into it.
          </p>
          <label className={labelClass}>
            <span>Save to</span>
            <input
              className={fieldClass}
              value={exportPath}
              disabled={busy}
              placeholder="D:/snipdock.backup"
              onChange={(event) => setExportPath(event.target.value)}
            />
          </label>
          <label className={labelClass}>
            <span>Password for this file</span>
            <input
              className={fieldClass}
              type="password"
              autoComplete="new-password"
              value={exportPassword}
              disabled={busy}
              onChange={(event) => setExportPassword(event.target.value)}
            />
          </label>
          <div>
            <ActionButton
              type="button"
              variant="outline"
              running={action === "export"}
              runningLabel="Creating…"
              disabled={busy || !exportPath || !exportPassword}
              onClick={() => void exportEncrypted()}
            >
              Create backup
            </ActionButton>
          </div>
        </div>
      </details>

      <details className="border-t border-border pt-4">
        <summary className="cursor-pointer text-sm font-semibold">Restore from a backup file</summary>
        <div className="mt-3 grid gap-3">
          <p className="text-xs text-muted-foreground">
            For an encrypted backup — one downloaded from your bucket, or made with an older
            version of SnipDock.
          </p>
          <label className={labelClass}>
            <span>Backup file path</span>
            <input
              className={fieldClass}
              value={restorePath}
              disabled={busy}
              onChange={(event) => setRestorePath(event.target.value)}
            />
          </label>
          <label className={labelClass}>
            <span>Backup password</span>
            <input
              className={fieldClass}
              type="password"
              autoComplete="current-password"
              value={restorePassword}
              disabled={busy}
              onChange={(event) => setRestorePassword(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              variant="outline"
              type="button"
              running={action === "preview"}
              runningLabel="Checking…"
              disabled={busy || !restorePath || !restorePassword}
              onClick={() => void restoreFromFile(true)}
            >
              Preview
            </ActionButton>
            <ActionButton
              variant="outline"
              type="button"
              running={action === "restore"}
              runningLabel="Restoring…"
              disabled={busy || !restorePath || !restorePassword}
              onClick={askRestoreFromFile}
            >
              Restore and restart
            </ActionButton>
          </div>
        </div>
      </details>
      </SettingRow>

      <Dialog open={confirming !== null} onOpenChange={(open) => { if (!open) setConfirming(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirming?.title}</DialogTitle>
            <DialogDescription className="[overflow-wrap:anywhere]">{confirming?.body}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button variant="destructive" type="button" onClick={() => void confirmAndRun()}>
              {confirming?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {notice && <Toast tone={notice.tone}>{notice.text}</Toast>}
    </SettingSection>
  );
}

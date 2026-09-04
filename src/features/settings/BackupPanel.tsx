import { useCallback, useEffect, useState } from "react";
import { commands } from "../../api/commands";
import type {
  BackupSchedule,
  JsonValue,
  BackupSettings,
  CloudBackupSettings,
  CloudProvider,
  LocalBackup,
} from "../../api/types";
import { formatBytes } from "../../lib/formatBytes";
import { Button } from "@/components/ui/button";
import { PanelHeader, PanelStat } from "@/components/ui/panel-header";
import { formatDateTime } from "../../lib/relativeTime";
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

/**
 * Backup destinations, schedule, and the list of what can be restored.
 *
 * Two destinations, on purpose. A local copy is a plain SQLite file that any
 * tool can open if SnipDock itself will not start. An upload is sealed on this
 * machine first, so the bucket only ever holds ciphertext — which is why a
 * password is required before a provider can be turned on.
 */
export default function BackupPanel({ className }: { className?: string }) {
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [backups, setBackups] = useState<LocalBackup[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [restorePath, setRestorePath] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [exportPath, setExportPath] = useState("");
  const [exportPassword, setExportPassword] = useState("");

  const refreshBackups = useCallback(async () => {
    try {
      setBackups(await commands.listLocalBackups());
    } catch {
      // The list is a convenience; failing to read a folder must not take the
      // destination controls down with it.
    }
  }, []);

  useEffect(() => {
    let active = true;
    void commands.getSettings().then(
      (loaded) => { if (active) setSettings(loaded.backup); },
      () => { if (active) setError("Could not load backup settings."); },
    );
    void refreshBackups();
    return () => { active = false; };
  }, [refreshBackups]);

  /**
   * Writes the whole `backup` object every time. The settings patch replaces a
   * key rather than merging into it, so sending a partial object here would
   * silently blank every field it left out.
   */
  async function save(changes: Partial<BackupSettings>, cloud?: Partial<CloudBackupSettings>) {
    if (!settings) return;
    const next: BackupSettings = {
      ...settings,
      ...changes,
      cloud: { ...settings.cloud, ...cloud },
    };
    setSettings(next);
    setError("");
    try {
      // `SettingsPatch` values are `JsonValue`, which a named interface does
      // not structurally satisfy without an index signature.
      const saved = await commands.saveSettings({
        values: { backup: next as unknown as JsonValue },
      });
      setSettings(saved.backup);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save backup settings.");
    }
  }

  async function backUpNow() {
    setBusy(true);
    setError("");
    setResult("");
    try {
      const report = await commands.runBackupNow();
      const written = [
        report.local_path && `saved to ${report.local_path}`,
        report.cloud_url && `uploaded to ${report.cloud_url}`,
      ].filter(Boolean);
      setResult(`Backed up ${formatBytes(report.bytes)} — ${written.join(" and ")}. ${report.warnings.join(" ")}`);
      const reloaded = await commands.getSettings();
      setSettings(reloaded.backup);
      await refreshBackups();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Backup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function testDestination() {
    setBusy(true);
    setError("");
    setResult("");
    try {
      setResult(await commands.testBackupDestination());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not reach the bucket.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreLocal(backup: LocalBackup) {
    if (
      !window.confirm(
        `Restore ${backup.name}? This replaces all current SnipDock data and restarts the app.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const report = await commands.restoreLocalBackup(backup.path, false);
      setResult(`Staged ${backup.name} with ${report.item_count} items. Restarting…`);
      if (report.restart_required) await commands.restartApp();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Restore failed.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * A one-off encrypted file, for taking a backup somewhere SnipDock does not
   * manage -- a USB stick, another machine. Same envelope as an upload, so it
   * restores through the same path.
   */
  async function exportEncrypted() {
    setBusy(true);
    setError("");
    setResult("");
    try {
      const receipt = await commands.createBackup({ path: exportPath, passphrase: exportPassword });
      setResult(`Backup created: ${receipt.path}. Checksum ${receipt.checksum}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Backup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreFromFile(dryRun: boolean) {
    if (!dryRun && !window.confirm("Restore replaces all current SnipDock data and restarts the app. Continue?")) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const report = await commands.restoreBackup({
        path: restorePath,
        passphrase: restorePassword,
        dry_run: dryRun,
      });
      setResult(
        `${dryRun ? "Preview" : "Restore"}: ${report.item_count} items, schema ${report.schema_version}. ${report.warnings.join(" ")}`,
      );
      if (!dryRun && report.restart_required) await commands.restartApp();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Restore failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return (
      <section className={className} aria-labelledby="settings-backup-actions">
        <h3 id="settings-backup-actions" className="text-xl font-semibold tracking-tight">
          Backup and restore
        </h3>
        <p className="text-sm text-muted-foreground">{error || "Loading backup settings…"}</p>
      </section>
    );
  }

  const cloudOn = settings.cloud.provider !== "none";

  return (
    <section className={className} aria-labelledby="settings-backup-actions">
      <PanelHeader
        eyebrow="Backup"
        title="Backup and restore"
        titleId="settings-backup-actions"
        description="SnipDock always backs up before it installs an update or upgrades its database, so nothing is lost to a new version."
        action={<PanelStat label="Last backup">{formatDateTime(settings.last_run_at, "Never")}</PanelStat>}
      />

      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      {result && (
        <p className="rounded-md border border-border bg-muted p-3 text-xs [overflow-wrap:anywhere] text-muted-foreground" role="status">
          {result}
        </p>
      )}
      {settings.last_result && !result && (
        <p className="text-xs [overflow-wrap:anywhere] text-[var(--text-muted)]">
          {settings.last_result}
        </p>
      )}

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-xs font-semibold text-muted-foreground">Schedule</legend>
        <div className="flex flex-wrap gap-2">
          {schedules.map(([value, label, hint]) => (
            <TogglePill
              key={value}
              pressed={settings.schedule === value}
              title={hint}
              onClick={() => void save({ schedule: value })}
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
            onCheckedChange={(checked) => void save({ local: checked })}
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
                  if (Number.isInteger(keep) && keep >= 1 && keep <= 100) void save({ keep });
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
                <span>{settings.cloud.provider === "r2" ? "Region" : "Region"}</span>
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
            <div>
              <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => void testDestination()}>
                Test connection
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={busy || (!settings.local && !cloudOn)} onClick={() => void backUpNow()}>
          {busy ? "Working…" : "Back up now"}
        </Button>
        {!settings.local && !cloudOn && (
          <span className="text-xs text-destructive">Turn on at least one destination first.</span>
        )}
      </div>

      <div className="grid gap-2 border-t border-border pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="m-0 text-sm font-semibold">Backups on this computer</h4>
          <Button variant="ghost" size="sm" type="button" disabled={busy} onClick={() => void refreshBackups()}>
            Refresh
          </Button>
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
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm border border-border/70 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={backup.path}>
                  {backup.name}
                </span>
                {backup.pre_upgrade && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                    Before update
                  </span>
                )}
                <span className="font-mono text-[0.68rem] tabular-nums text-[var(--text-muted)]">
                  {formatBytes(backup.bytes)}
                </span>
                <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => void restoreLocal(backup)}>
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
            <Button
              type="button"
              variant="outline"
              disabled={busy || !exportPath || !exportPassword}
              onClick={() => void exportEncrypted()}
            >
              Create backup
            </Button>
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
            <Button
              variant="outline"
              type="button"
              disabled={busy || !restorePath || !restorePassword}
              onClick={() => void restoreFromFile(true)}
            >
              Preview
            </Button>
            <Button
              variant="outline"
              type="button"
              disabled={busy || !restorePath || !restorePassword}
              onClick={() => void restoreFromFile(false)}
            >
              Restore and restart
            </Button>
          </div>
        </div>
      </details>
    </section>
  );
}

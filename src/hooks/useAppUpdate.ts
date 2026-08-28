import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { commands } from "../api/commands";
import { listenEvent, ShortcutEvents } from "../api/events";
import type { UpdateInfo, UpdateSettings } from "../api/types";

const APP_SHOWN_EVENT = "app://shown";

/**
 * Applied when settings are missing the `updates` block -- a store written by a
 * build that predates it, or a test double. Notifications default on: silence
 * has to be something the user chose.
 */
export const DEFAULT_UPDATE_SETTINGS: UpdateSettings = {
  notify: true,
  frequency: "on_launch",
  skipped_version: null,
  last_checked_at: null,
};

const INTERVAL_MS: Record<UpdateSettings["frequency"], number> = {
  on_launch: 0,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Whether enough time has passed to ask GitHub again. An unreadable or missing
 * timestamp counts as "never checked", so a corrupt value costs one extra
 * request rather than silencing updates indefinitely.
 */
export function updateCheckIsDue(settings: UpdateSettings, now: number): boolean {
  const interval = INTERVAL_MS[settings.frequency] ?? 0;
  if (interval === 0) return true;
  if (!settings.last_checked_at) return true;
  const last = Date.parse(settings.last_checked_at);
  return Number.isNaN(last) || now - last >= interval;
}

/**
 * Whether an available update should raise the prompt. Skipping is per version,
 * so a newer release still comes through after one has been skipped.
 */
export function updateShouldPrompt(
  settings: UpdateSettings,
  update: UpdateInfo | null,
  dismissed: string | null,
): boolean {
  if (!settings.notify || !update) return false;
  return update.version !== settings.skipped_version && update.version !== dismissed;
}

/**
 * Owns the whole update conversation: what version is running, whether a newer
 * one exists, and whether to prompt about it.
 *
 * Preferences live in the settings database rather than `localStorage` -- the
 * webview's storage is cleared by a reinstall, which used to reset "notify me"
 * and re-offer skipped versions on a fresh install.
 */
export function useAppUpdate() {
  const [currentVersion, setCurrentVersion] = useState("");
  const [settings, setSettings] = useState<UpdateSettings | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");
  // Dismissing with "Later" is deliberately not persisted: the user asked to be
  // reminded, and the next launch is the reminder.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const settingsRef = useRef<UpdateSettings | null>(null);
  settingsRef.current = settings;

  const persist = useCallback(async (changes: Partial<UpdateSettings>) => {
    const current = settingsRef.current;
    if (!current) return;
    const next = { ...current, ...changes };
    setSettings(next);
    try {
      await commands.saveSettings({ values: { updates: next } });
    } catch {
      // A preference that could not be written is not worth interrupting the
      // user over; the in-memory value still applies for this session.
    }
  }, []);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void)[] = [];
    let checked = false;

    async function check() {
      if (!active || checked) return;
      const current = settingsRef.current;
      if (!current || !current.notify) return;
      if (!updateCheckIsDue(current, Date.now())) return;
      checked = true;
      void persist({ last_checked_at: new Date().toISOString() });
      try {
        const found = await commands.checkForUpdate();
        if (active && found && typeof found.version === "string") setUpdate(found);
      } catch {
        // Offline, or GitHub is unreachable. Silent by design: an update check
        // the user did not ask for should not raise an error at them.
      }
    }

    void getVersion().then(
      (version) => { if (active && typeof version === "string") setCurrentVersion(version); },
      () => {},
    );

    void commands.getSettings().then(
      async (loaded) => {
        if (!active) return;
        const loadedUpdates = loaded?.updates ?? DEFAULT_UPDATE_SETTINGS;
        setSettings(loadedUpdates);
        settingsRef.current = loadedUpdates;
        // The window starts hidden and is shown from the tray, so a check is
        // driven by the window actually appearing rather than by mount.
        const stops = await Promise.all([
          listenEvent<void>(APP_SHOWN_EVENT, () => void check()),
          listenEvent<void>(ShortcutEvents.search, () => void check()),
        ]).catch(() => [] as (() => void)[]);
        if (!active) {
          stops.forEach((stop) => stop());
          return;
        }
        unlisten = stops;
        const visible = await getCurrentWindow().isVisible().catch(() => false);
        if (visible) void check();
      },
      () => {},
    );

    return () => {
      active = false;
      unlisten.forEach((stop) => stop());
    };
  }, [persist]);

  const install = useCallback(async () => {
    setInstalling(true);
    setError("");
    try {
      const installed = await commands.installUpdate();
      // `false` means the update vanished between the prompt and the install --
      // usually a release that was pulled. Clearing it is honest; an error is not.
      if (!installed) setUpdate(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Update could not be installed.");
    } finally {
      setInstalling(false);
    }
  }, []);

  const skip = useCallback(() => {
    if (!update) return;
    void persist({ skipped_version: update.version });
    setDismissed(update.version);
  }, [persist, update]);

  const later = useCallback(() => {
    if (update) setDismissed(update.version);
  }, [update]);

  const setNotify = useCallback(
    (notify: boolean) => {
      // Turning notifications back on clears the skip: the user is asking to
      // hear about updates again, and a stale skip would keep this one quiet.
      void persist(notify ? { notify, skipped_version: null } : { notify });
    },
    [persist],
  );

  return {
    currentVersion,
    settings,
    update,
    installing,
    error,
    showPrompt: settings ? updateShouldPrompt(settings, update, dismissed) : false,
    install,
    skip,
    later,
    setNotify,
    setFrequency: (frequency: UpdateSettings["frequency"]) => void persist({ frequency }),
  };
}

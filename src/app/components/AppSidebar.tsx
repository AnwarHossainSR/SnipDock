import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { commands } from "../../api/commands";
import { listenEvent, ShortcutEvents } from "../../api/events";
import type { UpdateInfo } from "../../api/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import UpdateAvailableModal from "./UpdateAvailableModal";

const SKIPPED_UPDATE_KEY = "snipdock.skippedUpdateVersion";
const APP_SHOWN_EVENT = "app://shown";

const navigation = [
  { label: "Clipboard", href: "#clipboard", icon: "clipboard" },
  { label: "Settings", href: "#settings", icon: "settings" },
] as const;

type IconName = (typeof navigation)[number]["icon"];

const strokeIcon =
  "fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]";
const positiveDot =
  "size-[0.45rem] rounded-full bg-[var(--color-positive)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-positive)_14%,transparent)]";

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    clipboard: (
      <>
        <path d="M9.25 3.5h5.5v2.75h-5.5z" />
        <path d="M9.25 4.9H7.5v14.6h9V4.9h-1.75" />
        <path d="M10 9h4.25M10 12h4.25" />
      </>
    ),
    settings: <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-5v2m0 13v2m8.5-8.5h-2m-13 0h-2m14-6-1.5 1.5m-8.5 8.5L6 17.5m12 0L16.5 16M7.5 7.5 6 6" />,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn("size-5 shrink-0", strokeIcon)}>
      {paths[name]}
    </svg>
  );
}

export default function AppSidebar({ suppressUpdatePrompt = false }: { suppressUpdatePrompt?: boolean }) {
  const [currentVersion, setCurrentVersion] = useState("");
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(null);
  const currentHref = navigation.some((item) => item.href === window.location.hash)
    ? window.location.hash
    : "#clipboard";
  const showUpdateModal = !suppressUpdatePrompt
    && availableUpdate !== null
    && availableUpdate.version !== dismissedUpdate
    && availableUpdate.version !== localStorage.getItem(SKIPPED_UPDATE_KEY);

  useEffect(() => {
    let active = true;
    let checked = false;
    let unlisten: (() => void)[] = [];

    function checkForUpdate() {
      if (!active || checked) return;
      checked = true;
      void commands.checkForUpdate().then(
        (update) => { if (active && update && typeof update.version === "string") setAvailableUpdate(update); },
        () => {},
      );
    }

    getVersion().then(
      (version) => { if (active && typeof version === "string") setCurrentVersion(version); },
      () => {},
    );
    void Promise.all([
      listenEvent<void>(APP_SHOWN_EVENT, checkForUpdate),
      listenEvent<void>(ShortcutEvents.search, checkForUpdate),
    ]).then(
      (stops) => {
        if (!active) {
          stops.forEach((stop) => stop());
          return;
        }
        unlisten = stops;
        void getCurrentWindow().isVisible().then(
          (visible) => { if (visible) checkForUpdate(); },
          () => {},
        );
      },
      () => {},
    );
    return () => {
      active = false;
      unlisten.forEach((stop) => stop());
    };
  }, []);

  async function installUpdate() {
    setInstalling(true);
    setUpdateError(false);
    try {
      const installed = await commands.installUpdate();
      if (!installed) {
        setAvailableUpdate(null);
        setInstalling(false);
      }
    } catch {
      setUpdateError(true);
      setInstalling(false);
    }
  }

  function skipUpdate() {
    if (!availableUpdate) return;
    localStorage.setItem(SKIPPED_UPDATE_KEY, availableUpdate.version);
    setDismissedUpdate(availableUpdate.version);
  }

  return (
    <>
      <aside className="sticky top-0 flex h-screen flex-col border-r border-border bg-sidebar px-3 py-5 max-[47rem]:px-2">
      <a
        className="flex min-h-10 items-center gap-3 px-2 no-underline max-[47rem]:justify-center max-[47rem]:px-0"
        href="#clipboard"
        aria-label="SnipDock home"
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-sm bg-primary font-bold text-white shadow-[0_7px_18px_color-mix(in_srgb,var(--color-accent)_28%,transparent)]"
        >
          <svg viewBox="0 0 24 24" className={cn("size-6", strokeIcon)}>
            <path d="M9.25 3.5h5.5v2.75h-5.5z" />
            <path d="M9.25 4.9H7.5v9.85h9V4.9h-1.75" />
            <path d="M10 8.75h4.25M10 11.5h4.25" />
            <path d="M4.5 14.25h4l1.25 1.75h4.5l1.25-1.75h4v5.5a.75.75 0 0 1-.75.75H5.25a.75.75 0 0 1-.75-.75z" />
          </svg>
        </span>
        <h1 className="font-display text-base font-bold tracking-[-0.02em] max-[47rem]:sr-only">SnipDock</h1>
      </a>

      <nav
        aria-label="Primary"
        className="relative mt-9 grid gap-1 before:absolute before:inset-y-[1.35rem] before:left-[1.48rem] before:z-0 before:w-px before:bg-border before:content-[''] max-[47rem]:before:left-1/2"
      >
        {navigation.map((item) => {
          const active = item.href === currentHref;
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative z-[1] flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold no-underline max-[47rem]:justify-center max-[47rem]:px-0",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <NavIcon name={item.icon} />
              <span className="max-[47rem]:sr-only">{item.label}</span>
            </a>
          );
        })}
      </nav>

      <div className="mt-auto grid gap-2 p-3 max-[47rem]:justify-items-center max-[47rem]:px-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground max-[47rem]:justify-center">
          <span aria-hidden="true" className={positiveDot} />
          <span className="max-[47rem]:sr-only">Stored locally</span>
        </div>
        {currentVersion && (
          <span className="font-mono text-[0.68rem] text-muted-foreground max-[47rem]:sr-only">
            v{currentVersion}
          </span>
        )}
        <span className="text-[0.68rem] text-[var(--color-text-subtle)]">
          Built by{" "}
          <a
            className="text-muted-foreground hover:text-primary"
            href="https://github.com/AnwarHossainSR"
            target="_blank"
            rel="noreferrer"
          >
            Anwar Hossain
          </a>
        </span>
        {availableUpdate && (
          <Button
            type="button"
            size="sm"
            disabled={installing}
            onClick={() => void installUpdate()}
            className="max-[47rem]:w-9 max-[47rem]:px-0"
          >
            <span className="max-[47rem]:sr-only">
              {installing ? "Installing update…" : `Update to v${availableUpdate.version}`}
            </span>
            <span aria-hidden="true" className="hidden max-[47rem]:inline">
              ↑
            </span>
          </Button>
        )}
        {updateError && !showUpdateModal && (
          <span role="alert" className="text-[0.68rem] text-destructive max-[47rem]:sr-only">
            Update failed
          </span>
        )}
      </div>
      </aside>
      {showUpdateModal && currentVersion && (
        <UpdateAvailableModal
          currentVersion={currentVersion}
          update={availableUpdate}
          installing={installing}
          error={updateError}
          onInstall={() => void installUpdate()}
          onLater={() => setDismissedUpdate(availableUpdate.version)}
          onSkip={skipUpdate}
        />
      )}
    </>
  );
}

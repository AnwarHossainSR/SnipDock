const navigation = [
  { label: "Clipboard", href: "#clipboard", icon: "clipboard" },
  { label: "Tools", href: "#tools", icon: "tools" },
  { label: "Settings", href: "#settings", icon: "settings" },
] as const;

type IconName = (typeof navigation)[number]["icon"];

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    clipboard: <path d="M8 5.5h8M9 3h6v5H9zM6 5.5h1.5M16.5 5.5H18v15H6v-15" />,
    tools: <path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 4l-4 16" />,
    settings: <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-5v2m0 13v2m8.5-8.5h-2m-13 0h-2m14-6-1.5 1.5m-8.5 8.5L6 17.5m12 0L16.5 16M7.5 7.5 6 6" />,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

export default function AppSidebar() {
  const [currentVersion, setCurrentVersion] = useState("");
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const currentHref = navigation.some((item) => item.href === window.location.hash)
    ? window.location.hash
    : "#clipboard";

  useEffect(() => {
    let active = true;
    getVersion().then(
      (version) => { if (active && typeof version === "string") setCurrentVersion(version); },
      () => {},
    );
    commands.checkForUpdate().then(
      (version) => { if (active && (version === null || typeof version === "string")) setAvailableVersion(version); },
      () => {},
    );
    return () => { active = false; };
  }, []);

  async function installUpdate() {
    setInstalling(true);
    setUpdateError(false);
    try {
      const installed = await commands.installUpdate();
      if (!installed) {
        setAvailableVersion(null);
        setInstalling(false);
      }
    } catch {
      setUpdateError(true);
      setInstalling(false);
    }
  }

  return (
    <aside className="app-sidebar">
      <a className="brand" href="#clipboard" aria-label="SnipDock home">
        <span className="brand-mark" aria-hidden="true">
          S
        </span>
        <h1>SnipDock</h1>
      </a>

      <nav className="sidebar-nav" aria-label="Primary">
        {navigation.map((item) => (
          <a
            className="nav-item"
            href={item.href}
            aria-current={item.href === currentHref ? "page" : undefined}
            key={item.href}
          >
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="local-note">
          <span className="local-note-dot" aria-hidden="true" />
          <span>Stored locally</span>
        </div>
        {currentVersion && <span className="sidebar-version">v{currentVersion}</span>}
        <span className="sidebar-credit">
          Built by <a href="https://github.com/AnwarHossainSR" target="_blank" rel="noreferrer">Anwar Hossain</a>
        </span>
        {availableVersion && (
          <button className="sidebar-update" type="button" disabled={installing} onClick={() => void installUpdate()}>
            {installing ? "Installing update…" : `Update to v${availableVersion}`}
          </button>
        )}
        {updateError && <span className="sidebar-update-error" role="alert">Update failed</span>}
      </div>
    </aside>
  );
}
import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { commands } from "../../api/commands";

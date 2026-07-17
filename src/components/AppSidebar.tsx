const navigation = [
  { label: "Clipboard", href: "#clipboard", icon: "clipboard" },
  { label: "Snippets", href: "#snippets", icon: "snippet" },
  { label: "Projects", href: "#projects", icon: "project" },
  { label: "Tools", href: "#tools", icon: "tools" },
  { label: "Settings", href: "#settings", icon: "settings" },
] as const;

type IconName = (typeof navigation)[number]["icon"];

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    clipboard: <path d="M8 5.5h8M9 3h6v5H9zM6 5.5h1.5M16.5 5.5H18v15H6v-15" />,
    snippet: <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />,
    project: <path d="M3.5 7.5h7l2-2h8v13h-17zM3.5 9.5h17" />,
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
  return (
    <aside className="app-sidebar">
      <a className="brand" href="#clipboard" aria-label="SnipDock home">
        <span className="brand-mark" aria-hidden="true">
          S
        </span>
        <h1>SnipDock</h1>
      </a>

      <nav className="sidebar-nav" aria-label="Primary">
        {navigation.map((item, index) => (
          <a
            className="nav-item"
            href={item.href}
            aria-current={index === 0 ? "page" : undefined}
            key={item.href}
          >
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      <div className="local-note">
        <span className="local-note-dot" aria-hidden="true" />
        <span>Stored locally</span>
      </div>
    </aside>
  );
}

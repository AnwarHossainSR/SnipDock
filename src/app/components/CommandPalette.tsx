import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { commands } from "../../api/commands";
import type { LibraryItem } from "../../api/types";
import Highlight from "../../components/Highlight";
import TypeTile from "../../components/TypeTile";
import { KeyCap } from "../../components/ui/key-cap";
import { Toast } from "../../components/ui/toast";
import { displayTypeLabel } from "../../lib/contentTypeColors";
import { formatRelativeTime } from "../../lib/relativeTime";
import { clipboardQuery } from "../../lib/searchQuery";
import { showSettingsSection } from "../../lib/settingsSection";
import { isMac } from "../../lib/shortcuts";
import { resolveMode } from "../../lib/theme";
import { cn } from "@/lib/utils";
import { useClipboardStore } from "../../stores/clipboardStore";
import { useCapability } from "../../stores/platformStore";
import { useThemeStore } from "../../stores/themeStore";

type Section = "Actions" | "Recent captures" | "Go to";

interface PaletteCommand {
  id: string;
  section: Section;
  title: string;
  sub: string;
  /** Matched along with the title and the line under it, never shown. */
  keywords?: string;
  tile: ReactNode;
  mono?: boolean;
  danger?: boolean;
  /** Hand focus back to where it was when the palette opened. Off for a
   *  command that opens a dialog or leaves the page, which place focus
   *  themselves - restoring it afterwards would pull it back out. */
  restoreFocus?: boolean;
  run: () => void | Promise<void>;
}

const icons = {
  pause: <path d="M9 5v14M15 5v14" />,
  play: <path d="M7 5v14l11-7Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />,
  pin: (
    <>
      <path d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5Z" />
      <path d="M12 14v6" />
    </>
  ),
  app: (
    <>
      <rect x="3.5" y="4.5" width="17" height="13" rx="2" />
      <path d="M8 21h8M12 17.5V21" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
};

function IconTile({ icon, danger = false }: { icon: keyof typeof icons; danger?: boolean }) {
  const tint = danger ? "var(--danger)" : "var(--accent)";
  return (
    <span
      aria-hidden="true"
      className="grid size-[30px] shrink-0 place-items-center rounded-lg"
      style={{ background: `color-mix(in srgb, ${tint} 13%, transparent)`, color: tint }}
    >
      <svg viewBox="0 0 24 24" className="size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]">
        {icons[icon]}
      </svg>
    </span>
  );
}

/** A capture's one-line name. A private capture is named, never quoted: the
 *  palette is one more place its text could be read over a shoulder. */
function captureTitle(item: LibraryItem): string {
  if (item.private) return "Private capture";
  if (item.title?.trim()) return item.title.trim();
  if (item.content_type === "image") return "Image";
  return item.content.replace(/\s+/g, " ").trim().slice(0, 160) || "Empty item";
}

function words(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** The commands every typed word appears in - title, the line under it, or
 *  the hidden keywords. */
function matching(commands: PaletteCommand[], terms: string[]): PaletteCommand[] {
  if (!terms.length) return commands;
  return commands.filter((command) => {
    const haystack = `${command.title} ${command.sub} ${command.keywords ?? ""}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/** Where the selection lands for a query: the first command whose own name
 *  carries every word. "cl" should land on Clear history, not on Pause
 *  capture, which only matched on a keyword the user cannot see. */
function bestMatch(commands: PaletteCommand[], terms: string[]): number {
  const index = commands.findIndex((command) => terms.every((term) => command.title.toLowerCase().includes(term)));
  return Math.max(0, index);
}

/**
 * Everything SnipDock can do from one field, opened with Ctrl/Cmd+K.
 *
 * Each command runs the same code as the control it stands for - the capture
 * pill, the theme toggle, the Save item and Clear history dialogs, the Pinned
 * pill, a sidebar source - so the palette is a faster way to those, never a
 * second implementation of them. Text that matches no command becomes a
 * history search.
 *
 * Focus stays in the field throughout: the rows are a listbox the field
 * points into with `aria-activedescendant`, which is how the arrow keys move
 * the selection without taking the caret out of what is being typed.
 */
export default function CommandPalette({
  open,
  onClose,
  trackingPaused,
  onTrackingChanged,
  onShowClipboard,
  onSearch,
}: {
  open: boolean;
  onClose: () => void;
  trackingPaused: boolean;
  onTrackingChanged: (paused: boolean) => void;
  /** Bring the Clipboard page on screen, leaving any search. */
  onShowClipboard: () => void;
  /** Search the history for text that matched no command. */
  onSearch: (text: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<LibraryItem[]>([]);
  const [topSource, setTopSource] = useState<{ app: string; count: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const sourceDetection = useCapability("source_app_detection");
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;
  const modifier = isMac() ? "⌘" : "Ctrl";

  // Fresh on every open: the palette is opened for what is true now.
  useEffect(() => {
    if (!open) return;
    // Read before the field takes focus, which is why it is not autoFocus:
    // that would already have moved it by the time this runs.
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    input.current?.focus();
    setQuery("");
    setActive(0);
    let live = true;
    // Both are extras: a palette whose recent captures or top source could
    // not be read still has every action, so a failure only leaves them out.
    void (async () => {
      try {
        const result = await commands.searchItems(clipboardQuery({ limit: 3 }));
        if (live) setRecent(Array.isArray(result?.items) ? result.items : []);
      } catch {
        if (live) setRecent([]);
      }
    })();
    void (async () => {
      let top: { app: string; count: number } | null = null;
      try {
        const counts = sourceDetection ? await commands.getSourceAppCounts() : [];
        for (const entry of Array.isArray(counts) ? counts : []) {
          if (entry.source_app && (!top || entry.count > top.count)) top = { app: entry.source_app, count: entry.count };
        }
      } catch {
        // No source command, then.
      }
      if (live) setTopSource(top);
    })();
    return () => { live = false; };
  }, [open, sourceDetection]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  const dark = resolveMode(mode) === "dark";

  const all = useMemo<PaletteCommand[]>(() => {
    const list: PaletteCommand[] = [
      {
        id: "tracking",
        section: "Actions",
        title: trackingPaused ? "Resume capture" : "Pause capture",
        sub: trackingPaused ? "Start recording the clipboard again" : "Stop recording until you resume",
        keywords: "tracking stop start record clipboard",
        tile: <IconTile icon={trackingPaused ? "play" : "pause"} />,
        restoreFocus: true,
        run: async () => {
          try {
            const enabled = await commands.setClipboardTracking(trackingPaused);
            onTrackingChanged(!enabled);
            setToast({ text: enabled ? "Capturing again" : "Capture paused", tone: "success" });
          } catch {
            setToast({ text: "Could not change capture", tone: "error" });
          }
        },
      },
      {
        id: "save",
        section: "Actions",
        title: "Save an item",
        sub: "Paste or type anything to keep in your history",
        keywords: "new add snippet create",
        tile: <IconTile icon="plus" />,
        run: () => {
          useClipboardStore.getState().requestPageAction("save");
          onShowClipboard();
        },
      },
      {
        id: "theme",
        section: "Actions",
        title: dark ? "Switch to light theme" : "Switch to dark theme",
        sub: "Settings › Appearance can follow the system again",
        keywords: "appearance mode colour color",
        tile: <IconTile icon={dark ? "sun" : "moon"} />,
        restoreFocus: true,
        run: () => setMode(dark ? "light" : "dark"),
      },
      {
        id: "settings",
        section: "Actions",
        title: "Open Settings",
        sub: "Capture, appearance, shortcuts, privacy, backups",
        keywords: "preferences options",
        tile: <IconTile icon="gear" />,
        run: () => { window.location.hash = "#settings"; },
      },
      {
        id: "clear",
        section: "Actions",
        title: "Clear history…",
        sub: "Asks first; pinned and favorite captures are kept",
        keywords: "delete remove wipe",
        tile: <IconTile icon="trash" danger />,
        danger: true,
        run: () => {
          useClipboardStore.getState().requestPageAction("clear");
          onShowClipboard();
        },
      },
      ...recent.map<PaletteCommand>((item) => {
        const type = item.private ? "Private" : displayTypeLabel(item);
        return {
          id: `recent-${item.id}`,
          section: "Recent captures",
          title: captureTitle(item),
          sub: [type, item.source_app, formatRelativeTime(item.created_at)].filter(Boolean).join(" · "),
          keywords: "copy recent",
          tile: <TypeTile item={item} size="md" />,
          mono: !item.private && item.content_type !== "image" && item.content_type !== "plain_text",
          restoreFocus: true,
          run: async () => {
            try {
              await commands.copyItem(item.id, "raw");
              setToast({ text: "Copied to clipboard", tone: "success" });
            } catch {
              setToast({ text: "Could not copy that capture", tone: "error" });
            }
          },
        };
      }),
      {
        id: "pinned",
        section: "Go to",
        title: "Pinned captures",
        sub: "Show only what you pinned",
        keywords: "filter pin",
        tile: <IconTile icon="pin" />,
        restoreFocus: true,
        run: () => {
          useClipboardStore.getState().setFilter("pinned");
          onShowClipboard();
        },
      },
    ];
    if (topSource) {
      list.push({
        id: "source",
        section: "Go to",
        title: `Source · ${topSource.app}`,
        sub: `${topSource.count.toLocaleString()} ${topSource.count === 1 ? "capture" : "captures"} from this app`,
        keywords: "filter application app",
        tile: <IconTile icon="app" />,
        restoreFocus: true,
        run: () => {
          useClipboardStore.getState().setSourceApps([topSource.app]);
          onShowClipboard();
        },
      });
    }
    list.push({
      id: "privacy",
      section: "Go to",
      title: "Settings › Privacy",
      sub: "Ignored apps, patterns, and the secret sweep",
      keywords: "ignore secrets sensitive",
      tile: <IconTile icon="shield" />,
      run: () => showSettingsSection("settings-privacy"),
    });
    return list;
  }, [trackingPaused, dark, recent, topSource, onTrackingChanged, onShowClipboard, setMode]);

  const terms = words(query);
  const shown = matching(all, terms);
  const selected = Math.min(active, Math.max(0, shown.length - 1));

  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(selected))?.scrollIntoView?.({ block: "nearest" });
    // optionId is derived from a stable id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selected]);

  function close(restore: boolean) {
    const target = returnFocus.current;
    onClose();
    if (!restore || !target) return;
    // Next frame, once the dialog is gone - and only if focus is still
    // nowhere. Something that took it in the meantime (a dialog the command
    // opened, the palette opened again) keeps it.
    requestAnimationFrame(() => {
      const idle = !document.activeElement || document.activeElement === document.body;
      if (idle && target.isConnected) target.focus();
    });
  }

  function runCommand(command: PaletteCommand) {
    close(command.restoreFocus ?? false);
    void command.run();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
      // The same keys that opened it close it. Stopped here so the window's
      // handler, which only opens, does not see them too.
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (shown.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((selected + step + shown.length) % shown.length);
    } else if (event.key === "Home" && shown.length) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End" && shown.length) {
      event.preventDefault();
      setActive(shown.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = shown[selected];
      if (command) runCommand(command);
      else if (query.trim()) {
        close(false);
        onSearch(query.trim());
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      // The field is the dialog's only stop; Tab must not walk out of a
      // modal into the page hidden behind it.
      event.preventDefault();
    }
  }

  const sections: { title: Section; items: { command: PaletteCommand; index: number }[] }[] = [];
  shown.forEach((command, index) => {
    const last = sections[sections.length - 1];
    if (last?.title === command.section) last.items.push({ command, index });
    else sections.push({ title: command.section, items: [{ command, index }] });
  });

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50">
          <div
            aria-hidden="true"
            className="absolute inset-0 animate-[fade-in_140ms_ease-out] bg-black/35 backdrop-blur-[2.5px] motion-reduce:animate-none"
            onMouseDown={() => close(true)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            className="absolute left-1/2 top-[12vh] flex w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 animate-[palette-in_240ms_cubic-bezier(.2,.9,.3,1.1)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-[var(--shadow-menu),0_48px_96px_rgb(0_0_0/28%)] motion-reduce:animate-none"
          >
            <label className="flex h-[58px] cursor-text items-center gap-3 border-b border-border pl-[18px] pr-3.5">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[19px] shrink-0 fill-none stroke-current text-[var(--text-muted)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={input}
                role="combobox"
                aria-label="Command or search"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={shown.length ? optionId(selected) : undefined}
                autoComplete="off"
                spellCheck={false}
                placeholder="Type a command, or search your clipboard…"
                value={query}
                onChange={(event) => {
                  const next = words(event.target.value);
                  setQuery(event.target.value);
                  setActive(bestMatch(matching(all, next), next));
                }}
                onKeyDown={onKeyDown}
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-base text-foreground outline-none placeholder:text-[var(--text-muted)]"
              />
              <button
                type="button"
                aria-label="Close command palette"
                onClick={() => close(true)}
                className="rounded-md"
              >
                <KeyCap aria-hidden className="px-1.5 py-1 text-[0.62rem]">Esc</KeyCap>
              </button>
            </label>

            <div id={listId} role="listbox" aria-label="Commands" className="flex max-h-[min(452px,60vh)] flex-col overflow-y-auto px-2 pb-2 pt-1.5">
              {shown.length === 0 && (
                <div role="presentation" className="flex flex-col items-center gap-1.5 px-4 py-9 text-center">
                  <span className="text-sm font-semibold text-foreground">No commands match “{query.trim()}”</span>
                  <span className="text-[0.78rem] text-[var(--text-muted)]">Press ↵ to search your clipboard history for it instead.</span>
                </div>
              )}
              {sections.map((section, sectionIndex) => (
                <div key={section.title} role="group" aria-labelledby={`${listId}-section-${sectionIndex}`}>
                  <div
                    id={`${listId}-section-${sectionIndex}`}
                    role="presentation"
                    className="px-2.5 pb-1.5 pt-3 text-[0.66rem] font-bold uppercase tracking-[0.09em] text-[var(--text-muted)]"
                  >
                    {section.title}
                  </div>
                  {section.items.map(({ command, index }) => {
                    const isSelected = index === selected;
                    return (
                      <div
                        key={command.id}
                        id={optionId(index)}
                        role="option"
                        aria-selected={isSelected}
                        // The field keeps focus; a click runs the row without
                        // taking it.
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => runCommand(command)}
                        onMouseMove={() => { if (!isSelected) setActive(index); }}
                        className={cn(
                          "group/cmd flex min-h-11 cursor-pointer items-center gap-3 rounded-[9px] px-2.5 py-1.5 transition-colors duration-100",
                          isSelected && "bg-[var(--accent-subtle)]",
                        )}
                      >
                        {command.tile}
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span
                            className={cn(
                              "truncate font-medium",
                              command.mono ? "font-mono text-[0.78rem]" : "text-[0.875rem]",
                              command.danger ? "text-[var(--danger)]" : "text-foreground",
                            )}
                          >
                            <Highlight text={command.title} terms={terms} selected={isSelected} />
                          </span>
                          <span className="truncate text-xs text-[var(--text-muted)]">{command.sub}</span>
                        </span>
                        <span
                          aria-hidden="true"
                          className={cn(
                            "ml-1.5 inline-flex h-[22px] w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent)] font-mono text-[0.69rem] text-[var(--accent-on)] transition-opacity duration-100",
                            isSelected ? "opacity-100" : "opacity-0",
                          )}
                        >
                          ↵
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div
              aria-hidden="true"
              className="flex items-center gap-4 border-t border-border bg-[color-mix(in_srgb,var(--surface-1)_60%,var(--page))] px-4 py-2.5 text-[0.72rem] text-[var(--text-muted)]"
            >
              <span className="inline-flex items-center gap-1.5"><Key>↑</Key><Key>↓</Key>navigate</span>
              <span className="inline-flex items-center gap-1.5"><Key>↵</Key>run</span>
              <span className="inline-flex items-center gap-1.5 max-[30rem]:hidden"><Key>{modifier}</Key><Key>K</Key>toggle</span>
              <span className="flex-1" />
              <span className="inline-flex items-center gap-[7px] font-semibold text-[var(--text-secondary)]">
                <span className="size-3.5 rounded-[4px] bg-[var(--accent)]" />
                SnipDock
              </span>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast tone={toast.tone}>{toast.text}</Toast>}
    </>
  );
}

function Key({ children }: { children: ReactNode }) {
  return <KeyCap className="px-1.5 py-[3px] text-[0.62rem]">{children}</KeyCap>;
}

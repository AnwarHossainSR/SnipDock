import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { GroupBy } from "../../api/types";
import { cn } from "@/lib/utils";

const options: { value: GroupBy | undefined; label: string; name: string }[] = [
  { value: undefined, label: "None", name: "No grouping" },
  { value: "date", label: "Date", name: "Date" },
  { value: "content_type", label: "Type", name: "Content type" },
  { value: "kind", label: "Kind", name: "Item kind" },
];

/** The toolbar's quiet button: a muted label, the current value, a chevron.
 *  Shared with the Source filter so the two read as one control family. */
export const toolbarMenuButton =
  "inline-flex h-[30px] min-h-0 items-center gap-1.5 rounded-[7px] px-2.5 text-[0.78rem] text-muted-foreground transition-colors duration-100 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground";

export function Chevron() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3 shrink-0 fill-none stroke-current text-[var(--text-muted)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2.2]">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/**
 * How the history is grouped, as one button and a menu. It was four
 * always-visible segments, which pushed the toolbar onto a second line.
 *
 * A menu of `menuitemradio`s, not a native `<select>`: a select owns
 * `role="option"` children, and the history under it is a listbox of
 * options, so a screen-reader user would meet two unrelated sets of options
 * with nothing to tell them apart.
 */
export default function GroupMenu({
  value,
  onChange,
}: {
  value: GroupBy | undefined;
  onChange: (value: GroupBy | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    // The checked item takes focus, so the menu opens where the user is.
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (root.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      close();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home" ? 0
      : event.key === "End" ? items.length - 1
      : event.key === "ArrowDown" ? (at + 1) % items.length
      : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        className={toolbarMenuButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title="Group the history"
        onClick={() => setOpen((was) => !was)}
      >
        <span className="text-[var(--text-muted)]">Group</span>
        <span className="font-semibold text-foreground">{current.label}</span>
        <Chevron />
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label="Group captures"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-[calc(100%+0.35rem)] z-30 grid min-w-[11rem] origin-top-right animate-[menu-in_120ms_ease-out] rounded-[10px] border border-border bg-background p-1 shadow-[var(--shadow-menu)] motion-reduce:animate-none"
        >
          {options.map((option) => {
            const checked = option.value === value;
            return (
              <button
                key={option.name}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
                className={cn(
                  "flex min-h-8 items-center gap-2.5 rounded-md px-2.5 text-left text-[0.78rem] transition-colors duration-100 focus-visible:outline-offset-[-2px]",
                  checked ? "font-semibold text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className={cn("size-3.5 shrink-0 fill-none stroke-[var(--accent)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2.4]", !checked && "invisible")}>
                  <path d="m5 12 4.5 4.5L19 7" />
                </svg>
                {option.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

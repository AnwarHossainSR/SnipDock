import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * The SnipDock mark: a clipboard, the capture before it, and the dock they
 * sit in.
 *
 * Same geometry as the packaged icon, `src-tauri/icons/icon.svg`, so the top
 * bar, the taskbar and the site all show one logo. Colours come from the
 * `--logo-*` tokens, which follow the chosen accent; on the default theme the
 * mark is the icon exactly. Decorative everywhere it is used - the wordmark or
 * a label beside it carries the name.
 */
export function BrandMark({ className }: { className?: string }) {
  // Gradients are looked up by id across the whole document, so each mark
  // needs its own. `useId` output carries characters `url(#...)` will not take.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const tile = `snipdock-tile-${id}`;
  const tray = `snipdock-tray-${id}`;

  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 64 64" className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id={tile} x1="12" y1="0" x2="52" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: "var(--logo-from)" }} />
          <stop offset="1" style={{ stopColor: "var(--logo-to)" }} />
        </linearGradient>
        <linearGradient id={tray} x1="0" y1="39" x2="0" y2="55" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: "var(--logo-tray-top)" }} />
          <stop offset="1" style={{ stopColor: "var(--logo-tray-bottom)" }} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14.5" fill={`url(#${tile})`} />
      <rect
        x="24"
        y="9"
        width="27"
        height="33"
        rx="5"
        fillOpacity="0.32"
        transform="rotate(9 37.5 25.5)"
        style={{ fill: "var(--logo-card)" }}
      />
      <rect x="17" y="12" width="28" height="35" rx="5" style={{ fill: "var(--logo-card)" }} />
      <rect x="24" y="9" width="14" height="6.5" rx="3.25" style={{ fill: "var(--logo-clip)" }} />
      <rect x="22" y="21" width="12" height="3" rx="1.5" style={{ fill: "var(--logo-line)" }} />
      <rect x="22" y="27" width="18" height="3" rx="1.5" style={{ fill: "var(--logo-line-soft)" }} />
      <rect x="22" y="33" width="10" height="3" rx="1.5" style={{ fill: "var(--logo-line-soft)" }} />
      <path
        fill={`url(#${tray})`}
        d="M9 43V42Q9 39 12 39H13.5Q16 39 16 41.5Q16 44 18.5 44H43.5Q46 44 46 41.5Q46 39 48.5 39H52Q55 39 55 42V50Q55 55 50 55H14Q9 55 9 50Z"
      />
    </svg>
  );
}

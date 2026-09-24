import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one confirmation surface: inverted, centred under the content column,
 * with a check in the accent and room for a single action (Undo).
 *
 * Inverted because it has to be noticed over whatever the list is showing,
 * and a card-coloured toast over card-coloured rows was easy to miss.
 * Centred under the content rather than the window, so it sits below what was
 * acted on instead of under the sidebar.
 */
export function Toast({
  children,
  action,
  tone = "success",
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  /** `error` swaps the check for a warning mark: a failure must not read as done. */
  tone?: "success" | "error";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-6 z-40 flex justify-center",
        "left-[var(--sidebar-width)] right-0 max-[47rem]:left-[var(--sidebar-collapsed)]",
        className,
      )}
    >
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex max-w-[calc(100%-2rem)] animate-[toast-in_220ms_cubic-bezier(.2,.9,.3,1.15)] items-center gap-2.5 rounded-[11px] bg-foreground py-2 pl-3.5 pr-3 text-[0.8rem] font-medium text-background shadow-[var(--shadow-menu)] motion-reduce:animate-none"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={cn(
            "size-4 shrink-0 fill-none [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2.2]",
            // The danger red is tuned for the page, not for this inverted
            // surface, where it fell below 3:1 in dark mode; the triangle carries it.
            tone === "error" ? "stroke-current" : "stroke-[var(--accent)]",
          )}
        >
          {tone === "error" ? <path d="M12 8v5M12 16.5v.01M12 3.5l9 16H3Z" /> : <path d="m5 12 4.5 4.5L19 7" />}
        </svg>
        <span className="min-w-0 truncate">{children}</span>
        {action}
      </div>
    </div>
  );
}

/** The action a toast can carry. Tinted from the toast's own colours so it
 *  reads as part of it in either mode. */
export function ToastAction({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="ml-1 inline-flex h-[26px] min-h-0 shrink-0 items-center gap-1.5 rounded-[7px] bg-background/15 px-2.5 text-[0.78rem] font-semibold text-background transition-colors hover:bg-background/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]">
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
      </svg>
      {children}
    </button>
  );
}

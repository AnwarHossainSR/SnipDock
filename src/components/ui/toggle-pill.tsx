import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

interface TogglePillProps extends Omit<ComponentProps<"button">, "onChange" | "type"> {
  pressed: boolean;
}

/** Individually toggleable pill, replacing a native checkbox in a wrapped list. */
export function TogglePill({ pressed, className, children, ...props }: TogglePillProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        "cursor-pointer whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-colors",
        pressed
          ? "border-[var(--accent)] bg-accent text-primary"
          : "border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

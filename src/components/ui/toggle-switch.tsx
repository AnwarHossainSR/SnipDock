import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

interface ToggleSwitchProps extends Omit<ComponentProps<"button">, "onChange" | "type"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** Replaces native `<input type="checkbox">` for boolean settings across the app. */
export function ToggleSwitch({ checked, onCheckedChange, className, disabled, ...props }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-[var(--accent)] bg-primary"
          : "border-border bg-[var(--surface-2)]",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[1.15rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

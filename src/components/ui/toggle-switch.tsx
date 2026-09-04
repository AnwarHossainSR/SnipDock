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
        "relative inline-flex h-[23px] w-10 shrink-0 cursor-pointer items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        checked
          ? "border-[var(--accent)] bg-primary ring-[3px] ring-primary/[0.12]"
          : "border-border bg-muted",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-[17px] rounded-full shadow-sm transition-transform motion-reduce:transition-none",
          checked ? "translate-x-[1.24rem] bg-[var(--accent-on)]" : "translate-x-[2px] bg-[var(--text-muted)]",
        )}
      />
    </button>
  );
}

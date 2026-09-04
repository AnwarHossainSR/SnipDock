import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CheckboxFieldProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * A labelled checkbox for surfaces outside the settings form, which paints its
 * native checkboxes from `base.css`. The input stays native and merely hidden,
 * so the tick beside it is decoration over real checkbox semantics.
 */
export function CheckboxField({
  checked,
  onCheckedChange,
  label,
  disabled,
  className,
}: CheckboxFieldProps) {
  return (
    <label
      className={cn(
        "group relative flex items-center gap-2.5 text-sm",
        disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer",
        className,
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className={cn(
          "grid size-4 shrink-0 place-content-center rounded-sm border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]",
          checked
            ? "border-[var(--accent)] bg-primary"
            : "border-[var(--border-strong)] bg-[var(--surface-2)]",
          !checked && !disabled && "group-hover:border-[var(--accent)]",
        )}
      >
        <svg
          viewBox="0 0 16 16"
          className={cn(
            "size-3 fill-none stroke-[var(--accent-on)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2.4] transition-transform",
            checked ? "scale-100" : "scale-0",
          )}
        >
          <path d="m3.5 8.4 3 3 6-6.4" />
        </svg>
      </span>
      <span className={cn(checked ? "text-foreground" : "text-muted-foreground")}>{label}</span>
    </label>
  );
}

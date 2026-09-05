import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Radio controls used wherever a setting is one-of-several. Both variants keep
 * a real `<input type="radio">` - only its painting is replaced - so arrow-key
 * navigation, form semantics, and screen-reader announcements stay native.
 *
 * `RadioCard` is the roomy variant for a choice that needs a sentence of
 * explanation; `SegmentedRadio` is the compact variant for short, scannable
 * values that belong on one line beside their label.
 */

interface RadioCardProps {
  /** Shared across the cards of one choice - that grouping is what makes arrow keys work. */
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  label: ReactNode;
  hint?: ReactNode;
  /** A picture of what the option does - a theme's own surfaces, say - drawn
   *  above the label. Seeing the choice beats reading its name. */
  preview?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function RadioCard({
  name,
  value,
  checked,
  onChange,
  label,
  hint,
  preview,
  disabled,
  className,
}: RadioCardProps) {
  return (
    <label
      className={cn(
        "group relative rounded-md border p-2.5 transition-colors",
        preview ? "grid gap-2.5" : "flex items-start gap-2.5",
        disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer",
        checked
          ? "border-2 border-[var(--accent)] bg-accent ring-[3px] ring-primary/10"
          : "border-2 border-border bg-transparent",
        !checked && !disabled && "hover:border-[var(--border-strong)] hover:bg-muted",
        className,
      )}
    >
      <input
        type="radio"
        className="peer sr-only"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
      />
      {/* The ring lives on an overlay rather than the input, so a keyboard focus
          outlines the whole card the pointer would have clicked. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-md peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]"
      />
      {preview}
      <span
        aria-hidden="true"
        className={cn(
          "mt-px grid size-4 shrink-0 place-content-center rounded-full border transition-colors",
          preview && "absolute right-2.5 top-2.5",
          checked
            ? "border-[var(--accent)] bg-primary"
            : "border-[var(--border-strong)] bg-[var(--surface-2)]",
        )}
      >
        <span
          className={cn(
            "size-1.5 rounded-full bg-[var(--accent-on)] transition-transform",
            checked ? "scale-100" : "scale-0",
          )}
        />
      </span>
      <span className="grid gap-0.5">
        <span className={cn("text-sm leading-tight font-medium", checked ? "text-primary" : "text-foreground")}>
          {label}
        </span>
        {hint && <span className="text-xs leading-snug font-normal text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedRadioProps<T extends string> {
  name: string;
  /** Names the group for assistive tech; the visible label sits beside it. */
  ariaLabel: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  /** Numeric values read better in the tabular mono face. */
  mono?: boolean;
}

export function SegmentedRadio<T extends string>({
  name,
  ariaLabel,
  options,
  value,
  onChange,
  disabled,
  className,
  mono,
}: SegmentedRadioProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "flex items-center gap-0.5 rounded-md bg-muted p-1 ring-1 ring-inset ring-border",
        disabled && "opacity-55",
        className,
      )}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              "relative rounded-sm px-2.5 py-1 text-xs font-semibold transition-colors",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
              checked
                ? "bg-card text-primary shadow-[var(--shadow-panel)] ring-1 ring-[var(--accent)]"
                : "text-muted-foreground",
              !checked && !disabled && "hover:bg-card/70 hover:text-foreground",
              mono && "font-mono tabular-nums",
            )}
          >
            <input
              type="radio"
              className="peer sr-only"
              name={name}
              value={option.value}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(option.value)}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

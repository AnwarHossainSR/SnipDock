import type { ChangeEvent, FocusEvent, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

interface NumberFieldProps {
  id: string;
  ariaLabel: string;
  value: string;
  min: number;
  max: number;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onStep: (nextValue: number) => void;
}

/** Fixed ~132px number input with +/- steppers, replacing bare native `<input type="number">` fields. */
export function NumberField({
  id,
  ariaLabel,
  value,
  min,
  max,
  disabled,
  invalid,
  onChange,
  onBlur,
  onKeyDown,
  onStep,
}: NumberFieldProps) {
  function step(delta: number) {
    const current = Number(value);
    const base = Number.isFinite(current) ? current : min;
    onStep(Math.min(max, Math.max(min, base + delta)));
  }

  return (
    <div className="inline-flex h-8 w-[8.25rem] items-stretch overflow-hidden rounded-sm border border-border bg-muted">
      <button
        type="button"
        className="grid w-6 shrink-0 place-items-center text-muted-foreground hover:bg-[var(--color-surface-raised)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Decrease"
        aria-controls={id}
        disabled={disabled}
        onClick={() => step(-1)}
      >
        −
      </button>
      <input
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        className={cn(
          "min-w-0 flex-1 border-x border-border bg-transparent px-1 text-center font-normal text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          invalid && "text-destructive",
        )}
        type="text"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        onBlur={(event: FocusEvent<HTMLInputElement>) => onBlur(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        className="grid w-6 shrink-0 place-items-center text-muted-foreground hover:bg-[var(--color-surface-raised)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Increase"
        aria-controls={id}
        disabled={disabled}
        onClick={() => step(1)}
      >
        +
      </button>
    </div>
  );
}

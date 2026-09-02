import type { SearchMode } from "../../api/types";
import { cn } from "@/lib/utils";

interface SearchModeToggleProps {
  value: SearchMode;
  onChange: (next: SearchMode) => void;
  /** Compact renders the labels alone; default puts each label on a chip. */
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
}

const OPTIONS: { value: SearchMode; label: string }[] = [
  { value: "literal", label: "Literal" },
  { value: "regex", label: "Regex" },
];

const trackClass =
  "inline-flex items-center gap-0.5 rounded-md bg-muted/50 p-1 ring-1 ring-inset ring-border/60";

/**
 * A two-segment toggle for the clipboard search box's mode. Reads the
 * current `SearchMode` from the clipboard store and calls `onChange`
 * with the next value, never mutates state on its own so the same
 * component can be rendered next to multiple search inputs.
 */
export default function SearchModeToggle({
  value,
  onChange,
  size = "md",
  className,
  disabled = false,
}: SearchModeToggleProps) {
  const isSmall = size === "sm";
  const itemClass = cn(
    "group inline-flex items-center gap-1.5 rounded-sm font-semibold text-muted-foreground transition-[background-color,color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
    isSmall
      ? "h-6 px-2 text-[0.68rem]"
      : "h-7 px-2.5 text-[0.7rem]",
    "hover:bg-card/70 hover:text-foreground",
    "aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-[var(--shadow-panel)] aria-pressed:ring-1 aria-pressed:ring-primary/25",
  );

  return (
    <div
      role="group"
      aria-label="Search mode"
      className={cn(trackClass, className)}
    >
      {OPTIONS.map((option) => {
        const pressed = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={itemClass}
            title={
              option.value === "regex"
                ? "Treat the query as a regular expression"
                : "Match the query as a literal substring"
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

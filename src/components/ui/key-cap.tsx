import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One physical-looking key. The heavier bottom border is the whole trick: it
 * reads as an edge, so a binding looks like something you press rather than a
 * string someone typed.
 */
export function KeyCap({
  children,
  tone = "default",
  className,
  ...rest
}: {
  children: ReactNode;
  /** `conflict` marks a binding that collides with another one. */
  tone?: "default" | "conflict";
  className?: string;
} & ComponentProps<"kbd">) {
  return (
    <kbd
      {...rest}
      className={cn(
        "inline-flex items-center rounded-md border border-b-2 px-[9px] py-[5px] font-mono text-[0.69rem] leading-none",
        tone === "conflict"
          ? "border-destructive/40 bg-destructive/[0.08] text-destructive"
          : "border-input bg-background text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** A whole binding, split into one cap per key. */
export function KeyCombo({
  binding,
  tone = "default",
  className,
}: {
  binding: string;
  tone?: "default" | "conflict";
  className?: string;
}) {
  const keys = binding.split(/\s*\+\s*|\s+/).filter(Boolean);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {/* The caps are a picture of the binding; the binding itself is still
          read out - and still found by a text search - as one string. */}
      <span className="sr-only">{binding}</span>
      {keys.map((key, index) => (
        <KeyCap key={`${key}-${index}`} aria-hidden tone={tone}>
          {key}
        </KeyCap>
      ))}
    </span>
  );
}

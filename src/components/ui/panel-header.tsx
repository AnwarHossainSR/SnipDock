import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelHeaderProps {
  /** The small accent label above the heading, e.g. "Backup". */
  eyebrow: string;
  title: string;
  /** `id` for the heading, so the panel can be labelled by it. */
  titleId: string;
  description?: ReactNode;
  /** Anything that sits opposite the heading: a button, a version badge. */
  action?: ReactNode;
  className?: string;
}

/**
 * The header every settings panel wears. Six panels each wrote out the same
 * rule, heading scale, and eyebrow, which is how they drifted apart in the
 * first place.
 */
export function PanelHeader({
  eyebrow,
  title,
  titleId,
  description,
  action,
  className,
}: PanelHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4",
        className,
      )}
    >
      <div className="min-w-0">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-[var(--text-secondary)]">{eyebrow}</span>
        <h3 className="mt-1 text-xl font-semibold tracking-tight" id={titleId}>
          {title}
        </h3>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </header>
  );
}

/**
 * The boxed reading a panel header puts opposite its title - an installed
 * version, the time of the last backup. Both panels drew their own before.
 */
export function PanelStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="shrink-0 rounded-md border border-border bg-muted px-3 py-2 text-right">
      <p className="text-[0.62rem] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="text-sm font-semibold">{children}</p>
    </div>
  );
}

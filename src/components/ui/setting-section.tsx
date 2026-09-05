import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingSectionProps {
  title: string;
  /** `id` for the heading, so the section is labelled by it. Scroll targets
   *  belong to whatever lays the sections out, not to the card. */
  titleId: string;
  description?: ReactNode;
  /** The glyph inside the tinted tile. */
  icon?: ReactNode;
  /** The colour the icon tile is tinted with - a token reference, never a
   *  literal. Defaults to the accent. */
  tone?: string;
  /** Anything that sits opposite the title: a status pill, a master toggle. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * One card of settings. Every settings panel used to write its own rule,
 * padding, and heading scale around a list of rows, which is how a page of
 * them ended up reading as a wall. The card owns all of that, so a panel is
 * a composition of sections and nothing positions its own spacing again.
 */
export function SettingSection({
  title,
  titleId,
  description,
  icon,
  tone = "var(--accent)",
  action,
  className,
  children,
}: SettingSectionProps) {
  return (
    <section
      aria-labelledby={titleId}
      className={cn("overflow-hidden rounded-lg border border-border bg-card", className)}
    >
      <header className="flex items-center gap-3 border-b border-border bg-background px-[18px] py-3.5">
        {icon && (
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-md"
            style={{
              color: tone,
              background: `color-mix(in srgb, ${tone} 13%, transparent)`,
            }}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-sm font-semibold tracking-tight">
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-[0.72rem] leading-snug text-[var(--text-muted)]">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div>{children}</div>
    </section>
  );
}

interface SettingRowProps {
  /** Optional: a row that is only a block of content - a chart, a list -
   *  carries no label column. */
  title?: ReactNode;
  description?: ReactNode;
  /** The control this row is about. It is always right-aligned and never
   *  positions itself - that is the whole point of the row owning spacing. */
  control?: ReactNode;
  className?: string;
  /** Content that runs the full width under the row, for a list or chips
   *  that cannot sit in the control column. */
  children?: ReactNode;
}

/** One labelled setting inside a `SettingSection`. */
export function SettingRow({ title, description, control, className, children }: SettingRowProps) {
  return (
    <div className={cn("border-b border-border/60 px-[18px] py-4 last:border-b-0", className)}>
      {(title || description || control) && (
        <div className="flex items-center gap-5">
          <div className="min-w-0 flex-1">
            {title && <div className="text-[0.8rem] font-medium text-foreground">{title}</div>}
            {description && (
              <p className="mt-[3px] text-[0.72rem] leading-snug text-[var(--text-muted)]">{description}</p>
            )}
          </div>
          {control && <div className="shrink-0">{control}</div>}
        </div>
      )}
      {children && <div className={title || description || control ? "mt-3" : ""}>{children}</div>}
    </div>
  );
}

/** The small state badge a section header carries: "Active", "Paused". */
export function SettingStatusPill({
  tone = "var(--success)",
  children,
}: {
  tone?: string;
  children: ReactNode;
}) {
  return (
    <span
      className="rounded-md px-2 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.05em]"
      style={{ color: tone, background: `color-mix(in srgb, ${tone} 13%, transparent)` }}
    >
      {children}
    </span>
  );
}

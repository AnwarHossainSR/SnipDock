import { parseChangelog, getCategoryColor } from "../../lib/changelog";

interface ChangelogViewProps {
  notes: string | null;
  variant?: "compact" | "full";
}

export default function ChangelogView({ notes, variant = "full" }: ChangelogViewProps) {
  const changelog = parseChangelog(notes);

  if (notes !== null && !changelog.hasContent) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No changelog available for this version.
      </p>
    );
  }

  if (!changelog.hasContent) {
    return null;
  }

  if (variant === "compact") {
    return (
      <div className="space-y-2 text-xs">
        {changelog.sections.map((section) => (
          <div key={section.category}>
            <span className={`font-semibold uppercase tracking-wider ${getCategoryColor(section.category)}`}>
              {section.category}
            </span>
            <span className="ml-2 text-muted-foreground">
              {section.items.length === 1 ? "1 item" : `${section.items.length} items`}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {changelog.sections.map((section) => (
        <div key={section.category}>
          <p className={`text-xs font-semibold uppercase tracking-wider ${getCategoryColor(section.category)}`}>
            {section.category}
          </p>
          <ul className="mt-1 space-y-1 pl-4">
            {section.items.map((item, i) => (
              <li key={i} className="text-sm text-muted-foreground relative before:content-['•'] before:absolute before:-left-1 before:text-muted-foreground/50">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

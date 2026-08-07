import { useEffect, useRef, useState } from "react";
import { parseChangelog, getCategoryColor } from "../../lib/changelog";

interface ChangelogViewProps {
  notes: string | null;
  variant?: "compact" | "full";
  showCopyButton?: boolean;
}

function formatChangelogAsText(notes: string | null): string {
  const changelog = parseChangelog(notes);
  if (!changelog.hasContent || !notes) return notes || "";
  return changelog.sections
    .map((section) => `${section.category}\n${section.items.map((item) => `  - ${item}`).join("\n")}`)
    .join("\n\n");
}

export default function ChangelogView({ notes, variant = "full", showCopyButton = false }: ChangelogViewProps) {
  const changelog = parseChangelog(notes);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(changelog.sections.map((s) => s.category))
  );

  useEffect(() => {
    return () => {
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
    };
  }, []);

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

  function toggleSection(category: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function copyToClipboard() {
    const text = formatChangelogAsText(notes);
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    });
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
      <div className="flex items-center justify-between">
        <div />
        {showCopyButton && (
          <button
            type="button"
            onClick={copyToClipboard}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? (
              <>
                <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy
              </>
            )}
          </button>
        )}
      </div>
      {changelog.sections.map((section) => {
        const expanded = expandedSections.has(section.category);
        return (
          <div key={section.category}>
            <button
              type="button"
              onClick={() => toggleSection(section.category)}
              className="flex items-center gap-2 w-full text-left group"
            >
              <p className={`text-xs font-semibold uppercase tracking-wider ${getCategoryColor(section.category)}`}>
                {section.category}
              </p>
              <span className="text-xs text-muted-foreground">
                ({section.items.length})
              </span>
              <svg
                className={`size-3 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            {expanded && (
              <ul className="mt-1 space-y-1 pl-4">
                {section.items.map((item, i) => (
                  <li key={i} className="text-sm text-muted-foreground relative before:content-['•'] before:absolute before:-left-1 before:text-muted-foreground/50">
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

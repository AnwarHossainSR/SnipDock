export interface ChangelogSection {
  category: string;
  items: string[];
}

export interface ParsedChangelog {
  sections: ChangelogSection[];
  hasContent: boolean;
}

const CATEGORY_ORDER = ["Added", "Fixed", "Changed", "Removed", "Deprecated", "Security"];

function sortSections(sections: ChangelogSection[]): ChangelogSection[] {
  return [...sections].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.category);
    const bi = CATEGORY_ORDER.indexOf(b.category);
    const aOrder = ai === -1 ? CATEGORY_ORDER.length : ai;
    const bOrder = bi === -1 ? CATEGORY_ORDER.length : bi;
    return aOrder - bOrder;
  });
}

export function parseChangelog(notes: string | null): ParsedChangelog {
  if (!notes) {
    return { sections: [], hasContent: false };
  }

  const sections: ChangelogSection[] = [];
  const lines = notes.split("\n");

  let currentCategory: string | null = null;
  let currentItems: string[] = [];

  for (const line of lines) {
    const categoryMatch = line.match(/^###\s+(.+)$/);
    if (categoryMatch) {
      if (currentCategory && currentItems.length > 0) {
        sections.push({ category: currentCategory, items: currentItems });
      }
      currentCategory = categoryMatch[1].trim();
      currentItems = [];
      continue;
    }

    const itemMatch = line.match(/^[-*]\s+(.+)$/);
    if (itemMatch && currentCategory) {
      currentItems.push(itemMatch[1].trim());
    }
  }

  if (currentCategory && currentItems.length > 0) {
    sections.push({ category: currentCategory, items: currentItems });
  }

  if (sections.length === 0 && notes.trim().length > 0) {
    const items = notes
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (items.length > 0) {
      sections.push({ category: "Changes", items });
    }
  }

  return {
    sections: sortSections(sections),
    hasContent: sections.length > 0,
  };
}

export function getCategoryColor(category: string): string {
  const normalized = category.toLowerCase();
  if (normalized === "added" || normalized === "new") return "text-emerald-400";
  if (normalized === "fixed" || normalized === "bugfix") return "text-sky-400";
  if (normalized === "changed" || normalized === "updated") return "text-amber-400";
  if (normalized === "removed" || normalized === "deprecated") return "text-rose-400";
  return "text-muted-foreground";
}

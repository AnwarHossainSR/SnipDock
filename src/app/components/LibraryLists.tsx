import { useCallback, useEffect, useState } from "react";
import { commands } from "../../api/commands";
import type { Project, SearchQuery, Tag } from "../../api/types";
import { cn } from "@/lib/utils";
import { useClipboardStore } from "../../stores/clipboardStore";

const emptyQuery: SearchQuery = {
  text: null,
  kinds: ["clipboard"],
  content_types: [],
  languages: [],
  project_ids: [],
  category_ids: [],
  tag_ids: [],
  pinned: null,
  favorite: null,
  created_from: null,
  created_to: null,
  sort: "newest",
  limit: 100,
  offset: 0,
};

const headingClass =
  "flex items-center gap-2 px-3 text-[0.62rem] font-bold uppercase tracking-[0.06em] text-[var(--color-text-subtle)]";
const countClass =
  "rounded-full bg-muted px-1.5 font-mono text-[0.6rem] tabular-nums text-muted-foreground";

function rowClass(open: boolean) {
  return cn(
    "flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-3 text-left text-xs transition-colors",
    open
      ? "bg-accent font-semibold text-primary"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

/**
 * Tags and projects, listed under the saved searches. Opening one filters the
 * history by it, using the same mechanism a smart folder does - the backend
 * evaluates the query either way, so there is nothing here to keep in step
 * with it.
 */
export default function LibraryLists() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const savedSearch = useClipboardStore((state) => state.savedSearch);
  const applySavedSearch = useClipboardStore((state) => state.applySavedSearch);

  const refresh = useCallback(() => {
    void commands.listTags().then(
      (result) => setTags(Array.isArray(result) ? result : []),
      () => {},
    );
    void commands.listProjects().then(
      (result) => setProjects(Array.isArray(result) ? result : []),
      () => {},
    );
  }, []);

  useEffect(() => {
    refresh();
    // Tagging happens in the inspector, which replaces the item in the store.
    const unsubscribe = useClipboardStore.subscribe((state) => state.items, refresh);
    return unsubscribe;
  }, [refresh]);

  if (tags.length === 0 && projects.length === 0) return null;

  return (
    <>
      {tags.length > 0 && (
        <div className="mt-5 grid min-h-0 min-w-0 gap-1 max-[47rem]:hidden">
          <p className={headingClass}>
            Tags
            <span className={countClass}>{tags.length}</span>
          </p>
          <ul className="grid min-w-0 gap-0.5 overflow-y-auto">
            {tags.map((tag) => {
              const open = savedSearch?.source === "tag" && savedSearch.id === tag.id;
              return (
                <li key={tag.id} className="min-w-0">
                  <button
                    type="button"
                    aria-current={open ? "true" : undefined}
                    className={rowClass(open)}
                    onClick={() =>
                      applySavedSearch({
                        id: tag.id,
                        name: tag.name,
                        query: { ...emptyQuery, tag_ids: [tag.id] },
                        source: "tag",
                      })
                    }
                  >
                    <span
                      aria-hidden="true"
                      className="size-[0.4rem] shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color || "var(--color-accent)" }}
                    />
                    <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                    <span className="shrink-0 font-mono text-[0.6rem] tabular-nums text-[var(--color-text-subtle)]">
                      {tag.usage_count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {projects.length > 0 && (
        <div className="mt-5 grid min-h-0 min-w-0 gap-1 max-[47rem]:hidden">
          <p className={headingClass}>
            Projects
            <span className={countClass}>{projects.length}</span>
          </p>
          <ul className="grid min-w-0 gap-0.5 overflow-y-auto">
            {projects.map((project) => {
              const open = savedSearch?.source === "project" && savedSearch.id === project.id;
              return (
                <li key={project.id} className="min-w-0">
                  <button
                    type="button"
                    aria-current={open ? "true" : undefined}
                    className={rowClass(open)}
                    title={project.description ?? project.name}
                    onClick={() =>
                      applySavedSearch({
                        id: project.id,
                        name: project.name,
                        query: { ...emptyQuery, project_ids: [project.id] },
                        source: "project",
                      })
                    }
                  >
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { commands } from "../../lib/commands";
import type { LibraryItem, Project, SearchQuery } from "../../lib/types";
import ProjectEditor from "./ProjectEditor";

const reusableQuery: SearchQuery = {
  text: null,
  kinds: ["snippet", "command", "template", "note"],
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
  limit: 200,
  offset: 0,
};

type PanelState =
  | { status: "loading"; projects: Project[]; items: LibraryItem[] }
  | { status: "ready"; projects: Project[]; items: LibraryItem[] }
  | { status: "error"; projects: Project[]; items: LibraryItem[] };

function itemTitle(item: LibraryItem) {
  return item.title?.trim() || item.kind[0].toUpperCase() + item.kind.slice(1);
}

function activityTime(item: LibraryItem) {
  return item.last_used_at ?? item.updated_at;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function ProjectsPanel() {
  const [state, setState] = useState<PanelState>({
    status: "loading",
    projects: [],
    items: [],
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Project | null | false>(false);
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingMove, setPendingMove] = useState("");
  const focusTarget = useRef<string | null>(null);
  const editorReturnFocus = useRef("new-project");

  useEffect(() => {
    let active = true;
    Promise.all([commands.listProjects(true), commands.searchItems(reusableQuery)]).then(
      ([projects, page]) => {
        if (!active) return;
        setState({ status: "ready", projects, items: page.items });
        setSelectedId(projects.find((project) => !project.archived_at)?.id ?? null);
      },
      () => {
        if (active) setState({ status: "error", projects: [], items: [] });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!focusTarget.current) return;
    const target = document.getElementById(focusTarget.current);
    if (!target) return;
    target.focus();
    focusTarget.current = null;
  }, [editing, selectedId, state.projects]);

  const visibleProjects = showArchived
    ? state.projects
    : state.projects.filter((project) => !project.archived_at);
  const selected = state.projects.find((project) => project.id === selectedId) ?? null;
  const projectItems = selected
    ? state.items
        .filter((item) => item.project_id === selected.id)
        .sort((a, b) => activityTime(b).localeCompare(activityTime(a)))
    : [];
  const assignable = selected
    ? state.items.filter((item) => item.project_id !== selected.id)
    : [];

  function itemCount(project: Project) {
    return state.items.filter((item) => item.project_id === project.id).length;
  }

  function replaceProject(project: Project) {
    setState((current) => {
      const exists = current.projects.some((entry) => entry.id === project.id);
      return {
        ...current,
        projects: exists
          ? current.projects.map((entry) => (entry.id === project.id ? project : entry))
          : [project, ...current.projects],
      };
    });
  }

  function replaceItem(updated: LibraryItem) {
    setState((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === updated.id ? updated : item)),
    }));
  }

  async function runAction<T>(command: () => Promise<T>, apply: (result: T) => void) {
    setBusy(true);
    setActionError("");
    try {
      apply(await command());
    } catch {
      setActionError("Could not complete that project action.");
    } finally {
      setBusy(false);
    }
  }

  function openEditor(project: Project | null, returnFocusId: string) {
    editorReturnFocus.current = returnFocusId;
    setEditing(project);
  }

  function closeEditor() {
    focusTarget.current = editorReturnFocus.current;
    setEditing(false);
  }

  function saveProject(project: Project) {
    replaceProject(project);
    setSelectedId(project.id);
    if (project.archived_at) setShowArchived(true);
    closeEditor();
  }

  function toggleArchive(project: Project) {
    const archiving = !project.archived_at;
    void runAction(
      () => commands.saveProject({
        id: project.id,
        name: project.name,
        description: project.description,
        tag_ids: [],
        archived: archiving,
      }),
      (saved) => {
        replaceProject(saved);
        setActionMessage(archiving ? "Project archived" : "Project restored");
        if (archiving && !showArchived) {
          const next = state.projects.find(
            (entry) => entry.id !== saved.id && !entry.archived_at,
          );
          setSelectedId(next?.id ?? null);
          focusTarget.current = next ? `project-${next.id}` : "new-project";
        }
      },
    );
  }

  function moveItemIn() {
    if (!selected || !pendingMove) return;
    const itemId = pendingMove;
    setPendingMove("");
    void runAction(
      () => commands.moveItem(itemId, selected.id),
      (updated) => {
        replaceItem(updated);
        setActionMessage(`Moved “${itemTitle(updated)}” into ${selected.name}.`);
      },
    );
  }

  function moveItemOut(item: LibraryItem) {
    void runAction(
      () => commands.moveItem(item.id, null),
      (updated) => {
        replaceItem(updated);
        setActionMessage(`Removed “${itemTitle(updated)}” from the project.`);
      },
    );
  }

  function selectByKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowDown") next = Math.min(index + 1, visibleProjects.length - 1);
    else if (event.key === "ArrowUp") next = Math.max(index - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = visibleProjects.length - 1;
    else return;

    event.preventDefault();
    const project = visibleProjects[next];
    if (!project) return;
    setSelectedId(project.id);
    document.getElementById(`project-${project.id}`)?.focus();
  }

  if (editing !== false) {
    return (
      <main className="workspace-content">
        <ProjectEditor project={editing} onSaved={saveProject} onCancel={closeEditor} />
      </main>
    );
  }

  return (
    <main className="workspace-content">
      <header className="content-heading snippet-heading">
        <div>
          <p>Projects</p>
          <h2 id="workspace-title" tabIndex={-1}>Organize your library</h2>
        </div>
        <div className="snippet-heading__actions">
          <button
            id="new-project"
            className="button-primary"
            type="button"
            onClick={() => openEditor(null, "new-project")}
          >
            New project
          </button>
          <span className="item-count">
            {visibleProjects.length} {visibleProjects.length === 1 ? "project" : "projects"}
          </span>
        </div>
      </header>
      <div className="sr-only" aria-live="polite">{actionMessage}</div>
      {actionError && <p className="action-error" role="alert">{actionError}</p>}
      <section
        className={state.status === "ready" && visibleProjects.length > 0
          ? "content-panel snippet-panel has-items"
          : "content-panel snippet-panel"}
        aria-label="Projects"
      >
        {state.status === "loading" && (
          <div className="content-state" role="status" aria-busy="true">
            <span className="loading-ring" aria-hidden="true" />
            <p>Loading projects...</p>
          </div>
        )}
        {state.status === "error" && (
          <div className="content-state" role="alert">
            <span className="state-mark" aria-hidden="true">!</span>
            <div>
              <h3>Projects unavailable</h3>
              <p>Close and reopen SnipDock to try again.</p>
            </div>
          </div>
        )}
        {state.status === "ready" && visibleProjects.length === 0 && (
          <div className="content-state" role="status">
            <div>
              <h3>{showArchived ? "No projects yet" : "No active projects"}</h3>
              <p>Group snippets, commands, and notes into projects to stay organized.</p>
            </div>
          </div>
        )}
        {state.status === "ready" && visibleProjects.length > 0 && (
          <div className="snippet-layout">
            <div className="snippet-list">
              <div className="snippet-list__items" role="listbox" aria-label="Projects">
                {visibleProjects.map((project, index) => (
                  <button
                    id={`project-${project.id}`}
                    className="snippet-list__item"
                    type="button"
                    role="option"
                    aria-selected={project.id === selectedId}
                    tabIndex={project.id === selectedId ? 0 : -1}
                    onClick={() => setSelectedId(project.id)}
                    onFocus={() => setSelectedId(project.id)}
                    onKeyDown={(event) => selectByKeyboard(event, index)}
                    key={project.id}
                  >
                    <span className="snippet-list__title">{project.name}</span>
                    <span className="snippet-list__meta">
                      {project.archived_at ? "Archived · " : ""}
                      {itemCount(project)} {itemCount(project) === 1 ? "item" : "items"}
                    </span>
                  </button>
                ))}
              </div>
              {state.projects.some((project) => project.archived_at) && (
                <button
                  className="snippet-list__more"
                  type="button"
                  aria-pressed={showArchived}
                  onClick={() => setShowArchived((current) => !current)}
                >
                  {showArchived ? "Hide archived" : "Show archived"}
                </button>
              )}
            </div>
            {selected && (
              <article className="snippet-detail">
                <header className="snippet-detail__header">
                  <div>
                    <span className="snippet-detail__kind">
                      {selected.archived_at ? "Archived project" : "Project"}
                    </span>
                    <h3>{selected.name}</h3>
                  </div>
                  <div className="snippet-editor__actions">
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={busy}
                      onClick={() => openEditor(selected, `project-${selected.id}`)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={busy}
                      onClick={() => toggleArchive(selected)}
                    >
                      {selected.archived_at ? "Unarchive" : "Archive"}
                    </button>
                  </div>
                </header>
                {selected.description
                  ? <p className="snippet-detail__description">{selected.description}</p>
                  : <p className="snippet-detail__description">No description yet.</p>}

                <section className="snippet-detail__notes" aria-label="Move item into project">
                  <h4>Add item</h4>
                  <div className="snippet-heading__actions">
                    <label className="sr-only" htmlFor="project-move-select">
                      Item to move into {selected.name}
                    </label>
                    <select
                      id="project-move-select"
                      value={pendingMove}
                      disabled={busy || assignable.length === 0}
                      onChange={(event) => setPendingMove(event.target.value)}
                    >
                      <option value="">
                        {assignable.length === 0 ? "No items available" : "Select an item…"}
                      </option>
                      {assignable.map((item) => (
                        <option value={item.id} key={item.id}>{itemTitle(item)}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={busy || !pendingMove}
                      onClick={moveItemIn}
                    >
                      Move in
                    </button>
                  </div>
                </section>

                <section className="snippet-detail__notes" aria-label="Recent activity">
                  <h4>Recent activity</h4>
                  {projectItems.length === 0
                    ? <p className="snippet-detail__description">No items in this project yet.</p>
                    : (
                      <div className="snippet-list__items" role="list">
                        {projectItems.map((item) => (
                          <div className="clipboard-item-head" role="listitem" key={item.id}>
                            <span className="snippet-list__title">{itemTitle(item)}</span>
                            <span className="snippet-list__meta">
                              {item.kind} · <time dateTime={activityTime(item)}>
                                {formatDate(activityTime(item))}
                              </time>
                            </span>
                            <button
                              type="button"
                              className="button-secondary"
                              disabled={busy}
                              onClick={() => moveItemOut(item)}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                </section>
              </article>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

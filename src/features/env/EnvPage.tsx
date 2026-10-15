import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CommandError, commands } from "../../api/commands";
import type { EnvGroup, EnvVar, ImportEnvReport, Project } from "../../api/types";
import { Button } from "@/components/ui/button";
import { Toast, ToastAction } from "@/components/ui/toast";
import {
  EXPORT_FORMATS,
  formatEnv,
  formatEnvLine,
  isPortableKey,
  valueKind,
  type ExportFormat,
} from "../../lib/envFormat";
import { formatRelativeTime } from "../../lib/relativeTime";
import { cn } from "@/lib/utils";
import {
  ConfirmDeleteGroupDialog,
  EnvGroupDialog,
  EnvImportDialog,
  EnvVarDialog,
  commandMessage,
  fieldClass,
  type GroupDialogMode,
  type VarDialogMode,
} from "./EnvDialogs";

/** The set on screen, kept across visits to other pages in one session. */
let lastGroupId: string | null = null;

type Notice = { text: string; tone: "success" | "error"; undo?: EnvVar };

const iconClass = "size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]";
const icons = {
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  line: <path d="M5 8h4M5 12h14M5 16h9M13 8h6" />,
  edit: <path d="M14.5 5.5 18.5 9.5M4.5 19.5l1-4.5L15.8 4.7a1.4 1.4 0 0 1 2 0l1.5 1.5a1.4 1.4 0 0 1 0 2L9 18.5Z" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: <path d="M4 4l16 16M10.6 6A9.6 9.6 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-2.8 3.6M14 14.1A2.8 2.8 0 0 1 9.9 10M6.6 7.6A16.7 16.7 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 4.4-1.1" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  folder: <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z" />,
  key: (
    <>
      <circle cx="8" cy="15" r="3.5" />
      <path d="m10.5 12.5 8-8M15.5 7.5l2 2M13 10l1.5 1.5" />
    </>
  ),
};

function Icon({ name, className }: { name: keyof typeof icons; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn(iconClass, className)}>
      {icons[name]}
    </svg>
  );
}

function IconButton({ label, icon, onClick, danger, pressed }: { label: string; icon: keyof typeof icons; onClick: () => void; danger?: boolean; pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-8 min-h-0 shrink-0 place-items-center rounded-md p-0 text-[var(--text-muted)] transition-colors duration-100 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]",
        danger ? "hover:text-[var(--danger)]" : "hover:text-foreground",
      )}
    >
      <Icon name={icon} />
    </button>
  );
}

function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[5px] px-1.5 py-px text-[0.62rem] font-bold uppercase tracking-[0.05em]"
      style={{ color: tone, background: `color-mix(in srgb, ${tone} 13%, transparent)` }}
    >
      {children}
    </span>
  );
}

const chipClass =
  "inline-flex h-7 min-h-0 items-center rounded-full bg-card px-3 text-[0.78rem] text-[var(--text-secondary)] shadow-[var(--shadow-card)] transition-colors duration-100 hover:text-foreground disabled:pointer-events-none disabled:opacity-50";
/** The design's buttons are pills; the shared Button's radius is the default. */
const pillClass = "rounded-full px-4";

/** What a filter matches: key and note always, the value only when it is not
 *  secret - a filter that narrowed on a hidden value would leak it a letter
 *  at a time. */
function matches(variable: EnvVar, terms: string[]): boolean {
  const haystack = `${variable.key} ${variable.note ?? ""} ${variable.secret ? "" : variable.value}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

interface SetSection {
  /** The project's id, or null for the sets filed under none. */
  id: string | null;
  title: string;
  groups: EnvGroup[];
}

/** Sets under their projects, projects by name, unfiled sets last. A set whose
 *  project is not in the list (deleted elsewhere) counts as unfiled. */
function groupsByProject(groups: EnvGroup[], projects: Project[]): SetSection[] {
  const known = new Set(projects.map((project) => project.id));
  const byProject = new Map<string | null, EnvGroup[]>();
  for (const group of groups) {
    const key = group.project_id && known.has(group.project_id) ? group.project_id : null;
    byProject.set(key, [...(byProject.get(key) ?? []), group]);
  }
  const sections: SetSection[] = [...projects]
    .filter((project) => byProject.has(project.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map((project) => ({ id: project.id, title: project.name, groups: byProject.get(project.id) ?? [] }));
  const unfiled = byProject.get(null);
  if (unfiled) sections.push({ id: null, title: "No project", groups: unfiled });
  return sections;
}

/**
 * Environment variables, kept in named sets and copied back out in the shape
 * a tool expects. Values are any text - one word, a PEM key, a JSON document -
 * and a secret one is not in the DOM until it is revealed.
 */
export default function EnvPage() {
  const [groups, setGroups] = useState<EnvGroup[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [groupsFailed, setGroupsFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(lastGroupId);
  const [vars, setVars] = useState<EnvVar[] | null>(null);
  const [varsFailed, setVarsFailed] = useState(false);
  const [filter, setFilter] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [groupDialog, setGroupDialog] = useState<GroupDialogMode | null>(null);
  const [varDialog, setVarDialog] = useState<VarDialogMode | null>(null);
  const [importGroup, setImportGroup] = useState<EnvGroup | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<EnvGroup | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [undoing, setUndoing] = useState(false);
  // The set whose variables belong on screen. A slow answer for the set the
  // user just left must not overwrite the one they moved to.
  const shownGroup = useRef(selectedId);

  const selected = groups?.find((group) => group.id === selectedId) ?? null;

  const loadGroups = useCallback(async (prefer?: string | null) => {
    try {
      // Archived projects too: a set filed under one must still be named by it.
      const [list, projectList] = await Promise.all([
        commands.listEnvGroups(),
        commands.listProjects(true).catch(() => [] as Project[]),
      ]);
      const next = Array.isArray(list) ? list : [];
      setGroups(next);
      setProjects(Array.isArray(projectList) ? projectList : []);
      setGroupsFailed(false);
      setSelectedId((current) => {
        const wanted = prefer ?? current;
        return next.some((group) => group.id === wanted) ? wanted ?? null : next[0]?.id ?? null;
      });
    } catch {
      setGroupsFailed(true);
      setGroups((current) => current ?? []);
    }
  }, []);

  const loadVars = useCallback(async (groupId: string) => {
    try {
      const list = await commands.listEnvVars(groupId);
      if (shownGroup.current !== groupId) return;
      setVars(Array.isArray(list) ? list : []);
      setVarsFailed(false);
    } catch (reason) {
      if (shownGroup.current !== groupId) return;
      // The set went away underneath us; the list is what is out of date.
      if (reason instanceof CommandError && reason.code === "not_found") void loadGroups();
      else setVarsFailed(true);
      setVars([]);
    }
  }, [loadGroups]);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    lastGroupId = selectedId;
    shownGroup.current = selectedId;
    setFilter("");
    setRevealed(new Set());
    setVars(null);
    if (selectedId) void loadVars(selectedId);
  }, [selectedId, loadVars]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), notice.undo ? 6000 : 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  /** After a write: the variables of the set on screen, and the counts beside every set. */
  async function refresh() {
    await Promise.all([selectedId ? loadVars(selectedId) : Promise.resolve(), loadGroups()]);
  }

  async function copy(text: string, what: string) {
    try {
      await commands.copyText(text);
      setNotice({ text: `Copied ${what}`, tone: "success" });
    } catch {
      setNotice({ text: "Could not copy to the clipboard", tone: "error" });
    }
  }

  function copyValue(variable: EnvVar) {
    // The clipboard has no "empty" to hold; say so rather than report a failure.
    if (variable.value === "") setNotice({ text: `${variable.key} is empty; nothing to copy`, tone: "error" });
    else void copy(variable.value, variable.key);
  }

  function copySet(format: ExportFormat) {
    if (!selected || !vars?.length) return;
    const label = EXPORT_FORMATS.find((option) => option.value === format)?.label ?? format;
    // Shell cannot export every name; those lines are left out as comments.
    const leftOut = format === "shell" ? vars.filter((variable) => !isPortableKey(variable.key)).length : 0;
    const copied = vars.length - leftOut;
    void copy(
      formatEnv(vars, format),
      `${copied} ${copied === 1 ? "variable" : "variables"} as ${label}` +
        (leftOut ? `; ${leftOut} left out (not a shell name)` : ""),
    );
  }

  async function deleteVar(variable: EnvVar) {
    try {
      await commands.deleteEnvVar(variable.id);
      setNotice({ text: `Deleted ${variable.key}`, tone: "success", undo: variable });
      await refresh();
    } catch {
      setNotice({ text: `Could not delete ${variable.key}`, tone: "error" });
    }
  }

  async function undoDelete(variable: EnvVar) {
    setUndoing(true);
    try {
      await commands.restoreEnvVar(variable);
      setNotice({ text: `Restored ${variable.key}`, tone: "success" });
      await refresh();
    } catch (reason) {
      setNotice({ text: commandMessage(reason, `Could not restore ${variable.key}`), tone: "error" });
    } finally {
      setUndoing(false);
    }
  }

  async function confirmDeleteGroup(group: EnvGroup) {
    try {
      await commands.deleteEnvGroup(group.id);
      setDeleteGroup(null);
      setNotice({ text: `Deleted “${labelOf(group)}”`, tone: "success" });
      await loadGroups(null);
    } catch {
      setNotice({ text: "Could not delete the set", tone: "error" });
    }
  }

  function toggleReveal(id: string) {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function imported(report: ImportEnvReport) {
    const parts = [`${report.added} added`];
    if (report.updated) parts.push(`${report.updated} updated`);
    if (report.skipped) parts.push(`${report.skipped} kept`);
    setNotice({ text: `Imported: ${parts.join(", ")}`, tone: "success" });
    void refresh();
  }

  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const projectOf = (group: EnvGroup) => (group.project_id ? projectNames.get(group.project_id) ?? null : null);
  /** How a set is named outside the list: "acme-api · production". */
  const labelOf = (group: EnvGroup) => {
    const project = projectOf(group);
    return project ? `${project} · ${group.name}` : group.name;
  };
  const sections = useMemo(() => groupsByProject(groups ?? [], projects), [groups, projects]);

  const terms = useMemo(() => filter.trim().toLowerCase().split(/\s+/).filter(Boolean), [filter]);
  const shown = useMemo(() => (vars ?? []).filter((variable) => matches(variable, terms)), [vars, terms]);
  const secrets = (vars ?? []).filter((variable) => variable.secret);
  const allRevealed = secrets.length > 0 && secrets.every((variable) => revealed.has(variable.id));

  const newSet = () => setGroupDialog({ kind: "create", projectId: selected?.project_id ?? null });

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1240px] px-10 pb-9 pt-7 [overflow-wrap:anywhere] max-[56rem]:px-6 max-[31rem]:px-3 max-[31rem]:py-4">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-[40rem]">
          <p className="mb-1 text-[0.8rem] font-semibold text-[var(--accent-ink)]">Environment</p>
          <h2 className="m-0 font-display text-[clamp(1.9rem,4vw,2.4rem)] font-normal leading-[1.15]" id="workspace-title" tabIndex={-1}>
            Variables
          </h2>
          <p className="mt-2 text-[0.95rem] text-muted-foreground [text-wrap:pretty]">
            One set per place a project runs. Values can be a single word, a multi-line key or a whole JSON document, and copy back out as .env, JSON, Shell, PowerShell or YAML.
          </p>
        </div>
        <Button type="button" className={pillClass} onClick={newSet}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="fill-none stroke-current [stroke-linecap:round] [stroke-width:2.2]">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New set
        </Button>
      </header>

      {groupsFailed && (
        <p className="mb-4 text-xs text-destructive" role="alert">Could not load your variable sets. Close and reopen SnipDock to try again.</p>
      )}

      {groups === null ? (
        <p className="text-sm text-muted-foreground" role="status">Loading variables…</p>
      ) : groups.length === 0 ? (
        !groupsFailed && <NoSets onCreate={newSet} />
      ) : (
        <div className="flex min-w-0 flex-wrap items-start gap-5">
          <nav aria-label="Variable sets" className="flex min-w-0 max-w-full flex-[1_1_13rem] flex-col gap-4">
            {sections.map((section) => (
              <section key={section.id ?? "unfiled"} aria-label={section.title} className="flex min-w-0 flex-col gap-1">
                {/* Headed only when there is more than the one unfiled group. */}
                {(sections.length > 1 || section.id !== null) && (
                  <h3 className="m-0 flex items-center gap-2 px-3 text-[0.75rem] font-semibold text-[var(--text-muted)]">
                    <Icon name="folder" className="size-3.5" />
                    <span className="min-w-0 truncate">{section.title}</span>
                  </h3>
                )}
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0 max-[56rem]:flex-row max-[56rem]:flex-wrap max-[56rem]:gap-1.5">
                  {section.groups.map((group) => {
                    const current = group.id === selectedId;
                    return (
                      <li key={group.id} className="min-w-0">
                        <button
                          type="button"
                          aria-current={current ? "true" : undefined}
                          onClick={() => setSelectedId(group.id)}
                          className={cn(
                            "flex w-full min-w-0 items-center gap-2.5 rounded-[10px] px-3 py-2 text-left transition-colors duration-100 max-[56rem]:rounded-full max-[56rem]:py-1.5",
                            current
                              ? "bg-muted font-semibold text-foreground"
                              : "text-[var(--text-secondary)] hover:bg-muted hover:text-foreground max-[56rem]:bg-card max-[56rem]:shadow-[var(--shadow-card)]",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn("w-[3px] self-stretch rounded-full max-[56rem]:hidden", current ? "bg-[var(--accent)]" : "bg-transparent")}
                          />
                          <span className="min-w-0 flex-1 truncate text-[0.875rem]">{group.name}</span>
                          <span aria-hidden="true" className="shrink-0 font-mono text-[0.72rem] font-normal tabular-nums text-[var(--text-muted)]">
                            {group.var_count}
                          </span>
                          <span className="sr-only">, {group.var_count} {group.var_count === 1 ? "variable" : "variables"}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </nav>

          {selected && (
            <section aria-labelledby="env-set-title" className="min-w-0 flex-[999_1_40rem] overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)]">
              <header className="flex flex-wrap items-start justify-between gap-3 px-[22px] py-[18px]">
                <div className="min-w-0">
                  <p className="m-0 text-[0.75rem] font-semibold text-[var(--text-muted)]">{projectOf(selected) ?? "No project"}</p>
                  <h3 id="env-set-title" className="m-0 font-display text-[1.5rem] font-medium leading-tight">{selected.name}</h3>
                  <p className="mt-0.5 text-[0.8rem] leading-snug text-[var(--text-muted)]">
                    {[
                      selected.description,
                      `${selected.var_count} ${selected.var_count === 1 ? "variable" : "variables"}`,
                      selected.secret_count ? `${selected.secret_count} secret` : null,
                      `edited ${formatRelativeTime(selected.updated_at).toLowerCase()}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button type="button" size="sm" className={pillClass} onClick={() => setVarDialog({ kind: "create", groupId: selected.id })}>Add variable</Button>
                  <Button type="button" size="sm" variant="outline" className={pillClass} onClick={() => setImportGroup(selected)}>Import…</Button>
                  <Button type="button" size="sm" variant="ghost" className={pillClass} onClick={() => setGroupDialog({ kind: "edit", group: selected })}>Edit</Button>
                  <Button type="button" size="sm" variant="ghost" className={pillClass} onClick={() => setGroupDialog({ kind: "duplicate", group: selected })}>Duplicate</Button>
                  <Button type="button" size="sm" variant="ghost" className={cn(pillClass, "text-[var(--danger)]")} onClick={() => setDeleteGroup(selected)}>Delete</Button>
                </div>
              </header>

              {vars && vars.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-y border-border bg-background px-[22px] py-3">
                  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Copy the whole set as">
                    <span className="mr-1 text-[0.8rem] text-muted-foreground">Copy set as</span>
                    {EXPORT_FORMATS.map((format) => (
                      <button key={format.value} type="button" title={format.hint} className={chipClass} onClick={() => copySet(format.value)}>
                        {format.label}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex items-center gap-2 max-[40rem]:ml-0 max-[40rem]:w-full">
                    <input
                      type="search"
                      aria-label="Filter variables"
                      placeholder="Filter by key or value"
                      className={cn(fieldClass, "h-8 w-56 rounded-full bg-card py-1 max-[40rem]:w-full")}
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                    />
                    {secrets.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(pillClass, "bg-card")}
                        aria-pressed={allRevealed}
                        onClick={() => setRevealed(allRevealed ? new Set() : new Set(secrets.map((variable) => variable.id)))}
                      >
                        {allRevealed ? "Hide secrets" : "Reveal secrets"}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {varsFailed && <p className="m-0 px-[22px] py-4 text-xs text-destructive" role="alert">Could not load the variables in this set.</p>}
              {vars === null ? (
                <p className="m-0 px-[22px] py-6 text-sm text-muted-foreground" role="status">Loading…</p>
              ) : vars.length === 0 ? (
                !varsFailed && (
                  <EmptySet
                    onAdd={() => setVarDialog({ kind: "create", groupId: selected.id })}
                    onImport={() => setImportGroup(selected)}
                  />
                )
              ) : shown.length === 0 ? (
                <p className="m-0 px-[22px] py-8 text-center text-sm text-muted-foreground" role="status">
                  No variable matches “{filter.trim()}”.
                </p>
              ) : (
                <ul className="m-0 list-none p-0" aria-label={`Variables in ${labelOf(selected)}`}>
                  {shown.map((variable) => (
                    <VarRow
                      key={variable.id}
                      variable={variable}
                      revealed={revealed.has(variable.id)}
                      onToggleReveal={() => toggleReveal(variable.id)}
                      onCopyValue={() => copyValue(variable)}
                      onCopyLine={() => void copy(formatEnvLine(variable), `${variable.key}=…`)}
                      onEdit={() => setVarDialog({ kind: "edit", variable })}
                      onDelete={() => void deleteVar(variable)}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      <EnvGroupDialog
        mode={groupDialog}
        projects={projects}
        onOpenChange={(open) => { if (!open) setGroupDialog(null); }}
        onProjectCreated={(project) => setProjects((current) => [...current, project])}
        onSaved={(group) => {
          setNotice({ text: groupDialog?.kind === "edit" ? "Set saved" : `Created “${labelOf(group)}”`, tone: "success" });
          void loadGroups(group.id);
        }}
      />
      <EnvVarDialog
        mode={varDialog}
        onOpenChange={(open) => { if (!open) setVarDialog(null); }}
        onSaved={(variable, created) => {
          setNotice({ text: `${created ? "Added" : "Saved"} ${variable.key}`, tone: "success" });
          void refresh();
        }}
      />
      <EnvImportDialog
        group={importGroup}
        label={importGroup ? labelOf(importGroup) : ""}
        onOpenChange={(open) => { if (!open) setImportGroup(null); }}
        onImported={imported}
      />
      <ConfirmDeleteGroupDialog
        group={deleteGroup}
        label={deleteGroup ? labelOf(deleteGroup) : ""}
        onOpenChange={(open) => { if (!open) setDeleteGroup(null); }}
        onConfirm={confirmDeleteGroup}
      />

      {notice && (
        <Toast
          tone={notice.tone}
          action={
            notice.undo ? (
              <ToastAction disabled={undoing} onClick={() => { const variable = notice.undo; if (variable) void undoDelete(variable); }}>
                Undo
              </ToastAction>
            ) : undefined
          }
        >
          {notice.text}
        </Toast>
      )}
    </main>
  );
}

function VarRow({
  variable,
  revealed,
  onToggleReveal,
  onCopyValue,
  onCopyLine,
  onEdit,
  onDelete,
}: {
  variable: EnvVar;
  revealed: boolean;
  onToggleReveal: () => void;
  onCopyValue: () => void;
  onCopyLine: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const masked = variable.secret && !revealed;
  const kind = valueKind(variable.value);

  return (
    <li className="grid grid-cols-[minmax(9rem,15rem)_minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1.5 border-b border-border/60 px-[18px] py-3 last:border-b-0 max-[44rem]:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0 max-[44rem]:col-start-1">
        <div className="break-all font-mono text-[0.8rem] font-semibold text-foreground">{variable.key}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {variable.secret && (
            <Badge tone="var(--type-secret)">
              <Icon name="lock" className="size-2.5 [stroke-width:2.6]" />
              Secret
            </Badge>
          )}
          {kind === "json" && <Badge tone="var(--type-json)">JSON</Badge>}
          {kind === "multiline" && <Badge tone="var(--type-config)">{variable.value.split("\n").length} lines</Badge>}
          {!isPortableKey(variable.key) && (
            <span title="Shells cannot export this name" className="inline-flex">
              <Badge tone="var(--warning)">Not portable</Badge>
            </span>
          )}
        </div>
      </div>

      <div className="min-w-0 max-[44rem]:col-span-2 max-[44rem]:row-start-2">
        {masked ? (
          // Nothing of the value is drawn until it is revealed.
          <span className="font-mono text-[0.8rem] tracking-[0.2em] text-[var(--text-muted)]">
            <span aria-hidden="true">••••••••••</span>
            <span className="sr-only">Hidden value</span>
          </span>
        ) : kind === "empty" ? (
          <span className="text-[0.78rem] italic text-[var(--text-muted)]">Empty</span>
        ) : (
          <pre className="m-0 line-clamp-4 whitespace-pre-wrap break-all font-mono text-[0.78rem] leading-relaxed text-[var(--text-secondary)]">
            {variable.value}
          </pre>
        )}
        {variable.note && <p className="mt-1 text-[0.72rem] text-[var(--text-muted)]">{variable.note}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 max-[44rem]:col-start-2 max-[44rem]:row-start-1">
        {variable.secret && (
          <IconButton
            label={revealed ? `Hide ${variable.key}` : `Reveal ${variable.key}`}
            icon={revealed ? "eyeOff" : "eye"}
            pressed={revealed}
            onClick={onToggleReveal}
          />
        )}
        <IconButton label={`Copy value of ${variable.key}`} icon="copy" onClick={onCopyValue} />
        <IconButton label={`Copy ${variable.key} as KEY=value`} icon="line" onClick={onCopyLine} />
        <IconButton label={`Edit ${variable.key}`} icon="edit" onClick={onEdit} />
        <IconButton label={`Delete ${variable.key}`} icon="trash" danger onClick={onDelete} />
      </div>
    </li>
  );
}

function NoSets({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="grid max-w-[34rem] justify-items-start gap-3 rounded-lg border border-dashed border-border bg-card p-6">
      <span aria-hidden="true" className="grid size-10 place-items-center rounded-lg" style={{ color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 13%, transparent)" }}>
        <Icon name="key" className="size-5" />
      </span>
      <h3 className="m-0 text-base font-semibold">No variable sets yet</h3>
      <p className="m-0 text-sm text-muted-foreground">
        Make a set for each project or deploy target, then add variables one at a time or import a whole .env file or JSON object.
        Secret values stay masked until you reveal them, and copying one never adds it to your clipboard history.
      </p>
      <Button type="button" onClick={onCreate}>Create your first set</Button>
    </div>
  );
}

function EmptySet({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  return (
    <div className="grid justify-items-center gap-2 px-[18px] py-10 text-center">
      <p className="m-0 text-sm font-semibold text-foreground">This set is empty</p>
      <p className="m-0 max-w-[26rem] text-[0.8rem] text-muted-foreground">Add a variable by hand, or paste a .env file or JSON object to bring them all in at once.</p>
      <div className="mt-2 flex gap-2">
        <Button type="button" size="sm" onClick={onAdd}>Add variable</Button>
        <Button type="button" size="sm" variant="outline" onClick={onImport}>Import .env or JSON</Button>
      </div>
    </div>
  );
}

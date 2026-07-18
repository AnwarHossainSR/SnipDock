import { useEffect, useState } from "react";
import { commands } from "../../lib/commands";
import type { Category, Tag } from "../../lib/types";

const DEFAULT_COLOR = "#1d4ed8";

type PanelState =
  | { status: "loading"; categories: Category[]; tags: Tag[] }
  | { status: "ready"; categories: Category[]; tags: Tag[] }
  | { status: "error"; categories: Category[]; tags: Tag[] };

function sortCategories(categories: Category[]) {
  return [...categories].sort((a, b) => a.name.localeCompare(b.name));
}

function sortTags(tags: Tag[]) {
  return [...tags].sort(
    (a, b) => b.usage_count - a.usage_count || a.name.localeCompare(b.name),
  );
}

export default function TagsPanel() {
  const [state, setState] = useState<PanelState>({
    status: "loading",
    categories: [],
    tags: [],
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [newCategory, setNewCategory] = useState("");
  const [categoryEdit, setCategoryEdit] = useState<{ id: string; name: string } | null>(null);

  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(DEFAULT_COLOR);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [tagEdit, setTagEdit] = useState<{ name: string; color: string }>({
    name: "",
    color: DEFAULT_COLOR,
  });
  const [mergeTargetId, setMergeTargetId] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([commands.listCategories(), commands.listTags()]).then(
      ([categories, tags]) => {
        if (!active) return;
        setState({
          status: "ready",
          categories: sortCategories(categories),
          tags: sortTags(tags),
        });
      },
      () => {
        if (active) setState({ status: "error", categories: [], tags: [] });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const selectedTag = state.tags.find((tag) => tag.id === selectedTagId) ?? null;
  const mergeCandidates = state.tags.filter((tag) => tag.id !== selectedTagId);

  async function runAction<T>(command: () => Promise<T>, apply: (result: T) => void) {
    setBusy(true);
    setError("");
    try {
      apply(await command());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not complete that action.");
    } finally {
      setBusy(false);
    }
  }

  function upsertCategory(category: Category) {
    setState((current) => ({
      ...current,
      categories: sortCategories([
        ...current.categories.filter((entry) => entry.id !== category.id),
        category,
      ]),
    }));
  }

  function upsertTag(tag: Tag) {
    setState((current) => ({
      ...current,
      tags: sortTags([...current.tags.filter((entry) => entry.id !== tag.id), tag]),
    }));
  }

  function createCategory() {
    if (!newCategory.trim()) return;
    void runAction(
      () => commands.saveCategory({ id: null, name: newCategory }),
      (category) => {
        upsertCategory(category);
        setNewCategory("");
        setMessage(`Added category “${category.name}”.`);
      },
    );
  }

  function renameCategory() {
    if (!categoryEdit || !categoryEdit.name.trim()) return;
    const edit = categoryEdit;
    void runAction(
      () => commands.saveCategory({ id: edit.id, name: edit.name }),
      (category) => {
        upsertCategory(category);
        setCategoryEdit(null);
        setMessage(`Renamed category to “${category.name}”.`);
      },
    );
  }

  function createTag() {
    if (!newTagName.trim()) return;
    void runAction(
      () => commands.saveTag({ id: null, name: newTagName, color: newTagColor }),
      (tag) => {
        upsertTag(tag);
        setNewTagName("");
        setNewTagColor(DEFAULT_COLOR);
        setMessage(`Added tag “${tag.name}”.`);
      },
    );
  }

  function selectTag(tag: Tag) {
    setSelectedTagId(tag.id);
    setTagEdit({ name: tag.name, color: tag.color });
    setMergeTargetId("");
  }

  function saveTagEdit() {
    if (!selectedTag || !tagEdit.name.trim()) return;
    const id = selectedTag.id;
    void runAction(
      () => commands.saveTag({ id, name: tagEdit.name, color: tagEdit.color }),
      (tag) => {
        upsertTag(tag);
        setMessage(`Updated tag “${tag.name}”.`);
      },
    );
  }

  function mergeSelectedTag() {
    if (!selectedTag || !mergeTargetId) return;
    const sourceId = selectedTag.id;
    const targetId = mergeTargetId;
    void runAction(
      () => commands.mergeTags(sourceId, targetId),
      (tag) => {
        setState((current) => ({
          ...current,
          tags: sortTags([
            ...current.tags.filter(
              (entry) => entry.id !== sourceId && entry.id !== tag.id,
            ),
            tag,
          ]),
        }));
        setSelectedTagId(tag.id);
        setTagEdit({ name: tag.name, color: tag.color });
        setMergeTargetId("");
        setMessage(`Merged into “${tag.name}”.`);
      },
    );
  }

  return (
    <main className="workspace-content">
      <header className="content-heading">
        <div>
          <p>Organization</p>
          <h2 id="workspace-title" tabIndex={-1}>Categories and tags</h2>
        </div>
      </header>
      <div className="sr-only" aria-live="polite">{message}</div>
      {error && <p className="action-error" role="alert">{error}</p>}

      {state.status === "loading" && (
        <div className="content-state" role="status" aria-busy="true">
          <span className="loading-ring" aria-hidden="true" />
          <p>Loading organization...</p>
        </div>
      )}
      {state.status === "error" && (
        <div className="content-state" role="alert">
          <span className="state-mark" aria-hidden="true">!</span>
          <div>
            <h3>Organization unavailable</h3>
            <p>Close and reopen SnipDock to try again.</p>
          </div>
        </div>
      )}

      {state.status === "ready" && (
        <div className="snippet-layout">
          <section className="snippet-detail" aria-labelledby="categories-title">
            <header className="snippet-detail__header">
              <div>
                <span className="snippet-detail__kind">Categories</span>
                <h3 id="categories-title">{state.categories.length} total</h3>
              </div>
            </header>

            <div className="snippet-editor__field">
              <span>New category</span>
              <div className="snippet-heading__actions">
                <label className="sr-only" htmlFor="new-category">Category name</label>
                <input
                  id="new-category"
                  value={newCategory}
                  disabled={busy}
                  onChange={(event) => setNewCategory(event.target.value)}
                />
                <button
                  type="button"
                  className="button-secondary"
                  disabled={busy || !newCategory.trim()}
                  onClick={createCategory}
                >
                  Add category
                </button>
              </div>
            </div>

            <div className="snippet-list__items" role="list" aria-label="Categories">
              {state.categories.map((category) => (
                <div className="clipboard-item-head" role="listitem" key={category.id}>
                  {categoryEdit?.id === category.id
                    ? (
                      <>
                        <label className="sr-only" htmlFor={`category-${category.id}`}>
                          Rename category
                        </label>
                        <input
                          id={`category-${category.id}`}
                          value={categoryEdit.name}
                          disabled={busy}
                          onChange={(event) =>
                            setCategoryEdit({ id: category.id, name: event.target.value })}
                        />
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={busy || !categoryEdit.name.trim()}
                          onClick={renameCategory}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={busy}
                          onClick={() => setCategoryEdit(null)}
                        >
                          Cancel
                        </button>
                      </>
                    )
                    : (
                      <>
                        <span className="snippet-list__title">{category.name}</span>
                        <span className="snippet-list__meta">
                          {category.built_in ? "Built-in" : "Custom"}
                        </span>
                        {!category.built_in && (
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={busy}
                            onClick={() =>
                              setCategoryEdit({ id: category.id, name: category.name })}
                          >
                            Rename
                          </button>
                        )}
                      </>
                    )}
                </div>
              ))}
            </div>
          </section>

          <section className="snippet-detail" aria-labelledby="tags-title">
            <header className="snippet-detail__header">
              <div>
                <span className="snippet-detail__kind">Tags</span>
                <h3 id="tags-title">{state.tags.length} total</h3>
              </div>
            </header>

            <div className="snippet-editor__field">
              <span>New tag</span>
              <div className="snippet-heading__actions">
                <label className="sr-only" htmlFor="new-tag-name">New tag name</label>
                <input
                  id="new-tag-name"
                  value={newTagName}
                  disabled={busy}
                  onChange={(event) => setNewTagName(event.target.value)}
                />
                <label className="sr-only" htmlFor="new-tag-color">New tag color</label>
                <input
                  id="new-tag-color"
                  type="color"
                  value={newTagColor}
                  disabled={busy}
                  onChange={(event) => setNewTagColor(event.target.value)}
                />
                <button
                  type="button"
                  className="button-secondary"
                  disabled={busy || !newTagName.trim()}
                  onClick={createTag}
                >
                  Add tag
                </button>
              </div>
            </div>

            {state.tags.length === 0
              ? <p className="snippet-detail__description">No tags yet.</p>
              : (
                <div className="snippet-list__items" role="listbox" aria-label="Tags">
                  {state.tags.map((tag) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={tag.id === selectedTagId}
                      className="snippet-list__item"
                      disabled={busy}
                      onClick={() => selectTag(tag)}
                      key={tag.id}
                    >
                      <span className="snippet-list__title">
                        <span
                          aria-hidden="true"
                          style={{
                            display: "inline-block",
                            width: "0.7rem",
                            height: "0.7rem",
                            borderRadius: "50%",
                            marginRight: "0.5rem",
                            background: tag.color,
                          }}
                        />
                        {tag.name}
                      </span>
                      <span className="snippet-list__meta">
                        Used {tag.usage_count} {tag.usage_count === 1 ? "time" : "times"}
                      </span>
                    </button>
                  ))}
                </div>
              )}

            {selectedTag && (
              <section className="snippet-detail__notes" aria-label="Edit tag">
                <h4>Edit “{selectedTag.name}”</h4>
                <div className="snippet-editor__field">
                  <label className="sr-only" htmlFor="tag-edit-name">Tag name</label>
                  <div className="snippet-heading__actions">
                    <input
                      id="tag-edit-name"
                      value={tagEdit.name}
                      disabled={busy}
                      onChange={(event) =>
                        setTagEdit((current) => ({ ...current, name: event.target.value }))}
                    />
                    <label className="sr-only" htmlFor="tag-edit-color">Tag color</label>
                    <input
                      id="tag-edit-color"
                      type="color"
                      value={tagEdit.color}
                      disabled={busy}
                      onChange={(event) =>
                        setTagEdit((current) => ({ ...current, color: event.target.value }))}
                    />
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={busy || !tagEdit.name.trim()}
                      onClick={saveTagEdit}
                    >
                      Save tag
                    </button>
                  </div>
                </div>

                <div className="snippet-editor__field">
                  <span>Merge into</span>
                  <div className="snippet-heading__actions">
                    <label className="sr-only" htmlFor="tag-merge-target">Merge target</label>
                    <select
                      id="tag-merge-target"
                      value={mergeTargetId}
                      disabled={busy || mergeCandidates.length === 0}
                      onChange={(event) => setMergeTargetId(event.target.value)}
                    >
                      <option value="">
                        {mergeCandidates.length === 0 ? "No other tags" : "Select a tag…"}
                      </option>
                      {mergeCandidates.map((tag) => (
                        <option value={tag.id} key={tag.id}>{tag.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={busy || !mergeTargetId}
                      onClick={mergeSelectedTag}
                    >
                      Merge
                    </button>
                  </div>
                </div>
              </section>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

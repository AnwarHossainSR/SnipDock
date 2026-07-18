import type { Category, ContentType, Id, ItemKind, Project, SortOrder, Tag } from "../../lib/types";
import type { LibraryFilters } from "./useLibraryQuery";

const KIND_LABELS: Record<ItemKind, string> = {
  clipboard: "Clipboard",
  snippet: "Snippet",
  command: "Command",
  template: "Template",
  note: "Note",
};

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  plain_text: "Plain text",
  code: "Code",
  json: "JSON",
  sql: "SQL",
  html: "HTML",
  css: "CSS",
  xml: "XML",
  shell: "Shell",
  markdown: "Markdown",
  config: "Config",
};

const SORT_LABELS: Record<SortOrder, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  most_used: "Most used",
};

interface FilterPanelProps {
  filters: LibraryFilters;
  sort: SortOrder;
  projects: Project[];
  categories: Category[];
  tags: Tag[];
  onFiltersChange: (update: Partial<LibraryFilters>) => void;
  onSortChange: (sort: SortOrder) => void;
  onClear: () => void;
}

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

function findName(list: { id: Id; name: string }[], id: Id) {
  return list.find((entry) => entry.id === id)?.name ?? id;
}

function toDateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export default function FilterPanel(props: FilterPanelProps) {
  const { filters, sort, projects, categories, tags, onFiltersChange, onSortChange, onClear } =
    props;

  const chips: Chip[] = [];
  for (const kind of filters.kinds) {
    chips.push({
      key: `kind-${kind}`,
      label: `Kind: ${KIND_LABELS[kind]}`,
      onRemove: () => onFiltersChange({ kinds: filters.kinds.filter((entry) => entry !== kind) }),
    });
  }
  for (const contentType of filters.contentTypes) {
    chips.push({
      key: `content-type-${contentType}`,
      label: `Type: ${CONTENT_TYPE_LABELS[contentType]}`,
      onRemove: () =>
        onFiltersChange({
          contentTypes: filters.contentTypes.filter((entry) => entry !== contentType),
        }),
    });
  }
  for (const projectId of filters.projectIds) {
    chips.push({
      key: `project-${projectId}`,
      label: `Project: ${findName(projects, projectId)}`,
      onRemove: () =>
        onFiltersChange({
          projectIds: filters.projectIds.filter((entry) => entry !== projectId),
        }),
    });
  }
  for (const categoryId of filters.categoryIds) {
    chips.push({
      key: `category-${categoryId}`,
      label: `Category: ${findName(categories, categoryId)}`,
      onRemove: () =>
        onFiltersChange({
          categoryIds: filters.categoryIds.filter((entry) => entry !== categoryId),
        }),
    });
  }
  for (const tagId of filters.tagIds) {
    chips.push({
      key: `tag-${tagId}`,
      label: `Tag: ${findName(tags, tagId)}`,
      onRemove: () => onFiltersChange({ tagIds: filters.tagIds.filter((entry) => entry !== tagId) }),
    });
  }
  if (filters.pinned) {
    chips.push({
      key: "pinned",
      label: "Pinned only",
      onRemove: () => onFiltersChange({ pinned: null }),
    });
  }
  if (filters.favorite) {
    chips.push({
      key: "favorite",
      label: "Favorites only",
      onRemove: () => onFiltersChange({ favorite: null }),
    });
  }
  if (filters.createdFrom) {
    chips.push({
      key: "created-from",
      label: `From ${toDateInputValue(filters.createdFrom)}`,
      onRemove: () => onFiltersChange({ createdFrom: null }),
    });
  }
  if (filters.createdTo) {
    chips.push({
      key: "created-to",
      label: `To ${toDateInputValue(filters.createdTo)}`,
      onRemove: () => onFiltersChange({ createdTo: null }),
    });
  }

  return (
    <section className="snippet-editor__field" aria-label="Filters">
      <div className="snippet-heading__actions">
        <label className="sr-only" htmlFor="filter-kind">Kind</label>
        <select
          id="filter-kind"
          value={filters.kinds[0] ?? ""}
          onChange={(event) =>
            onFiltersChange({ kinds: event.target.value ? [event.target.value as ItemKind] : [] })}
        >
          <option value="">All kinds</option>
          {(Object.keys(KIND_LABELS) as ItemKind[]).map((kind) => (
            <option value={kind} key={kind}>{KIND_LABELS[kind]}</option>
          ))}
        </select>

        <label className="sr-only" htmlFor="filter-content-type">Content type</label>
        <select
          id="filter-content-type"
          value={filters.contentTypes[0] ?? ""}
          onChange={(event) =>
            onFiltersChange({
              contentTypes: event.target.value ? [event.target.value as ContentType] : [],
            })}
        >
          <option value="">All types</option>
          {(Object.keys(CONTENT_TYPE_LABELS) as ContentType[]).map((contentType) => (
            <option value={contentType} key={contentType}>{CONTENT_TYPE_LABELS[contentType]}</option>
          ))}
        </select>

        <label className="sr-only" htmlFor="filter-project">Project</label>
        <select
          id="filter-project"
          value={filters.projectIds[0] ?? ""}
          onChange={(event) =>
            onFiltersChange({ projectIds: event.target.value ? [event.target.value] : [] })}
        >
          <option value="">All projects</option>
          {projects.map((project) => (
            <option value={project.id} key={project.id}>{project.name}</option>
          ))}
        </select>

        <label className="sr-only" htmlFor="filter-category">Category</label>
        <select
          id="filter-category"
          value={filters.categoryIds[0] ?? ""}
          onChange={(event) =>
            onFiltersChange({ categoryIds: event.target.value ? [event.target.value] : [] })}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option value={category.id} key={category.id}>{category.name}</option>
          ))}
        </select>

        <label className="sr-only" htmlFor="filter-tag">Tag</label>
        <select
          id="filter-tag"
          value={filters.tagIds[0] ?? ""}
          onChange={(event) =>
            onFiltersChange({ tagIds: event.target.value ? [event.target.value] : [] })}
        >
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option value={tag.id} key={tag.id}>{tag.name}</option>
          ))}
        </select>

        <label htmlFor="filter-pinned">
          <input
            id="filter-pinned"
            type="checkbox"
            checked={filters.pinned === true}
            onChange={(event) => onFiltersChange({ pinned: event.target.checked ? true : null })}
          />
          {" "}Pinned only
        </label>

        <label htmlFor="filter-favorite">
          <input
            id="filter-favorite"
            type="checkbox"
            checked={filters.favorite === true}
            onChange={(event) => onFiltersChange({ favorite: event.target.checked ? true : null })}
          />
          {" "}Favorites only
        </label>

        <label className="sr-only" htmlFor="filter-created-from">Created from</label>
        <input
          id="filter-created-from"
          type="date"
          value={toDateInputValue(filters.createdFrom)}
          onChange={(event) =>
            onFiltersChange({
              createdFrom: event.target.value ? `${event.target.value}T00:00:00Z` : null,
            })}
        />

        <label className="sr-only" htmlFor="filter-created-to">Created to</label>
        <input
          id="filter-created-to"
          type="date"
          value={toDateInputValue(filters.createdTo)}
          onChange={(event) =>
            onFiltersChange({
              createdTo: event.target.value ? `${event.target.value}T23:59:59Z` : null,
            })}
        />

        <label className="sr-only" htmlFor="filter-sort">Sort</label>
        <select
          id="filter-sort"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortOrder)}
        >
          {(Object.keys(SORT_LABELS) as SortOrder[]).map((order) => (
            <option value={order} key={order}>{SORT_LABELS[order]}</option>
          ))}
        </select>
      </div>

      {chips.length > 0 && (
        <div className="snippet-heading__actions" aria-label="Active filters">
          {chips.map((chip) => (
            <button
              type="button"
              className="button-secondary"
              onClick={chip.onRemove}
              key={chip.key}
            >
              {chip.label} ×
            </button>
          ))}
          <button type="button" className="button-secondary" onClick={onClear}>
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
}

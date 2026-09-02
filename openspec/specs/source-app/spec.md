# source-app Specification

## Purpose

Defines how the foreground executable name is captured with each stored clipboard item, persisted, surfaced in the existing row metadata and Details tab, and exposed as a search/sidebar facet.

## Requirements


### Requirement: Source application is captured and stored per item

The capture path SHALL resolve the foreground executable name before the item is inserted into storage and store it as part of the item's record. Items already in storage at the time the change ships SHALL be stored with the field unset; the value MUST NOT be derived by walking the process list at read time.

#### Scenario: A text copy from VS Code

- **WHEN** the user copies text while VS Code is the foreground application and the application is not in the per-app ignore list
- **THEN** the stored item's `source_app` is the executable name resolved by `foreground_executable_name()` (for example `Code.exe` on Windows, `Code` on macOS, `code` on Linux), and the value is present in the `clipboard://captured` event payload

#### Scenario: An ignored-app copy

- **WHEN** the user copies text while the foreground executable is in `Settings.ignored_apps`
- **THEN** no item is stored and no `source_app` value is produced (the ignore filter runs first)

#### Scenario: An image capture

- **WHEN** an image is captured from the clipboard
- **THEN** the stored image item has the same `source_app` resolution as a text capture, populated by the same code path

#### Scenario: A manually-saved item

- **WHEN** the user saves an item by hand through `save_manual_item`
- **THEN** the stored item's `source_app` is `null` (manually-saved items have no source application)

### Requirement: Source application renders in the Details tab and row metadata

The Details tab on the right rail SHALL show the item's `source_app` when it is set, alongside the metadata the tab already shows. The row metadata line SHALL include the source-app segment, as the layout spec's existing scenario already contemplates but defers.

#### Scenario: Details tab with a source

- **WHEN** a stored item has `source_app = "Code.exe"`
- **THEN** the Details tab shows a "Source" row whose value is `Code.exe`

#### Scenario: Details tab without a source

- **WHEN** a stored item has `source_app = null`
- **THEN** the Details tab omits the "Source" row rather than rendering an empty placeholder

#### Scenario: Row metadata line includes the source

- **WHEN** a stored item with a text content type and `source_app = "Code.exe"` is rendered in the Clipboard list
- **THEN** the row's metadata line includes `Code.exe` as one of its segments, alongside the existing line-count segment

### Requirement: Source application is a search facet

The search query SHALL accept an optional list of `source_apps` and restrict the result set to items whose `source_app` matches any entry in that list. An empty or unset list SHALL NOT filter on source.

#### Scenario: Source-app filter narrows results

- **WHEN** the search is issued with `source_apps: ["Code.exe"]`
- **THEN** the result set contains only items whose `source_app` is `Code.exe`, and items with `source_app = null` or any other value are excluded

#### Scenario: Source-app filter absent

- **WHEN** the search is issued without a `source_apps` field
- **THEN** source-app is not part of the filter and items from any source are returned

#### Scenario: Multiple source-app values

- **WHEN** the search is issued with `source_apps: ["Code.exe", "firefox"]`
- **THEN** the result set contains items whose `source_app` is either `Code.exe` or `firefox`, and no other source

### Requirement: Sources section in the sidebar

The sidebar SHALL show a "Sources" section listing distinct `source_app` values present in storage, each with the count of items that have that source. Selecting an entry filters the Clipboard screen to that source. Items with `source_app = null` SHALL be listed as "Unknown source" so they remain reachable.

#### Scenario: Sources populate from stored items

- **WHEN** the sidebar is rendered and storage holds 12 items with `Code.exe`, 8 with `firefox`, and 3 with `null`
- **THEN** the Sources section lists `Code.exe (12)`, `firefox (8)`, and `Unknown source (3)` in descending count order

#### Scenario: Selecting a source opens the filtered Clipboard screen

- **WHEN** the user activates the `Code.exe (12)` entry in the Sources section
- **THEN** the Clipboard screen is shown with the `source_apps` filter set to `["Code.exe"]`, the rows are the 12 matching items, and the right rail's first row is selected

#### Scenario: Sources section with no items

- **WHEN** storage holds no items (the user has just installed the app)
- **THEN** the Sources section still renders with an empty-state message rather than disappearing

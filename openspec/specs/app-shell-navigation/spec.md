# app-shell-navigation Specification

## Purpose

Defines the populated state of the app sidebar: the real destination list (Clipboard and Settings only), pinned items, capture status, storage meter, and version line, replacing the current two-item list with a large empty void beneath it.

## Requirements

### Requirement: Destination list with number-key badges
The sidebar SHALL show each existing destination (Clipboard, Settings) with a badge indicating its number-key shortcut, if such a shortcut exists and is documented; destinations with no documented number-key shortcut SHALL NOT show an invented badge.

#### Scenario: Destination badge matches a real shortcut
- **WHEN** a documented number-key shortcut exists for switching to a destination
- **THEN** that destination's sidebar entry shows the matching badge

#### Scenario: No badge is invented for undocumented shortcuts
- **WHEN** no number-key shortcut is documented for a destination
- **THEN** that destination's sidebar entry shows no number badge

### Requirement: Pinned items section
The sidebar SHALL show a "Pinned" section listing items the user has pinned, below the destination list.

#### Scenario: Pinning an item surfaces it in the sidebar
- **WHEN** the user pins a clipboard item
- **THEN** that item appears in the sidebar's Pinned section

#### Scenario: Unpinning removes it from the sidebar
- **WHEN** the user unpins an item that was shown in the sidebar's Pinned section
- **THEN** that item no longer appears there

#### Scenario: No pinned items shows an empty state, not a missing section
- **WHEN** the user has no pinned items
- **THEN** the Pinned section still renders with an empty-state message rather than disappearing

#### Scenario: Selecting a pinned entry opens that item
- **WHEN** the user activates an entry in the sidebar's Pinned section
- **THEN** the Clipboard screen is shown (leaving any active search), that item is selected and scrolled into view, and its content appears in the right rail
- **AND** when the item is not among the loaded rows, the Clipboard screen switches to the Pinned filter so the item can be reached

### Requirement: Sources section
The sidebar SHALL show a "Sources" section listing distinct `source_app` values present in storage, each with the count of items that have that source. Items with `source_app = null` SHALL be listed as "Unknown source" so they remain reachable. Selecting that entry sends the empty string in `SearchQuery.source_apps` (the field stays `Vec<String>`; the store holds it as the `__unknown__` sentinel and maps it on the way out), and the backend matches that entry as `source_app IS NULL`. No executable name is empty, so the sentinel cannot collide with a real source, and it combines with named sources in the same list. The section follows the same empty-state, label-truncation, and selection rules as the existing Pinned section.

#### Scenario: Sources populate from stored items
- **WHEN** the sidebar is rendered and storage holds 12 items with `Code.exe`, 8 with `firefox`, and 3 with `null`
- **THEN** the Sources section lists `Code.exe (12)`, `firefox (8)`, and `Unknown source (3)` in descending count order, truncating labels that overflow the sidebar width

#### Scenario: Storage holds no items at all
- **WHEN** storage holds no items
- **THEN** the Sources section still renders with an empty-state message rather than disappearing (with items present but none carrying a `source_app`, the section lists the `Unknown source` row instead)

#### Scenario: Selecting a source entry filters the Clipboard screen
- **WHEN** the user activates the `Code.exe (12)` entry in the Sources section
- **THEN** the Clipboard screen is shown with the `source_apps` filter set to `["Code.exe"]`, the rows are the matching items, and the right rail's first row is selected

### Requirement: Sidebar contains its own content
The sidebar SHALL keep its content within its own width, regardless of the length of a pinned item's text.

#### Scenario: A long pinned label does not spill into the workspace
- **WHEN** a pinned item's content is longer than the sidebar is wide
- **THEN** its label is truncated inside the sidebar and neither widens the sidebar nor overlaps the workspace beside it

### Requirement: Capture status indicator
The sidebar SHALL show whether clipboard capture is currently active ("Capturing") or paused ("Paused"), alongside the shortcut used to toggle it, sourced from the actual toggle shortcut rather than an invented one.

#### Scenario: Status reflects live capture state
- **WHEN** clipboard tracking is toggled (via `set_clipboard_tracking` or equivalent existing mechanism)
- **THEN** the sidebar's capture status indicator updates to match ("Capturing" or "Paused") without requiring a page reload

### Requirement: Storage meter
The sidebar SHALL show a storage usage meter reflecting on-disk usage, sourced from the existing storage-size command.

#### Scenario: Storage meter reflects current usage
- **WHEN** the sidebar is rendered
- **THEN** the storage meter's value matches the size reported by `storage_info::get_storage_size` (or its frontend equivalent) at time of render

### Requirement: Resource usage readout
The sidebar SHALL show what SnipDock itself is costing the machine: memory, the number of OS processes it is running, and CPU. The figures MUST cover the application's whole process tree, since the Rust binary and the platform webview's helpers are separate processes and reporting only one of them would understate the real cost. A CPU figure MUST NOT be shown before a reading exists that it can be measured against.

#### Scenario: Readout covers the webview as well as the main process
- **WHEN** SnipDock is running as a main process plus webview helpers
- **THEN** the memory figure is the sum across those processes and the process count includes all of them

#### Scenario: CPU is withheld until it can be measured
- **WHEN** the first reading is taken, with no earlier reading to compare against
- **THEN** the memory and process figures are shown and no CPU figure appears, rather than a zero that reads as "idle"

#### Scenario: Readout follows usage while the window is open
- **WHEN** the window is visible and time passes
- **THEN** the figures are re-read periodically without the user asking

### Requirement: Version line
The sidebar SHALL show the application's current version.

#### Scenario: Version line matches the installed build
- **WHEN** the sidebar is rendered
- **THEN** the displayed version string matches the application's actual package/build version

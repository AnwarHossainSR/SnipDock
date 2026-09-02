## Purpose

See the `app-shell-navigation` spec for the full sidebar requirements. This delta extends the sidebar's structure with a "Sources" section, parallel to the existing "Pinned" section.

## MODIFIED Requirements

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
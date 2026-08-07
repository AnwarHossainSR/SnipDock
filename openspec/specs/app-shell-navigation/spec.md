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

### Requirement: Version line
The sidebar SHALL show the application's current version.

#### Scenario: Version line matches the installed build
- **WHEN** the sidebar is rendered
- **THEN** the displayed version string matches the application's actual package/build version

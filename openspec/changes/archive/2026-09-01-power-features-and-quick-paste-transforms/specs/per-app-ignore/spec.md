## Purpose

Defines the Settings editor for the existing `Settings.ignored_apps` list, including the "add currently focused app" action that reads the foreground executable once and appends it.

## ADDED Requirements

### Requirement: Ignored apps panel lists the current entries

The Settings screen SHALL expose an "Ignored apps" panel that lists every entry in `Settings.ignored_apps`. Each entry shows the raw executable string as captured at the ignore-time of the app, and a remove action.

#### Scenario: Panel reflects the persisted list

- **WHEN** the user opens Settings and `Settings.ignored_apps` contains `["Code.exe", "firefox"]`
- **THEN** the Ignored apps panel shows two rows, one for `Code.exe` and one for `firefox`, each with a remove action

#### Scenario: Empty list shows an empty state

- **WHEN** the user opens Settings and `Settings.ignored_apps` is empty
- **THEN** the Ignored apps panel shows an empty-state message naming what the list is, and an "Add app" affordance

### Requirement: Add app by executable name

The panel SHALL allow the user to add an entry by typing the executable name. The field commits on blur or `Enter`, validates that the value is non-empty, and persists through the existing `SettingsPatch` write path.

#### Scenario: Add by typed name

- **WHEN** the user types `Code.exe` in the Add field and commits
- **THEN** `Settings.ignored_apps` contains `["Code.exe"]`, the new row appears in the list, and the field clears

#### Scenario: Add by typed name with whitespace

- **WHEN** the user types `  Code.exe  ` in the Add field and commits
- **THEN** the value is trimmed to `Code.exe` before persisting (a leading/trailing-whitespace entry would never match the platform's resolved name)

#### Scenario: Empty add is rejected

- **WHEN** the user clears the Add field and commits
- **THEN** no entry is added, the field returns to its placeholder, and an inline message names the constraint

#### Scenario: Duplicate entry

- **WHEN** the user adds `Code.exe` while `Settings.ignored_apps` already contains `Code.exe`
- **THEN** the list is unchanged (no duplicate row), and the field clears

### Requirement: Add currently focused app

The panel SHALL provide an "Add currently focused app" action that reads `foreground_executable_name()` once and appends the resolved name to the list. The action is disabled when no foreground executable can be resolved (for example, when no window is focused).

#### Scenario: Add focused app on Windows

- **WHEN** the foreground window's process is `Code.exe` and the user activates "Add currently focused app"
- **THEN** `Code.exe` is appended to `Settings.ignored_apps`, the list updates, and the new entry is visible

#### Scenario: Add focused app when no foreground executable resolves

- **WHEN** `foreground_executable_name()` returns `None` and the user activates "Add currently focused app"
- **THEN** the action is disabled (the button is not clickable), with a tooltip naming why

#### Scenario: Duplicate focused-app entry

- **WHEN** the foreground executable is `Code.exe`, the list already contains `Code.exe`, and the user activates "Add currently focused app"
- **THEN** the list is unchanged (no duplicate)

### Requirement: Remove an entry

Each entry SHALL expose a remove action. Removal commits immediately and persists through the existing `SettingsPatch` write path.

#### Scenario: Remove the last entry

- **WHEN** the list contains `["Code.exe", "firefox"]` and the user removes `firefox`
- **THEN** the list becomes `["Code.exe"]`, the row disappears, and the empty-state is not shown because the list is non-empty

#### Scenario: Remove the only entry

- **WHEN** the list contains `["Code.exe"]` and the user removes it
- **THEN** the list becomes empty and the empty-state message reappears

### Requirement: Capture-time behavior is unchanged

The change SHALL NOT modify the capture-time filter logic that consults `Settings.ignored_apps` (`src-tauri/src/features/clipboard/capture.rs`). The panel edits the list; the existing filter continues to drop matches.
## Purpose

Defines the Settings panel that lets the user rebind every shortcut documented in `docs/keyboard-shortcuts.md`, persisted to `Settings.custom_shortcuts`, and the conflict-reporting behavior for bindings the OS already owns.

## ADDED Requirements

### Requirement: Keyboard shortcuts panel lists every documented shortcut

The Settings screen SHALL expose a "Keyboard shortcuts" panel that lists every shortcut documented in `docs/keyboard-shortcuts.md`. The list is sourced from the doc on render so the panel cannot drift from the doc.

#### Scenario: Panel reflects the documented set

- **WHEN** the user opens Settings and `docs/keyboard-shortcuts.md` lists the seven default shortcuts
- **THEN** the panel renders one row per shortcut, with the action label on the left and the key binding on the right

#### Scenario: Doc change reflected after reload

- **WHEN** the developer adds a shortcut to `docs/keyboard-shortcuts.md` and the user reloads the Settings screen
- **THEN** the new shortcut is present in the panel without a code change to the panel itself

### Requirement: Edit a binding inline

Each row SHALL expose an edit control. Editing commits on `Enter` or blur, validates the binding against the documented grammar (`CmdOrCtrl`, `Shift`, plus a key), and persists to `Settings.custom_shortcuts`.

#### Scenario: Rebind a shortcut

- **WHEN** the user rebinds "Focus main-window search" from `CmdOrCtrl+Shift+F` to `CmdOrCtrl+Shift+K`
- **THEN** `Settings.custom_shortcuts["focus_search"]` is `CmdOrCtrl+Shift+K`, the panel row shows the new binding, and the shortcut handler in the running app responds to the new binding on next activation

#### Scenario: Empty binding clears the override

- **WHEN** the user clears the binding field for "Toggle pin" and commits
- **THEN** `Settings.custom_shortcuts` no longer contains an entry for `toggle_pin`, the row falls back to the documented default, and the documented handler is active again

#### Scenario: Invalid binding grammar

- **WHEN** the user enters `Click+Shift+F` (not a recognized grammar) and commits
- **THEN** no entry is persisted, the field reverts to the previously saved binding, and an inline message names the accepted grammar

### Requirement: Platform-correct rendering

The panel SHALL render each binding per-platform: `Cmd` on macOS, `Ctrl` elsewhere, and `Shift`/`Alt` as modifiers regardless of platform. The rendered key combination SHALL match the actual binding the running app uses.

#### Scenario: macOS renders Cmd

- **WHEN** the panel is rendered on macOS
- **THEN** every modifier labeled `CmdOrCtrl` in the doc renders as `Cmd` and the displayed key combination matches the binding the macOS handler uses

#### Scenario: Windows renders Ctrl

- **WHEN** the panel is rendered on Windows
- **THEN** every modifier labeled `CmdOrCtrl` in the doc renders as `Ctrl` and the displayed key combination matches the binding the Windows handler uses

### Requirement: Conflict is surfaced, not silently overridden

When the user binds a shortcut that collides with another binding the app already owns, or with a known OS-reserved binding (for example `Cmd+Q` on macOS), the change SHALL be rejected with an inline message naming the conflict. The previously saved binding SHALL remain in effect.

#### Scenario: Collides with another app shortcut

- **WHEN** the user rebinds "Toggle pin" to `CmdOrCtrl+Shift+V` (the Quick Paste binding)
- **THEN** the change is rejected, the inline error names the conflicting action, and the existing binding remains in effect

#### Scenario: Collides with an OS-reserved binding

- **WHEN** the user rebinds "Copy selected" to `CmdOrCtrl+Q` on macOS
- **THEN** the change is rejected with an inline message naming the reserved binding and the existing binding remains in effect

### Requirement: Rebind takes effect without restart

A successful rebind SHALL take effect in the running app without a restart. The shortcut registration is updated on save and on app launch.

#### Scenario: Rebind active immediately

- **WHEN** the user rebinds "Focus main-window search" and the rebind persists
- **THEN** the next time the user presses the new key combination in another app, the SnipDock main window's search input gains focus, without restarting SnipDock

#### Scenario: Rebind survives restart

- **WHEN** the user rebinds a shortcut, restarts SnipDock, and presses the new binding
- **THEN** the handler is active on launch (the binding was read from `Settings.custom_shortcuts` during startup)
# Startup Update Modal Design

## Goal

Show available signed SnipDock updates when the normal app window opens. Users can install, defer until the next launch, or skip only the offered version.

## Existing foundation

SnipDock already checks the configured GitHub Releases updater endpoint, verifies signed artifacts through Tauri, exposes release version/date/notes, installs and restarts, offers manual update controls in Settings, and shows an update action in the sidebar.

## Behavior

- The existing normal-launch update check drives the startup modal; Quick Paste and hidden startup do not show it.
- An available, non-skipped version opens an accessible modal containing the current version, offered version, release date when present, and release notes when present.
- **Download & install** runs the existing signed install command. The action is disabled and reports progress while installing. Installation failure leaves the modal open with a concise retryable error.
- **Later** closes the modal for the current renderer session. The sidebar update action remains available. A later normal launch offers the same version again.
- **Skip this version** stores the offered version in local storage and closes the modal. That exact version stays suppressed, but any newer offered version opens the modal.
- Closing with the close control or Escape behaves like **Later**.
- Update-check failure remains silent and never blocks app startup.

## Structure

Keep update ownership in the existing sidebar flow to avoid a second network check. Add one focused modal component using the existing Radix dialog and design tokens. The sidebar passes update details and install state into the modal, and owns the session-dismissed and persisted skipped-version state.

The Settings update panel remains unchanged and can still manually check/install a version even when its startup prompt was skipped.

## Accessibility and layout

- Use the existing modal overlay, focus trap, Escape handling, and focus restoration.
- Provide an explicit dialog title and description.
- Keep release notes scrollable so actions remain reachable in short windows.
- Stack actions on narrow widths.
- Use existing semantic color, spacing, typography, button, and focus tokens.

## Verification

Frontend tests cover:

- available update opens the modal;
- **Later** closes it while retaining the sidebar action;
- the same skipped version stays hidden;
- a newer version appears despite an older skip;
- install invokes the existing command and shows failure without closing;
- missing date or notes renders safely.

Run the focused frontend tests, then the existing frontend suite and production build.

## Out of scope

No new updater service, background download, automatic installation, release-note parser, updater endpoint change, or multi-color theme system.

# clipboard-layout Specification

## Purpose

Defines the structural layout of the Clipboard screen: a capped content column, a permanent right rail for preview/details/transform, colour-coded and rhythm-corrected list rows, and a keyboard hint strip sourced from the real documented shortcuts.

## Requirements

### Requirement: Capped content column width
The Clipboard screen's main content column SHALL have a maximum width of 820px, regardless of window width.

#### Scenario: Wide window does not stretch the content column
- **WHEN** the application window is wider than 820px plus the sidebar and rail widths
- **THEN** the content column stops growing at 820px and the freed horizontal space is occupied by the right rail, not by further stretching the list

### Requirement: Permanent right rail on Clipboard
The Clipboard screen SHALL show a persistent 312px-wide right rail with three tabs — Preview, Details, Transform — for the currently selected item, and Copy/Pin/Star actions anchored to the bottom of the rail.

#### Scenario: Rail shows an empty-state invitation when nothing is selected
- **WHEN** no clipboard item is selected
- **THEN** the rail remains visible at its full 312px width and shows an empty-state message inviting the user to select an item, rather than collapsing or hiding

#### Scenario: Selecting an item populates the rail
- **WHEN** the user selects a clipboard item
- **THEN** the Preview tab shows that item's content, the Details tab shows its metadata, and the Copy/Pin/Star actions act on that item

#### Scenario: Rail persists across list scrolling
- **WHEN** the user scrolls the list
- **THEN** the right rail's selected item and active tab remain unchanged

#### Scenario: Rail follows the page the user moved to
- **WHEN** the user moves to another page, leaving the selected item behind
- **THEN** the rail stays at its full width and shows the first item of the new page, rather than continuing to show an item that is no longer in the list

### Requirement: Colour-coded type tags
Each clipboard item's type tag SHALL render using the content-type colour pair defined in the `design-tokens` capability for its detected type, rather than a single uniform accent colour for every type.

#### Scenario: Two items of different detected types show different tag colours
- **WHEN** the list contains one item detected as shell content and one detected as JSON
- **THEN** their type tags render with visually distinct colours matching their respective `--color-type-*` tokens

### Requirement: Capped inline thumbnail size
Image items in the list SHALL render an inline thumbnail no larger than 46×32px. The full-size preview SHALL be available in the right rail's Preview tab, not inline in the list row.

#### Scenario: Image row height matches text row height
- **WHEN** an image item and a text item appear adjacent in the list
- **THEN** the image row's height is not more than the text row's height plus the fixed padding shared by all rows (i.e., the row no longer doubles in height to accommodate a large inline image)

### Requirement: Density toggle
Settings SHALL expose a compact/comfortable density toggle that changes the Clipboard list's row spacing.

#### Scenario: Switching to compact density increases visible row count
- **WHEN** the user switches the density setting from comfortable to compact
- **THEN** the Clipboard list's per-row vertical padding decreases and more rows fit in the same viewport height without any row's content being clipped

### Requirement: Relative timestamps with absolute on hover
Each clipboard item SHALL display a relative timestamp by default (e.g. "2m ago", "3h ago", "Yesterday", falling back to an absolute date beyond that range), with the full absolute timestamp available via the native `title` attribute on hover.

#### Scenario: Recent item shows a relative timestamp
- **WHEN** an item was captured 2 minutes ago
- **THEN** its displayed timestamp reads "2m ago" and hovering over it shows the full absolute timestamp via `title`

#### Scenario: Old item falls back to an absolute date
- **WHEN** an item was captured more than a few days ago (beyond the relative-format window already used elsewhere in the app, e.g. "Yesterday")
- **THEN** its displayed timestamp shows an absolute date rather than an increasingly large relative value

### Requirement: Row metadata line
Each clipboard item row SHALL show a metadata line beneath its content containing the size or line count, the source application when one is recorded, and any type-specific detail (e.g. dimensions for images, key count for JSON).

#### Scenario: Text item shows line count
- **WHEN** a plain-text or code item is rendered
- **THEN** its metadata line includes a line count or character count

#### Scenario: Text item from a known source shows the source
- **WHEN** a text item with `source_app = "Code.exe"` is rendered
- **THEN** its metadata line includes `Code.exe` as one of its segments, alongside the existing line-count segment

#### Scenario: Text item with no recorded source
- **WHEN** a text item with `source_app = null` is rendered
- **THEN** its metadata line omits the source segment rather than rendering an empty placeholder

#### Scenario: Image item shows dimensions and file size
- **WHEN** an image item is rendered
- **THEN** its metadata line includes pixel dimensions and file size

### Requirement: Keyboard hint strip reflects real shortcuts
The Clipboard screen SHALL show a hint strip beneath the list listing only the shortcuts documented in `docs/keyboard-shortcuts.md`, with no invented or placeholder shortcuts.

#### Scenario: Hint strip omits undocumented shortcuts
- **WHEN** the hint strip is rendered
- **THEN** every shortcut shown matches an entry in `docs/keyboard-shortcuts.md`, and no shortcut appears that is absent from that document

#### Scenario: Documented shortcut changes are reflected without inventing new UI copy
- **WHEN** `docs/keyboard-shortcuts.md` is the source of truth for shortcut key combinations
- **THEN** the hint strip's key labels match the document's key combinations exactly (e.g. `CmdOrCtrl+Shift+V`, rendered per-platform)

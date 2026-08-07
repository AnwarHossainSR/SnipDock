# settings-layout Specification

## Purpose

Defines the structural layout of the Settings screen: a capped content column, a scroll-tracking section-index rail, custom form controls in place of native ones, and visible save/reset feedback.

## Requirements

### Requirement: Capped content column width
The Settings screen's main content column SHALL have a maximum width of 820px, matching the Clipboard screen's content column, regardless of window width.

#### Scenario: Wide window does not stretch settings cards
- **WHEN** the application window is wider than 820px plus the sidebar and rail widths
- **THEN** the Settings content column stops growing at 820px

### Requirement: Scroll-tracking section index rail
The Settings screen SHALL show a persistent 312px-wide right rail listing every settings section, with the section nearest the current scroll position visually highlighted.

#### Scenario: Scrolling updates the highlighted section
- **WHEN** the user scrolls the Settings content column so a different section becomes the topmost visible section
- **THEN** the rail's highlighted entry updates to match that section

#### Scenario: Clicking a rail entry scrolls to that section
- **WHEN** the user clicks a section entry in the rail
- **THEN** the content column scrolls so that section is at the top of the viewport

### Requirement: Custom form controls replace native ones
Settings SHALL render checkboxes as the app's existing custom toggle component, number inputs as a fixed ~132px control with steppers and a range hint shown below the field (not in the label), and the content-type exclusion list as toggle pills rather than a wrapped row of checkboxes.

#### Scenario: Number field shows its valid range as a hint, not in the label
- **WHEN** a number field such as history retention is rendered
- **THEN** the field's label states only what the field is, and the valid range (e.g. "1-365") appears as a separate hint below the input

#### Scenario: Content-type exclusions render as toggle pills
- **WHEN** the ignored-content-types control is rendered
- **THEN** each content type appears as an individually toggleable pill, not a native checkbox in a wrapped list

#### Scenario: Toggle reflects current boolean setting state
- **WHEN** a boolean setting (e.g. "Track clipboard changes") is on or off
- **THEN** the custom toggle control's visual state matches the underlying setting value

### Requirement: Renamed grouping options
The Clipboard screen's grouping control SHALL replace the indistinguishable "Type" and "Kind" option labels with names that describe what each option actually groups by.

#### Scenario: Grouping options are distinguishable by label alone
- **WHEN** a user reads the two renamed grouping option labels without opening either
- **THEN** the labels describe different, identifiable grouping criteria (e.g. one groups by detected content classification, the other by a different existing grouping key), and no two options share the same or a confusingly similar label

### Requirement: Visible save feedback
Settings SHALL show a visible saved indicator when a section's values are persisted, sighted without requiring assistive technology.

#### Scenario: Saving a setting shows a visible confirmation
- **WHEN** a settings value is committed to the backend
- **THEN** a saved indicator becomes visible on screen (not only in an `sr-only` region)

### Requirement: Per-section reset to defaults
Each settings card/section SHALL expose a reset-to-defaults action scoped to that section only.

#### Scenario: Reset affects only its own section
- **WHEN** the user triggers "Reset this section" on one settings card
- **THEN** only the fields within that card return to their default values; fields in other sections are unchanged

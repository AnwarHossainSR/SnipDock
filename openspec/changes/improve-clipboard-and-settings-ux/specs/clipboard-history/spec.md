## Purpose

Defines how the Recent captures screen presents stored clipboard items: how each item preview renders, how the screen reports how much of the history is on screen, how grouping is labelled, and how the list behaves when new content is captured while the user is reading it.

## ADDED Requirements

### Requirement: Item previews render at predictable height

The history list SHALL normalize whitespace for display only. Leading and trailing blank lines MUST be removed from the preview, and runs of two or more consecutive blank lines MUST collapse to a single blank line, before the preview is clamped to its line limit. The stored item content MUST NOT be modified, and copying an item MUST place the original stored content on the clipboard.

#### Scenario: Snippet with surrounding blank lines

- **WHEN** an item whose content is `"\n\n\n/run-tests\n\n\n"` is displayed in the history list
- **THEN** its preview renders as `/run-tests` with no leading or trailing blank lines, occupying the same height as a one-line item

#### Scenario: Snippet with internal blank runs

- **WHEN** an item whose content contains four consecutive newlines between two lines of text is displayed
- **THEN** the preview shows those two lines separated by a single blank line

#### Scenario: Copy is unaffected by preview normalization

- **WHEN** the user copies an item whose content has leading and trailing blank lines
- **THEN** the clipboard receives the stored content unchanged, including its original leading and trailing blank lines

### Requirement: Live capture preserves loaded history

When a new clipboard item is captured while the history screen is open, the screen SHALL show the new item without discarding items already loaded through pagination, and without moving the user's scroll position or keyboard focus.

#### Scenario: Capture arrives after paging

- **WHEN** the user has scrolled far enough to load 120 of 265 items and a new item is captured
- **THEN** the new item appears at the top of the list, all 120 previously loaded items remain loaded, and the total count increases by one

#### Scenario: Focus is retained during capture

- **WHEN** an item in the list holds keyboard focus and a new item is captured
- **THEN** focus remains on the same item

#### Scenario: Capture that the active filter excludes

- **WHEN** the `Pinned` filter is active and a new unpinned item is captured
- **THEN** the list contents do not change

### Requirement: Counts describe what is on screen

The history screen SHALL present item counts unambiguously. It MUST NOT display the same number twice under two different labels. When fewer items are loaded than match the current filter, the screen MUST make the difference explicit rather than implying the whole set is present.

#### Scenario: Only the first page is loaded

- **WHEN** 265 items match the current filter and 30 are loaded
- **THEN** the screen reports both figures in a single readout that distinguishes loaded from matching, for example `30 of 265 items`

#### Scenario: Everything matching is loaded

- **WHEN** every item matching the current filter is loaded
- **THEN** the screen reports a single total, for example `265 items`, with no second contradicting figure

### Requirement: Group headings count their own contents

When results are grouped, each group heading SHALL report the number of items rendered inside that group, and the grouping MUST NOT claim to cover items that are not loaded.

#### Scenario: Grouping with unloaded items remaining

- **WHEN** grouping is set to `Kind`, 30 of 265 matching items are loaded, and all 30 have kind `clipboard`
- **THEN** the `Clipboard` heading reports `30`, and the screen's own count readout shows that 30 of 265 items are loaded, so no two figures on screen contradict each other

#### Scenario: Group counts follow pagination

- **WHEN** the user scrolls and 30 more items load into an existing group
- **THEN** that group's heading count increases to match the items now rendered within it

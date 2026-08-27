# clipboard-history Specification

## Purpose

Defines how the Recent captures screen presents stored clipboard items: how each item preview renders, how the history is divided into pages, how the screen reports how much of the history is on screen, how grouping is labelled, how content saved by hand enters the history, and how the list behaves when new content is captured while the user is reading it.

## Requirements

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

### Requirement: History is paged with explicit controls

The history screen SHALL show one page of matching items at a time and SHALL provide pagination controls beneath the list: a step to the previous and next page, direct access to numbered pages including the first and the last, and a choice of how many rows a page holds. Moving to a page MUST replace the rows on screen rather than appending to them, and MUST NOT require the user to scroll to trigger loading.

#### Scenario: Moving to the next page replaces the rows

- **WHEN** 265 items match the current filter at 30 rows per page and the user activates `Next` from page 1
- **THEN** the screen requests the items at offset 30 and shows exactly those 30 rows, with none of page 1's rows still rendered

#### Scenario: The last page is reachable directly

- **WHEN** the user activates the highest numbered page control
- **THEN** the screen shows the final page of matching items, however many pages lie between it and the current one

#### Scenario: Changing rows per page restarts from the first page

- **WHEN** the user chooses a different number of rows per page
- **THEN** the screen shows the first page at the new size

#### Scenario: Deleting the last row of the final page

- **WHEN** the user deletes the only remaining row of the last page and earlier pages still hold items
- **THEN** the screen moves to the page that now holds the end of the list rather than showing an empty list with a page control pointing past it

### Requirement: Live capture preserves the page being read

When a new clipboard item is captured while the history screen is open, the screen SHALL keep the rows of the current page stable and MUST NOT move the user's keyboard focus. The new item belongs at the head of the first page; the matching total SHALL account for it wherever the user is.

#### Scenario: Capture arrives while the first page is shown

- **WHEN** the first page is on screen and a new item is captured
- **THEN** the new item appears at the top of the page, the page still holds no more rows than its size, and the matching total increases by one

#### Scenario: Capture arrives while a later page is shown

- **WHEN** page 2 of 9 is on screen and a new item is captured
- **THEN** the rows on screen are unchanged and the matching total increases by one

#### Scenario: Focus is retained during capture

- **WHEN** an item in the list holds keyboard focus and a new item is captured
- **THEN** focus remains on the same item

#### Scenario: Capture that the active filter excludes

- **WHEN** the `Pinned` filter is active and a new unpinned item is captured
- **THEN** the list contents do not change

### Requirement: Counts describe what is on screen

The history screen SHALL present item counts unambiguously. The screen-level readout MUST be a single figure set: no second screen-level count may restate the same number under a different label. (Group headings count their own contents and are independent of this rule - a heading may legitimately repeat a number that also appears in the screen readout.) The readout MUST state which rows of the matching set are on screen, and its range MUST be derived from the rows actually rendered rather than from the page size.

#### Scenario: A full page in the middle of the results

- **WHEN** 265 items match the current filter and page 2 of 30 rows is shown
- **THEN** the screen reports `31–60 of 265 items` in a single readout

#### Scenario: A short final page

- **WHEN** page 9 of a 265-item result set at 30 rows per page renders its 25 remaining rows
- **THEN** the readout reports `241–265 of 265 items`, never a range that runs past the total

#### Scenario: Everything matching fits on one page

- **WHEN** every item matching the current filter fits on the page
- **THEN** the screen reports one range covering the whole set, with no second contradicting figure

### Requirement: Group headings count their own contents

When results are grouped, each group heading SHALL report the number of items rendered inside that group, and the grouping MUST NOT claim to cover items outside the current page.

#### Scenario: Grouping on a full page

- **WHEN** grouping is set to `Kind`, page 1 of 30 rows is shown out of 265 matching items, and all 30 have kind `clipboard`
- **THEN** the `Clipboard` heading reports `30`, and the screen's own readout shows `1–30 of 265 items`, so no two figures on screen contradict each other

#### Scenario: Group counts follow the page

- **WHEN** the user moves to a short final page holding 25 rows
- **THEN** that group's heading count falls to match the items now rendered within it

### Requirement: Saving an item by hand

The history screen SHALL let the user store content they type or paste into SnipDock. The result MUST be an ordinary clipboard item - it appears in the history, obeys the filters, and copies back exactly what was stored. The content type SHALL be detected rather than asked for, and the stored content MUST be byte-for-byte what the user entered.

#### Scenario: Saved content joins the history

- **WHEN** the user saves content by hand while no filter is active
- **THEN** that item appears at the top of the first page, is selected, and its content is shown in the right rail

#### Scenario: Saved content the active filter excludes

- **WHEN** the user saves plain text while the `Code` filter is active
- **THEN** the item is stored and the screen says the active filter is hiding it, rather than appearing to have done nothing

#### Scenario: Duplicate of an existing capture

- **WHEN** the user saves content identical to the most recent capture
- **THEN** the item is stored, because duplicate suppression governs automatic capture only

#### Scenario: Content that scans as a secret

- **WHEN** the user saves content that automatic capture would have skipped as a high-risk secret
- **THEN** the item is stored and marked private, so it renders masked rather than being discarded

#### Scenario: Blank content

- **WHEN** the user attempts to save content that is empty or only whitespace
- **THEN** the save is refused and nothing is added to the history

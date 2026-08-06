## Purpose

Defines how the Settings screen commits preference edits to local storage, how it validates values before writing them, how it confirms the outcome to the user, and how consistently its form controls present against the rest of the application.

## ADDED Requirements

### Requirement: Edits commit once per completed edit

Text, number, and multi-line settings fields SHALL commit a value at most once per completed edit rather than once per keystroke. A field commits when it loses focus, when the user presses `Enter`, or after typing has been idle for a short interval. Toggles and select controls, whose values are complete the moment they change, MAY commit immediately.

#### Scenario: Typing a multi-digit number

- **WHEN** the user selects the contents of `History retention` and types `365`
- **THEN** exactly one save is performed, carrying the value `365`

#### Scenario: Editing a multi-line field

- **WHEN** the user types a 40-character regular expression into `Ignored text patterns` and clicks elsewhere
- **THEN** exactly one save is performed, carrying the completed pattern list

#### Scenario: Toggling a checkbox

- **WHEN** the user clears `Track clipboard changes`
- **THEN** the change is saved immediately without waiting for focus to move

### Requirement: Numeric settings are validated before saving

A numeric settings field SHALL NOT save a value that is empty, non-numeric, or outside its stated range. While the field holds such a value the screen MUST show what the accepted range is, and the previously saved value MUST remain in effect.

#### Scenario: Field cleared

- **WHEN** the user deletes the contents of `Maximum items` and moves focus away
- **THEN** no save is performed, the field returns to the last saved value, and the stored setting is unchanged

#### Scenario: Value above the allowed range

- **WHEN** the user enters `50000` in `Maximum items` (allowed range 10-10,000) and moves focus away
- **THEN** no save is performed and the screen shows an inline message naming the allowed range

#### Scenario: Value inside the allowed range

- **WHEN** the user enters `2000` in `Maximum items` and moves focus away
- **THEN** the value is saved and any previous inline range message is cleared

### Requirement: Save outcome is visible

The Settings screen SHALL confirm the result of every save in a way that is visible on screen, not only to assistive technology. Success confirmation MUST identify that the setting was saved and MUST clear itself without user action. Failure MUST remain visible until the user makes another edit.

#### Scenario: Successful save

- **WHEN** a setting saves successfully
- **THEN** a visible confirmation appears and is also announced to assistive technology, and it disappears on its own a few seconds later

#### Scenario: Failed save

- **WHEN** a save fails
- **THEN** a visible error naming the failure appears and remains until the user edits a setting again

#### Scenario: Save in flight

- **WHEN** a save is in progress
- **THEN** the screen indicates the pending state rather than appearing idle

### Requirement: Form controls match the application theme

Interactive settings controls — checkboxes, selects, and grouped-option fieldsets — SHALL render with the application's own token-based styling in both light and dark themes, rather than falling back to operating-system default appearance. Controls MUST keep native keyboard behavior and MUST show a visible focus indicator that meets the same contrast as other focusable elements in the application.

#### Scenario: Checkbox in dark theme

- **WHEN** the Settings screen is viewed in the dark theme
- **THEN** checkboxes render using the application's accent and border tokens, not the operating system's default control colors

#### Scenario: Select in dark theme

- **WHEN** a select control such as `Theme` or `Paste format` is viewed in the dark theme
- **THEN** its closed state renders with the application's field styling, including its own indicator, consistent with adjacent text inputs

#### Scenario: Keyboard operation is preserved

- **WHEN** the user reaches a restyled checkbox or select using `Tab` and operates it with the keyboard
- **THEN** it toggles or opens exactly as the unstyled native control would, and its focus indicator is visible

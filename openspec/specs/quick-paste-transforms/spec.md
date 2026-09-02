# quick-paste-transforms Specification

## Purpose

Defines the built-in transform pipeline that Quick Paste applies to a selected item's content at the moment of paste, the visible preview of the transformed content, and the keyboard bindings that drive the pipeline.

## Requirements


### Requirement: Built-in transforms are available in Quick Paste

Quick Paste SHALL expose a fixed set of built-in transforms: trim, lowercase, uppercase, sort lines ascending and deduplicate identical lines, JSON pretty-print, JSON minify, base64 encode, base64 decode, URL encode, URL decode. Each transform is a pure function on the candidate content; the stored item content is never modified.

#### Scenario: Trim removes leading and trailing whitespace

- **WHEN** the user activates the `Trim` transform on content `"  hello\n\n"`
- **THEN** Quick Paste's preview pane shows `"hello"` and the value that reaches the clipboard on paste is `"hello"`

#### Scenario: Lowercase folds case

- **WHEN** the user activates the `Lowercase` transform on content `"Hello, World"`
- **THEN** Quick Paste's preview pane shows `"hello, world"` and the value that reaches the clipboard on paste is `"hello, world"`

#### Scenario: Sort and dedupe lines

- **WHEN** the user activates the `Sort lines / dedupe` transform on content `"banana\napple\nbanana\napple\n"`
- **THEN** Quick Paste's preview pane shows `"apple\nbanana\n"` (sorted ascending, duplicates collapsed, single trailing newline preserved) and the paste value matches

#### Scenario: JSON pretty-print on valid JSON

- **WHEN** the user activates `JSON pretty` on content `'{"b":2,"a":1}'`
- **THEN** the preview shows the JSON object formatted with two-space indentation and stable key order, and the paste value matches

#### Scenario: JSON minify

- **WHEN** the user activates `JSON minify` on content that is valid JSON with whitespace
- **THEN** the preview shows the JSON with no insignificant whitespace and the paste value matches

#### Scenario: Base64 round-trip identity

- **WHEN** the user activates `Base64 encode` on content `"hello"`, then activates `Base64 decode` on the result
- **THEN** the preview returns to `"hello"` and a paste after the second transform yields `"hello"`

#### Scenario: URL encode / decode round-trip

- **WHEN** the user activates `URL encode` on `"a b/c"`, then activates `URL decode` on the result
- **THEN** the preview returns to `"a b/c"` and a paste after the second transform yields `"a b/c"`

#### Scenario: Transform error is shown, not silently no-op

- **WHEN** the user activates `Base64 decode` on content that is not valid base64
- **THEN** the preview pane shows an inline error naming the failing transform and the previously selected content is unchanged on the clipboard; Quick Paste does not paste

#### Scenario: Stored history is unchanged

- **WHEN** the user activates any transform and pastes the result
- **THEN** the stored item's `content` in the database equals what was stored before the transform was applied (verified by re-reading the row from storage)

### Requirement: Transforms are visible in Quick Paste's preview

Quick Paste SHALL show a preview pane that displays the result of applying the active transform to the selected item's content. Switching transforms updates the preview without changing the selected item.

#### Scenario: Selecting an item shows the un-transformed preview

- **WHEN** the user opens Quick Paste and highlights an item whose `content` is `"Hello, World"`
- **THEN** the preview pane shows `"Hello, World"` and the active transform label reads "None"

#### Scenario: Switching transform updates the preview

- **WHEN** the preview pane shows `"Hello, World"` and the user activates the `Lowercase` transform
- **THEN** the preview pane updates to `"hello, world"` and the active transform label reads "Lowercase"

#### Scenario: Switching the selection updates the preview

- **WHEN** the preview pane shows the transformed preview for item A and the user moves the highlight to item B
- **THEN** the preview pane shows item B's content (un-transformed) and the active transform label resets to "None" for the new selection

### Requirement: Keyboard bindings drive the transform pipeline

Quick Paste SHALL provide keyboard bindings for the transform pipeline. The bindings are documented in `docs/keyboard-shortcuts.md`; the panel reads from that document so the doc remains the source of truth.

#### Scenario: The cycle key cycles the transform

- **WHEN** the user presses the documented "cycle transform" key (`F8`) while Quick Paste is open
- **THEN** the next transform in the fixed cycle becomes active and the preview updates; the cycle order is the order of the transforms in this spec, wrapping at the end

#### Scenario: Reset to no transform

- **WHEN** the user presses the documented "reset transform" key while a transform is active
- **THEN** the active transform becomes "None" and the preview shows the un-transformed content

#### Scenario: Letter transform bindings

- **WHEN** the user presses the documented letter binding for `JSON pretty` (`Alt+J`) while Quick Paste is open and the preview content is valid JSON
- **THEN** `JSON pretty` becomes the active transform and the preview updates

#### Scenario: Transform binding on non-text item

- **WHEN** the user presses a letter transform binding while Quick Paste has an image item highlighted
- **THEN** the transform is not applied (image items have no transform pipeline), no preview is shown for that item, and the binding is a no-op for that selection

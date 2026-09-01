## Purpose

Defines a regex mode toggle in the clipboard search box and the corresponding branch in the Rust search command that compiles a `regex::Regex` from the query string.

## ADDED Requirements

### Requirement: Search box exposes a literal/regex mode toggle

The clipboard search box SHALL expose a mode selector with two values: `Literal` (default) and `Regex`. The selected mode persists per session and is recorded alongside saved searches. The mode is shown next to the search input.

#### Scenario: Default mode is Literal

- **WHEN** the user opens the Clipboard screen for the first time in a session
- **THEN** the search box's mode selector reads `Literal` and the mode indicator next to the input shows the `Literal` label

#### Scenario: Switching to Regex shows the mode

- **WHEN** the user activates the `Regex` option in the mode selector
- **THEN** the mode indicator updates to `Regex` and the search input gains a token-styled border to signal the active mode

#### Scenario: Mode persists within a session

- **WHEN** the user switches to `Regex`, navigates away from the Clipboard screen, and returns
- **THEN** the mode selector still reads `Regex` (the mode is held in the same store state as the search text)

### Requirement: Regex mode compiles a regex and matches against the indexed text

When the search is issued in `Regex` mode, the backend SHALL compile the query string as a `regex::Regex`. The search SHALL scope the regex match to rows already returned by an FTS5 pre-filter when one exists, then apply the regex against the candidate text. An invalid regex pattern SHALL be reported inline rather than silently returning an empty result.

#### Scenario: Valid regex returns matching rows

- **WHEN** the search is issued with the regex `/v\d+/users/` against an indexed text column
- **THEN** the result set contains rows whose indexed text contains a substring matching `/v\d+/users/` and no other rows

#### Scenario: Invalid regex surfaces an inline error

- **WHEN** the search is issued with the regex `[unclosed` (unbalanced bracket)
- **THEN** the search box shows an inline error naming the regex compile failure, no IPC call returns rows, and previously rendered rows remain on screen

#### Scenario: Regex match is case-sensitive by default

- **WHEN** the search is issued with the regex `error` against text that contains `Error`
- **THEN** the result set does not contain the row containing `Error` (the case-insensitive flag is opt-in)

#### Scenario: Case-insensitive flag

- **WHEN** the user prefixes the regex with `(?i)` (for example `(?i)error`)
- **THEN** the result set contains both `error` and `Error` matches

### Requirement: Saved searches record the mode

A saved search SHALL record the mode it was saved with. Reopening a saved search sets the search box to the saved query and the mode selector to the saved mode.

#### Scenario: Saving a Regex search

- **WHEN** the user saves a search with query `/v\d+/users/` and mode `Regex`
- **THEN** the saved search's stored mode is `Regex`

#### Scenario: Reopening a Literal saved search

- **WHEN** the user reopens a saved search that was saved with mode `Literal`
- **THEN** the search box shows the saved query and the mode selector reads `Literal`

#### Scenario: Reopening a Regex saved search

- **WHEN** the user reopens a saved search that was saved with mode `Regex`
- **THEN** the search box shows the saved query and the mode selector reads `Regex`

#### Scenario: Default for new saved searches

- **WHEN** the user saves a search without changing the mode selector
- **THEN** the saved mode is `Literal` (the default)
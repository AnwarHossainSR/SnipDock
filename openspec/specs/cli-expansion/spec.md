# cli-expansion Specification

## Purpose

Defines the new subcommands in `packages/snipdock-cli/` that operate on a running SnipDock instance through a localhost HTTP endpoint exposed by the desktop app, gated by a per-launch token.

## Requirements


### Requirement: CLI discovers the running SnipDock instance

The CLI SHALL discover a running SnipDock instance by reading a per-launch token from a known file in the SnipDock data directory. The token is rotated on each launch; the CLI reads it on every invocation rather than caching it across runs.

#### Scenario: Discovery files present

- **WHEN** SnipDock is running and both `<data_dir>/cli-token` and `<data_dir>/cli-port` exist and hold a token and a port
- **THEN** the CLI reads both, targets `http://127.0.0.1:<port>`, and constructs requests with an `Authorization: Bearer <token>` header

#### Scenario: SnipDock not running

- **WHEN** either discovery file is missing, empty, or unreadable
- **THEN** the CLI exits non-zero with a single-line message naming the cause and the command the user should run first (`snipdock run`)

#### Scenario: Discovery contract

- **WHEN** the desktop app starts its CLI endpoint
- **THEN** it writes two files in the SnipDock data directory, owner-readable only (mode `0600` on Unix): `cli-token`, holding the 16-byte hex launch token, and `cli-port`, holding the decimal port the endpoint bound to. Both are rewritten on every launch and removed when the app stops, and the CLI reads both on every invocation - a port that is not a plain number in `1..=65535` is treated as no endpoint at all

#### Scenario: Endpoint is bound to 127.0.0.1

- **WHEN** the CLI sends a request to the discovered endpoint
- **THEN** the request is accepted (the endpoint binds to a 127.0.0.1 port from a random 16-bit range; the CLI uses the host:port from a discovery file written by the app)

### Requirement: Subcommands operate on stored items

The CLI SHALL expose subcommands that operate on the running SnipDock instance's stored data: `pin`, `unpin`, `favorite`, `unfavorite`, `tag`, `search`, `paste <id>`, `export <path>`. Each subcommand exits zero on success and non-zero with a single-line error message on failure.

#### Scenario: Pin an item by id

- **WHEN** the user runs `snipdock pin <id>` and `<id>` exists in storage
- **THEN** the item's `pinned` flag is set to `true`, the CLI exits zero, and a single-line success message is printed

#### Scenario: Pin a missing id

- **WHEN** the user runs `snipdock pin <id>` and `<id>` does not exist in storage
- **THEN** the CLI exits non-zero with a message naming the missing id; no item is modified

#### Scenario: Tag an item

- **WHEN** the user runs `snipdock tag <id> <tag>` and the item exists
- **THEN** the named tag is created if it does not exist, attached to the item, the CLI exits zero, and a single-line success message is printed

#### Scenario: Search returns matching ids

- **WHEN** the user runs `snipdock search <query>` and the query matches stored items
- **THEN** the CLI prints one id per line and exits zero; an empty result set is printed as no output and a zero exit code

#### Scenario: Paste by id

- **WHEN** the user runs `snipdock paste <id>` and the item exists
- **THEN** the item's content is placed on the system clipboard, the CLI exits zero, and the running app's focus-restore-and-paste path runs (matching the in-app Quick Paste behavior on the host platform)

#### Scenario: Export to a path

- **WHEN** the user runs `snipdock export <path>` and `<path>` is a writable file path
- **THEN** the running app's export pipeline writes the encrypted export to `<path>`, the CLI exits zero, and a single-line success message is printed naming the path

#### Scenario: Export honors the existing private-item rule

- **WHEN** the user runs `snipdock export <path>` and storage contains private items
- **THEN** the export omits private items, matching the existing in-app export behavior

### Requirement: Existing installer subcommands are unchanged

The CLI SHALL keep the existing `install`, `run`, `update`, `uninstall`, `version`, `help` subcommands unchanged. `snipdock help` lists the new subcommands alongside the existing ones.

#### Scenario: Help lists every subcommand

- **WHEN** the user runs `snipdock help`
- **THEN** the output lists `install`, `run`, `update`, `uninstall`, `version`, `help`, and the new subcommands `pin`, `unpin`, `favorite`, `unfavorite`, `tag`, `search`, `paste`, `export`, each with a one-line description

#### Scenario: Install remains installer-only

- **WHEN** the user runs `snipdock install`
- **THEN** the install path runs as before (download from GitHub Releases, verify SHA-256, extract); the new subcommands do not alter it

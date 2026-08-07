# design-tokens Specification

## Purpose

Defines the additional CSS custom properties (surfaces, borders, accent variants, and per-content-type colours) that the Clipboard and Settings redesign builds on, extending the existing token set in `src/styles/tokens.css` rather than replacing it.

## Requirements

### Requirement: Additional surface step
The token set SHALL provide a fourth surface step (a "raised-hover" tier) in addition to the existing `--color-surface`, `--color-surface-muted`, and `--color-surface-raised`, for both the light and dark theme blocks and the `prefers-color-scheme: dark` media block.

#### Scenario: Raised-hover token resolves in both themes
- **WHEN** a component reads the raised-hover surface token in light mode and in dark mode
- **THEN** each theme resolves to a distinct colour value one step lighter (dark theme) or one step darker (light theme) than `--color-surface-raised`, and the value is defined explicitly in every theme block — never left to fall through from a parent

### Requirement: Role-coloured border variant
The token set SHALL provide a border colour token distinct from `--color-border` and `--color-border-strong` for borders that carry semantic meaning (e.g., a selected or accented row edge), sourced from the accent colour rather than the neutral border scale.

#### Scenario: Accent border token is distinguishable from neutral borders
- **WHEN** the accent-border token and `--color-border-strong` are rendered side by side on the panel surface
- **THEN** the two colours are visually distinct (not the same hex value) in both light and dark themes

### Requirement: Accent variants
The token set SHALL provide a dimmed accent colour (for de-emphasized accent usage, e.g. inactive shortcut badges) and reuse the existing `--color-accent-soft` for low-alpha accent backgrounds, without introducing a duplicate low-alpha token.

#### Scenario: Dimmed accent is darker/less saturated than the primary accent
- **WHEN** `--color-accent-dim` (or equivalent name) and `--color-accent` are compared in dark mode
- **THEN** the dimmed variant has lower perceived brightness or saturation than the primary accent, while remaining legible on `--color-surface`

### Requirement: Content-type colour pairs
The token set SHALL provide one text-colour/background-colour pair per detected content type shown in the clipboard list: image, shell, JSON/data, secret, config, and plain text. Each background value SHALL be a low-alpha tint of its paired text colour, and each pair SHALL meet WCAG AA contrast (4.5:1 for the text colour against `--color-surface`) in both light and dark themes.

#### Scenario: Every detected content type has a colour pair
- **WHEN** the content-type classifier (already implemented in `src-tauri/src/features/detection.rs` / frontend type badges) reports one of: image, shell, JSON/data, secret, config, or plain text
- **THEN** a corresponding `--color-type-<name>` (text) and `--color-type-<name>-bg` (background) token pair exists and is applied to that item's type tag

#### Scenario: Content-type text colour passes contrast on the panel surface
- **WHEN** any `--color-type-<name>` token is measured against `--color-surface` in both light and dark theme
- **THEN** the contrast ratio is at least 4.5:1

#### Scenario: Unclassified or unmapped content type falls back to plain text styling
- **WHEN** an item's detected type does not match one of the six defined content-type tokens
- **THEN** the item's type tag renders using the plain-text pair rather than an undefined token or unstyled default

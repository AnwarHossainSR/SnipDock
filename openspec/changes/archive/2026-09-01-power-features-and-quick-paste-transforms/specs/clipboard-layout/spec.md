## Purpose

See the `clipboard-layout` spec for the full layout requirements. This delta extends the existing "Row metadata line" requirement to include the source-app segment now that the `source_app` field exists per item.

## MODIFIED Requirements

### Requirement: Row metadata line

The existing requirement text is amended to read: each clipboard item row SHALL show a metadata line beneath its content containing the size or line count, the source application when one is recorded, and any type-specific detail (e.g. dimensions for images, key count for JSON).

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
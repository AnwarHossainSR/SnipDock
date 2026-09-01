## Purpose

See the `clipboard-history` spec for the full history screen requirements. This delta adds a scenario for the new source-app filter to the existing "Live capture preserves the page being read" requirement, parallel to the `Pinned` and `Code` filter scenarios.

## MODIFIED Requirements

### Requirement: Live capture preserves the page being read

The existing requirement text is unchanged. The following scenarios are appended to it:

#### Scenario: Capture that the active source-app filter excludes

- **WHEN** the source-app filter is active with `source_apps = ["Code.exe"]` and a new item is captured from `firefox`
- **THEN** the list contents do not change (the capture is filtered out client-side, matching the existing `Pinned` filter behavior)

#### Scenario: Capture that matches the active source-app filter

- **WHEN** the source-app filter is active with `source_apps = ["Code.exe"]` and a new item is captured from `Code.exe`
- **THEN** the new item is prepended to the first page (subject to pagination rules) and the matching total increases by one
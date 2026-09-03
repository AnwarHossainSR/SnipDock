## Purpose

Lets a person keep one clipboard history across the machines they own, by exchanging sealed records through storage they already control, without SnipDock running a server or holding a key.

## ADDED Requirements

### Requirement: Sync is off until a device is paired

Synchronisation SHALL be disabled by default. Turning it on SHALL require the user to supply a destination (bucket, region, credentials, optional prefix) and a sync passphrase, and SHALL NOT begin exchanging records until the destination has been reached successfully at least once.

#### Scenario: A fresh install syncs nothing
- **WHEN** SnipDock is installed and the user has not configured sync
- **THEN** no records are staged, no request leaves the device, and the Settings panel shows sync as off

#### Scenario: Turning sync on validates the destination first
- **WHEN** the user supplies a destination and passphrase and activates sync
- **THEN** SnipDock writes and reads back a probe object before enabling the loop, and reports a failure inline without enabling sync if the destination cannot be reached

#### Scenario: The passphrase is required to join, not to browse
- **WHEN** the user enters a passphrase that cannot open the records already at the destination
- **THEN** sync reports that the passphrase does not match this destination, stays off, and does not overwrite anything already there

### Requirement: Every device has a stable identity

Each installation SHALL hold a device identifier and a user-visible device name, generated on first launch and stable across restarts and updates. Records SHALL carry the identifier of the device that wrote them.

#### Scenario: A device names itself on first launch
- **WHEN** SnipDock starts for the first time
- **THEN** it generates a device identifier and a default name from the host, and the name is editable in Settings

#### Scenario: A device recognises its own records
- **WHEN** the pull step encounters a record written by this device
- **THEN** the record is skipped rather than re-applied

### Requirement: Records leave the device sealed

Every payload SHALL be encrypted on the device with the sync passphrase before any transport call, using the same envelope the backup path uses. Item content, titles, notes, and tags SHALL NOT appear in plaintext in any request, object name, or log line. Items marked private SHALL NOT be staged at all.

#### Scenario: A staged record carries no plaintext
- **WHEN** an item is staged for sync
- **THEN** the stored row and the uploaded object contain ciphertext only, and the object name reveals nothing about the content

#### Scenario: A private item never leaves
- **WHEN** an item marked private is captured or edited
- **THEN** it is never staged, never uploaded, and the failure to stage it is not reported as an error

#### Scenario: A deletion is a tombstone, not an absence
- **WHEN** the user deletes a synced item
- **THEN** a tombstone is staged so other devices remove it too, and the tombstone is indistinguishable in size from a record carrying content

### Requirement: The loop pushes and pulls on a predictable schedule

Sync SHALL push staged records and pull remote records on a fixed interval while the app is running, on demand when the user asks, and once at launch. A failed cycle SHALL leave the local database untouched and SHALL be retried on the next cycle without user action.

#### Scenario: A capture reaches another device
- **WHEN** device A captures an item and completes a push, and device B completes a pull
- **THEN** device B holds the item with the same content, title, tags, and creation time

#### Scenario: A cycle that fails changes nothing
- **WHEN** the destination is unreachable partway through a cycle
- **THEN** no partial state is written locally, the previous history stays intact, and Settings shows the last successful sync time with the current error

#### Scenario: Sync is not a background service
- **WHEN** the app is not running
- **THEN** no sync occurs, and the next launch reconciles whatever accumulated while it was closed

### Requirement: Conflicts are recorded, not silently resolved

When two devices change the same record between cycles, SnipDock SHALL keep the most recently updated revision as the active one, retain the losing revision in the conflict log, and surface the count in Settings. Resolution SHALL NOT delete either revision.

#### Scenario: Concurrent edits keep both revisions
- **WHEN** device A and device B both edit the same item's title before either syncs
- **THEN** both devices converge on the later-updated title and the earlier one is retained in the conflict log

#### Scenario: The user can see what conflicted
- **WHEN** the conflict log is not empty
- **THEN** Settings shows how many conflicts occurred and lets the user open the retained revision and restore it as the active one

#### Scenario: A tombstone beats a concurrent edit
- **WHEN** one device deletes an item while another edits it in the same window
- **THEN** the item is removed on both devices and the edited revision is retained in the conflict log so it can be restored

### Requirement: The user can see and stop what sync is doing

Settings SHALL show whether sync is on, the destination, this device's name, the time of the last successful cycle, the number of records waiting to be pushed, and any current error. Turning sync off SHALL stop the loop immediately and SHALL NOT delete local items.

#### Scenario: Turning sync off keeps the history
- **WHEN** the user turns sync off
- **THEN** the loop stops, staged records remain staged for a later re-enable, and no local item is removed

#### Scenario: Leaving a sync group removes this device's footprint
- **WHEN** the user chooses to leave the sync group
- **THEN** SnipDock removes this device's records from the destination, clears the local staging tables, and leaves the local history intact

## Purpose

Defines every way content moves between SnipDock and the Android clipboard, and states plainly which of those the platform forbids, so the app never implies a capability it cannot have.

## ADDED Requirements

### Requirement: Automatic capture is not attempted on Android

The Android build SHALL NOT read the clipboard except when the user asks it to. It SHALL NOT poll the clipboard, run a foreground service to observe it, or request the accessibility service to reach it. The reason SHALL be stated in the app where a user would look for the missing feature.

#### Scenario: No background reading occurs
- **WHEN** the user copies text in another application
- **THEN** SnipDock records nothing, requests no permission, and starts no service

#### Scenario: The limitation is explained where it is felt
- **WHEN** the user opens the Android Settings screen or an empty history
- **THEN** the app states that Android does not allow apps to read the clipboard in the background, and points to sharing and sync as the ways content arrives

### Requirement: Saving from the phone is an explicit act

SnipDock SHALL register as a share target for text and images. Content received through the share sheet SHALL be saved as an item, run through the same content detection and secret-detection paths as a desktop manual save, and be acknowledged without opening the full app.

#### Scenario: Text shared from another app is saved
- **WHEN** the user shares selected text to SnipDock from a browser
- **THEN** an item is created with the detected content type, and a confirmation names what was saved

#### Scenario: An image shared from another app is saved
- **WHEN** the user shares an image to SnipDock
- **THEN** the image is stored in the app's private image directory and an image item is created that references it

#### Scenario: Shared content that looks like a secret is protected
- **WHEN** shared text matches the secret patterns that mark an item private on the desktop
- **THEN** the item is stored as private, is masked in the list, and is excluded from sync

#### Scenario: Sharing does not require opening the app
- **WHEN** content is shared while SnipDock is not running
- **THEN** it is saved and confirmed without presenting the full interface

### Requirement: Copying an item out is one tap

Any item in the Android history SHALL be placeable on the system clipboard with a single tap, with a brief confirmation. For image items, the image itself SHALL be placed on the clipboard, not its file path.

#### Scenario: Tapping a text item copies it
- **WHEN** the user taps a text item in the history
- **THEN** its content is on the system clipboard, ready to paste into another app, and a brief confirmation appears

#### Scenario: An image item copies as an image
- **WHEN** the user copies an image item
- **THEN** the receiving application pastes the picture, not a file path

#### Scenario: Copying a private item requires confirmation
- **WHEN** the user copies an item marked private
- **THEN** the app asks for confirmation before placing the content on the clipboard

### Requirement: The latest item is reachable without opening the app

SnipDock SHALL provide a Quick Settings tile that copies the most recent non-private item to the clipboard from the notification shade.

#### Scenario: The tile copies the newest item
- **WHEN** the user activates the SnipDock tile
- **THEN** the most recent non-private item is on the clipboard and the tile reports what was copied

#### Scenario: The tile skips private items
- **WHEN** the most recent item is marked private
- **THEN** the tile copies the most recent non-private item instead and says so

#### Scenario: The tile with an empty history does nothing surprising
- **WHEN** the tile is activated with no items stored
- **THEN** the clipboard is left unchanged and the tile reports that there is nothing to copy

### Requirement: Sensitive content is not left on the clipboard indefinitely

When the user copies an item that was detected as sensitive, SnipDock SHALL mark the clipboard entry so the platform excludes it from clipboard previews and history where the API allows, and SHALL respect the existing auto-clear-sensitive setting by clearing the clipboard after the configured interval while the app is running.

#### Scenario: A sensitive copy is hidden from the system preview
- **WHEN** an item detected as sensitive is copied
- **THEN** the clipboard entry is flagged so the system does not display its content in previews or clipboard history

#### Scenario: The auto-clear interval applies
- **WHEN** the auto-clear-sensitive setting is set and a sensitive item was copied while the app is in the foreground
- **THEN** the clipboard is cleared after the configured interval if it still holds that content

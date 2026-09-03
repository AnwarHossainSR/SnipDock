## Purpose

Defines the Android application: which of SnipDock's capabilities exist on a phone and which do not, how the single-activity shell is navigated, and how a phone-shaped history screen behaves offline and in the background.

## ADDED Requirements

### Requirement: The platform capability matrix is explicit

SnipDock SHALL document, and the app SHALL reflect, which capabilities exist per platform. The Android build SHALL NOT present a control for a capability the platform cannot provide. The Android build SHALL exclude: background clipboard capture, direct paste into another application, global shortcuts, the Quick Paste overlay window, the system tray, launch at login, the localhost CLI endpoint, and the in-app updater.

#### Scenario: An excluded capability has no control
- **WHEN** the Settings screen is rendered on Android
- **THEN** no toggle, panel, or hint refers to clipboard tracking, global shortcuts, Quick Paste, the tray, autostart, or the CLI

#### Scenario: A shared capability keeps its behavior
- **WHEN** search, tags, projects, favourites, pinning, or retention are used on Android
- **THEN** they behave as the existing desktop specs require, against the same local database

#### Scenario: The desktop build is unaffected
- **WHEN** the desktop application is built
- **THEN** every capability it had before this change is still present and unchanged

### Requirement: The core builds for Android

`snipdock_lib` SHALL compile for `aarch64-linux-android` and `armv7-linux-androideabi` with the desktop-only dependencies excluded by target. Storage, migrations, encryption, content detection, and formatting SHALL behave identically on Android and desktop, and their tests SHALL be part of the same suite.

#### Scenario: A mobile build excludes desktop-only crates
- **WHEN** the crate is built for an Android target
- **THEN** the tray, global-shortcut, single-instance, window-state, CLI-server, and system-metrics dependencies are not compiled in, and the build succeeds

#### Scenario: Stored data is identical across platforms
- **WHEN** the same database file is opened by a desktop build and an Android build
- **THEN** the schema version, the items, and their content hashes match, and neither build migrates the other's data destructively

### Requirement: The app is one activity with a phone navigation model

The Android app SHALL present a single activity hosting a bottom navigation between History, Search, and Settings. The system back gesture SHALL move up the navigation stack and SHALL close the app from the root, never leaving a blank view.

#### Scenario: Back from a detail view returns to the list
- **WHEN** the user opens an item's detail view and performs the back gesture
- **THEN** the list is restored with its scroll position and the previously selected item still visible

#### Scenario: Back at the root closes the app
- **WHEN** the user performs the back gesture on the History root
- **THEN** the app moves to the background without an intermediate blank screen

#### Scenario: Rotation and process death restore the view
- **WHEN** the device is rotated, or the process is recreated after being evicted
- **THEN** the current screen, query, and scroll position are restored

### Requirement: The history screen is built for a phone

The Android history SHALL render one item per row with its content, type, source, and relative time, SHALL page as the user scrolls rather than through pager controls, and SHALL provide the primary actions — copy, pin, favourite, delete — without requiring a hover state or a keyboard.

#### Scenario: Rows are reachable by touch alone
- **WHEN** the history is rendered on a phone
- **THEN** every action has a touch target of at least 48dp and none of them require a pointer, hover, or physical keyboard

#### Scenario: Scrolling loads more history
- **WHEN** the user reaches the end of the loaded rows
- **THEN** the next page is fetched and appended without losing scroll position

#### Scenario: An empty history explains itself
- **WHEN** the app is opened with no items and sync not yet configured
- **THEN** the screen explains that history arrives from a paired desktop and offers the sync setup, rather than showing an empty list

### Requirement: The app works offline and survives being backgrounded

The Android app SHALL read and write its local database with no network available. Sync SHALL run only while the app is in the foreground; the app SHALL NOT hold a foreground service, a wake lock, or a background-execution exemption.

#### Scenario: Offline use is fully functional
- **WHEN** the device has no connectivity
- **THEN** history, search, copy, and edit all work against local data, and the sync status shows that it is waiting for a connection

#### Scenario: Returning to the app reconciles
- **WHEN** the app returns to the foreground after being closed or evicted
- **THEN** a sync cycle runs once and the history reflects whatever other devices did meanwhile

#### Scenario: Nothing runs while the app is away
- **WHEN** the app is in the background
- **THEN** no polling, capture, or network activity occurs on its behalf

### Requirement: Device storage is private to the app

The database, image files, and sync credentials SHALL live in the app's private storage. They SHALL NOT be written to shared or external storage, and SHALL NOT be included in Android cloud backup.

#### Scenario: Data is not readable by other apps
- **WHEN** the app has written history and images
- **THEN** the files live under the app's private directory and no other application can read them without root

#### Scenario: Uninstalling removes local data
- **WHEN** the app is uninstalled
- **THEN** the local database and images are removed with it, and no copy is left in cloud backup

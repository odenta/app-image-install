# GUI Specification

## Purpose

Define the Electrobun GUI: a live list of installed AppImages with Add (native file dialog), Launch, and Remove actions — behaviorally identical to the CLI because both share the same core modules.

## Requirements

### Requirement: Installed list

The GUI SHALL display a live list of installed AppImages (icon + name), refreshed after every mutating action.

#### Scenario: Reflects install

- **WHEN** an install completes through the GUI
- **THEN** the new app appears in the list without restarting the window

### Requirement: Add via native dialog

An "Add AppImage…" action SHALL open a native file picker filtered to AppImage files (multiple selection allowed) and run the same install pipeline as the CLI, surfacing pipeline warnings (e.g. fallback entry) to the user.

#### Scenario: Picker cancel

- **WHEN** the user cancels the file dialog
- **THEN** nothing changes and no error is shown

### Requirement: Launch and Remove

Each row SHALL offer Launch (runs the AppImage detached) and Remove (asks for confirmation), delegating to the same core operations as the CLI.

#### Scenario: Remove confirms

- **WHEN** the user clicks Remove on a row
- **THEN** a confirmation appears first, and only on confirmation is the app removed and the list refreshed

### Requirement: Shared core

The GUI SHALL perform all integration work through the same core modules as the CLI and SHALL NOT reimplement integration logic in the webview.

#### Scenario: Behavior parity

- **WHEN** the same AppImage is installed via GUI and via CLI
- **THEN** both produce the same files, entries, and icons

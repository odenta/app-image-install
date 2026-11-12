# List Specification

## Purpose

Define how the tool reports the installed-app set: derived live from the filesystem, with name, version, and image path for each app.

## Requirements

### Requirement: Derived live from filesystem

The system SHALL derive the installed-app set at call time from storage (images in `~/.local/Apps` matched with their desktop entries), sorted by name, showing each app's name, version, and image path.

#### Scenario: Version shown when known

- **WHEN** an installed app's desktop entry contains `X-AppImage-Version=1.2.3`
- **THEN** list shows version `1.2.3` for that app

#### Scenario: Version absent

- **WHEN** an installed app's entry has no `X-AppImage-Version`
- **THEN** list shows the version field as empty for that app

#### Scenario: Nothing installed

- **WHEN** no AppImages are installed
- **THEN** list exits 0 with an empty result set

### Requirement: Name and path always present

Every listed app SHALL have a display name (entry Name, falling back to the appId) and the absolute path of its image.

#### Scenario: Entry unreadable

- **WHEN** an image exists but its entry cannot be parsed
- **THEN** the app is still listed with its appId as the name and a warning is emitted on stderr

#### Scenario: Junk filenames tolerated

- **WHEN** the applications directory contains files whose names cannot yield a valid entry id (e.g. a file literally named `.desktop`)
- **THEN** those files are ignored and the remaining apps are still listed

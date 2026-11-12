# Remove Specification

## Purpose

Define how an installed AppImage is completely removed — image, desktop entry, and icons — matched by a user-supplied name, and how partial/absent state is handled.

## Requirements

### Requirement: Full cleanup

The system SHALL delete the AppImage, its desktop entry, and its extracted icons for the app matching `<name>` (case-insensitive match against the entry's Name or the appId), then refresh icon and menu caches.

#### Scenario: Remove existing app

- **WHEN** `remove codium` runs and an installed app with id `codium` (Name "VSCodium") exists
- **THEN** `codium.appimage`, `codium.desktop`, and all `hicolor/*/apps/codium.*` icons are removed, and the report lists what was removed

#### Scenario: Not found

- **WHEN** `remove nope` runs and no installed app matches
- **THEN** the command exits non-zero with a not-found error and nothing is modified

#### Scenario: Partial leftovers tolerated

- **WHEN** the image exists but the desktop entry is already missing
- **THEN** remove still succeeds, deletes what exists, and reports the entry as already absent

# Install Specification

## Purpose

Define how AppImages are copied into storage and integrated into the desktop environment (desktop entry, icons, menus) — including collision policy, source handling, failure rollback, and fallbacks for AppImages lacking embedded metadata.

## Requirements

### Requirement: Copy to storage

The system SHALL copy the source AppImage into `~/.local/Apps/` named `<appId>.appimage` (appId = the embedded desktop-entry ID), make it executable, and leave the source file untouched by default.

#### Scenario: Normal install from Downloads

- **WHEN** the user installs `~/Downloads/codium-1.96.2.AppImage` whose embedded entry is `codium.desktop`
- **THEN** `~/.local/Apps/codium.appimage` exists, is executable, and the file in Downloads is byte-identical and still present

### Requirement: Delete source after success

With `--delete-source`, the system SHALL delete the source file only after the whole install (image + desktop entry + icons + cache refresh) completed without error.

#### Scenario: Failed install leaves source intact

- **WHEN** copying succeeds but desktop-entry writing fails
- **THEN** the source file still exists, the copied image is rolled back, and no partial desktop entry or icons remain

### Requirement: Collision refusal

When the target image path already exists, the system SHALL refuse with a collision error naming the existing app, unless `--force` is given.

#### Scenario: Refuse without force

- **WHEN** an install targets an existing `<appId>.appimage` and no `--force` is given
- **THEN** the command exits non-zero with an error naming the existing app, and nothing is modified

#### Scenario: Force replaces fully

- **WHEN** the same install runs with `--force`
- **THEN** the previous install's image, desktop entry, and icons are removed first, and the new install proceeds

#### Scenario: Failed forced install preserves the previous install

- **WHEN** `codium.appimage` is already installed and a forced install of a new `codium` AppImage fails at any point
- **THEN** the previously installed image, desktop entry, and icons are still present and unchanged

### Requirement: Desktop integration

The system SHALL write `~/.local/share/applications/<appId>.desktop` from the embedded desktop file (Name, Comment, Categories preserved; `Exec=` set to the installed image path), install extracted icons into `~/.local/share/icons/hicolor/<size>/apps/<appId>.<ext>`, and refresh icon and menu caches.

#### Scenario: Entry and icons present after install

- **WHEN** install of an AppImage with embedded `codium.desktop` and PNG icons completes
- **THEN** the desktop entry exists with `Exec=` pointing at `~/.local/Apps/codium.appimage`, icons exist under hicolor, and the app appears in the desktop menu after cache refresh

### Requirement: Fallback entry and icon

If the AppImage has no embedded desktop file, the system SHALL generate a minimal entry (Name derived from the filename) and use a generic icon, reporting a warning for each fallback taken.

#### Scenario: Missing embedded entry

- **WHEN** installing an AppImage that extracts without any `.desktop` file
- **THEN** a minimal `<appId>.desktop` is still written, a generic icon is used, and the user sees a warning describing both fallbacks

### Requirement: Already in place

If the source file already resides at the target path, the system SHALL skip copying and only (re)build integration, and SHALL NOT delete the source even with `--delete-source`.

#### Scenario: Re-integrate in-place image

- **WHEN** installing `~/.local/Apps/foo.appimage` itself
- **THEN** no copy occurs, integration is (re)generated, and the file remains

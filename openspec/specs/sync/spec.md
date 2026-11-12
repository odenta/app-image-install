# Sync Specification

## Purpose

Define how the tool reconciles storage with desktop integration: regenerating missing entries/icons for stored images and pruning orphaned entries/icons, without ever touching foreign desktop entries.

## Requirements

### Requirement: Regenerate missing integration

The system SHALL, for every `<appId>.appimage` in storage without a matching desktop entry, re-extract metadata from the image and regenerate the desktop entry and icons.

#### Scenario: Entry missing for existing image

- **WHEN** `foo.appimage` exists but `foo.desktop` does not
- **THEN** sync regenerates `foo.desktop` and icons from the image's embedded metadata and lists `foo` under regenerated

### Requirement: Prune orphaned integration

The system SHALL remove desktop entries and icons under its managed locations that have no matching image in storage, and report each pruned item.

#### Scenario: Orphan pruned

- **WHEN** `foo.desktop` exists but `foo.appimage` is absent from storage
- **THEN** sync removes `foo.desktop` and any `hicolor/*/apps/foo.*` icons and lists them under pruned

#### Scenario: Foreign entries untouched

- **WHEN** the applications directory contains entries the tool did not create (Exec pointing outside storage)
- **THEN** sync leaves them untouched

#### Scenario: Nothing to do

- **WHEN** every image has an entry and no orphans exist
- **THEN** sync reports empty regenerated and pruned lists and exits 0

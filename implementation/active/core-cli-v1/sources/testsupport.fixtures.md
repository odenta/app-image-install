---
id: testsupport.fixtures
kind: source-design
contract: core.appimage
contract_revision: 1
targets:
  - tests/fixtures/make-fixture-appimage.ts
  - tests/fixtures/appdirs/valid/**
  - tests/fixtures/appdirs/no-desktop/**
  - tests/fixtures/appdirs/no-icons/**
depends_on: []
exports:
  - makeFixtureAppImage
  - FIXTURE_APPDIRS
verification:
  - used by tests/core/appimage.test.ts and installer/registry tests
  - just check
---

# Fixture AppImages

## Responsibility

Provide hermetic "AppImages" for tests without downloading runtimes or needing FUSE: executable
shell scripts that honour `--appimage-extract` by copying a committed AppDir tree into
`./squashfs-root`, plus committed AppDir fixture trees.

## Implementation strategy

- `tests/fixtures/appdirs/<name>/` — committed trees shaped like extracted AppDirs:
  - `valid/`: `usr/bin/fake-app`, `codium.desktop` (Name=VSCodium, Categories, Comment,
    X-AppImage-Version=1.2.3), `usr/share/icons/hicolor/64x64/apps/codium.png` (tiny PNG),
    `usr/share/icons/hicolor/48x48/apps/codium.png`, root-level `.DirIcon` (PNG copy).
  - `no-desktop/`: binary + icon only, no `.desktop` anywhere.
  - `no-icons/`: `foo.desktop` only, no icon files.
- `makeFixtureAppImage(appdirName, destPath)`: writes an executable script:
  ```sh
  #!/bin/sh
  case "$1" in
    --appimage-extract)
      rm -rf squashfs-root
      mkdir -p squashfs-root
      cp -R "<abs appdir path>"/. squashfs-root/
      ;;
    *) echo "fake payload" ;;
  esac
  ```
  chmod 0o755. The absolute appdir path is baked in at generation time (tests resolve the repo
  root from `import.meta.dir`). A `garbage` variant: script that exits 1 for any arg (models an
  invalid AppImage).

## Invariants

- Fixtures never touch the network or require FUSE; `--appimage-extract` works in any cwd.

## Tests

- (Covered via consumers; no standalone test file.)

## Design rationale

Real ELF AppImage runtimes cannot be built hermetically in unit tests; the extract contract
surface (`<file> --appimage-extract` → `squashfs-root/`) is faithfully modelled, and the real
runtime path gets a manual smoke test before the GUI wave (blueprint risk #1).

## Open questions

None.

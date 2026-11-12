---
id: core.appimage.inspect
kind: source-design
contract: core.appimage
contract_revision: 1
targets:
  - src/core/appimage.ts
  - tests/core/appimage.test.ts
depends_on:
  - core.result.types
  - core.desktop.entry
  - core.icons.install
  - testsupport.fixtures
exports:
  - AppImageMetadata
  - AppImageError
  - inspectAppImage
verification:
  - tests/core/appimage.test.ts
  - just check
---

# AppImage reader

## Responsibility

Validate an AppImage, extract via its own `--appimage-extract`, and collect desktop entry +
icon candidates, per contract `core.appimage`.

## Implementation strategy

- Step 1: stat the file → `not-found` if absent; ensure exec bit via `chmod(path, 0o755)`
  (best-effort; failure → `not-executable`).
- Step 2: `rm -rf workDir/squashfs-root`, then spawn `<appImagePath> --appimage-extract` with
  `cwd: workDir`, capture stderr; non-zero exit or missing resulting `squashfs-root` →
  `extract-failed` (stderr tail, trimmed to last 500 chars).
- Step 3: locate `.desktop`: search AppDir root first (`squashfs-root/*.desktop`), then
  `squashfs-root/usr/share/applications/*.desktop`; first hit wins. Parse via
  `parseDesktopEntry(fileName sans .desktop, text)`. Unparseable/absent → `entry: null` (not an
  error — fallback is the installer's job).
- Step 4: icon candidates, best-first: all files under `**/icons/hicolor/<NxN>/apps/` sorted by
  numeric size descending; then other `usr/share/icons/**`; then root `.DirIcon` / `*.png|svg|xpm`.
  Build `ExtractedIcon[]` (absPath, relPath from `squashfs-root/`, lowercase ext; `.DirIcon` →
  `.png`).
- Step 5: `entryId = entry?.id ?? basename(appImagePath) with extension stripped`.
- Step 6: `rm -rf squashfs-root` in a `finally` so cleanup always runs.
- No FUSE, no payload execution beyond the runtime's extract path.

## Invariants

- Cleanup runs on every exit path (success, error, throw-wrapper).
- Deterministic ordering of icon candidates.

## Error handling

- Structured `AppImageError`; fixture garbage file → `extract-failed`, never a throw.

## Tests

- `valid` fixture → entry id `codium`, Name VSCodium, version 1.2.3, icons best-first with 64x64
  before 48x48, `.DirIcon` present in candidates.
- `no-desktop` fixture → `entry: null`, `entryId` from file name, icons found.
- `no-icons` fixture → `entry` parsed, `icons: []`.
- Garbage fixture → `extract-failed`.
- Missing path → `not-found`.
- After success, `workDir/squashfs-root` is gone.

## Design rationale

Keeping fallback decisions (null entry, empty icons) as data here — not errors — lets the
installer own user-facing warnings, one place.

## Open questions

None.

---
id: core.appimage
kind: module-contract
status: draft
revision: 1
architecture: core.appimage
dependencies:
  - core.result
  - core.desktop
---

# AppImage reader

## Responsibility

Read metadata out of an AppImage without executing it: validate the file, extract its embedded filesystem via `--appimage-extract` (no FUSE required), and collect the desktop entry and candidate icons.

## Public API

```typescript
export interface AppImageMetadata {
  readonly entry: import("./desktop.ts").DesktopEntryData | null;  // parsed embedded entry, null if none/unparseable
  readonly entryId: string;       // entry id when present, else derived from image file name
  readonly rawEntryText: string | null;
  readonly icons: readonly import("./icons.ts").ExtractedIcon[]; // candidate icons, best-first order
}

export type AppImageError =
  | { readonly kind: "not-found" }
  | { readonly kind: "not-executable"; readonly path: string }     // chmod failed
  | { readonly kind: "extract-failed"; readonly stderr: string }
  | { readonly kind: "no-appdir" };                                // extraction produced no recognizable root

export function inspectAppImage(
  appImagePath: string,
  workDir: string,
): Promise<Result<AppImageMetadata, AppImageError>>;
```

Behavior:
1. Verifies the file exists; ensures the execute bit (`chmod +x`, best-effort).
2. Runs `<appImage> --appimage-extract` with `workDir` as cwd (removing any pre-existing `workDir/squashfs-root` first).
3. Finds the single `.desktop` file at the AppDir root or under `usr/share/applications/` (first match wins); parses it via `core.desktop`.
4. Collects icon candidates in priority order: files under any `icons/hicolor/<size>/apps/` (size descending), then other `usr/share/icons/**`, then root-level `.DirIcon` / `*.png|svg|xpm`.
5. Cleans up `workDir/squashfs-root` before returning.

## Preconditions

- `appImagePath` absolute; `workDir` exists and is writable (caller's temp dir).
- The file may or may not be a valid AppImage — invalid files surface as `extract-failed`.

## Postconditions

- On success: `workDir` contains no `squashfs-root`; `entryId` is non-empty.
- `entry` is null iff no parseable embedded entry existed (caller generates fallback).
- `icons` may be empty (caller uses generic icon).

## Invariants

- Never executes the payload — only the runtime's own extract path.
- Deterministic for the same input file.

## State

- Stateless; `workDir` is caller-owned.

## Error semantics

- All extraction/validation failures are structured; nothing throws for bad input files.

## Dependencies

- `core.result`, `core.desktop`

## Performance

- One process spawn + one squashfs extraction per call (dominant cost, seconds at most).

## Acceptance criteria

- Inspecting a fixture AppImage (built in tests) returns its entry and at least one icon.
- A garbage file yields `extract-failed`, not a throw.
- No FUSE mount occurs (works in containers without /dev/fuse).

## Open questions

None.

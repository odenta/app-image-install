---
id: core.icons
kind: module-contract
status: draft
revision: 1
architecture: core.icons
dependencies:
  - core.result
---

# Icons

## Responsibility

Install extracted icon files into the hicolor icon theme under the user's data home, remove them again by appId, and refresh icon/menu caches best-effort.

## Public API

```typescript
export interface ExtractedIcon {
  readonly absPath: string;    // file inside the extraction workdir
  readonly relPath: string;    // path relative to extraction root (e.g. "usr/share/icons/hicolor/64x64/apps/foo.png", ".DirIcon", "foo.png")
  readonly ext: string;        // normalized: ".png" | ".svg" | ".xpm"
}

export interface InstalledIcon {
  readonly relTarget: string;  // e.g. "64x64/apps/codium.png"
  readonly absPath: string;    // installed file
}

export type IconError =
  | { readonly kind: "fs"; readonly op: string; readonly path: string; readonly cause: string }
  | { readonly kind: "unsupported-format"; readonly relPath: string };

export function installIcons(
  iconThemeDir: string,
  appId: string,
  icons: readonly ExtractedIcon[],
): Promise<Result<InstalledIcon[], IconError>>;

export function removeIcons(iconThemeDir: string, appId: string): Promise<Result<number, IconError>>;
// Returns count of removed files.

export function refreshCaches(): Promise<void>;
// Best-effort: runs gtk-update-icon-cache and kbuildsycoca6 when present on PATH.
// Never throws; failures are silently ignored (caches refresh on next login anyway).
```

Size mapping: `<size>` is taken from the path segment matching `^\d+x\d+$` (preferred, deepest match); `.svg` without a size segment maps to `scalable/apps`; icons at the extraction root (e.g. `.DirIcon`, top-level `.png`) map to `256x256/apps` as a pragmatic default. Target name is always `<appId><ext>`.

## Preconditions

- `appId` is a single safe path segment (violations are programmer errors).
- `icons` may be empty (install then is a no-op returning `[]`).

## Postconditions

- Each input icon is copied (not moved) to `iconThemeDir/<size>/apps/<appId><ext>`; existing targets are overwritten.
- `removeIcons` deletes every `iconThemeDir/*/apps/<appId>.*` regardless of which install created them.
- `refreshCaches` always resolves; it never rejects.

## Invariants

- Source extraction files are never mutated or deleted.
- Concurrent installs of different appIds do not interfere (disjoint targets).

## State

- Stateless.

## Error semantics

- Expected: filesystem errors, unsupported icon extensions (skipped with `unsupported-format`? No — contract: non-png/svg/xpm inputs are excluded from output and reported via error list only when no usable icon remains? Simplify: unsupported formats are filtered out silently; if nothing usable remains, returns ok([]) and the caller decides on fallback icon).

## Dependencies

- `core.result`

## Performance

- Linear in icon count; sizes are small (KBs).

## Acceptance criteria

- Icons from `usr/share/icons/hicolor/48x48/apps/foo.png` and root `.DirIcon` both land under predictable hicolor paths named by appId.
- `removeIcons` returns 0 when nothing was installed.
- `refreshCaches` on a system with neither tool resolves without error.

## Open questions

None.

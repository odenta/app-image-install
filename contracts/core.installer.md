---
id: core.installer
kind: module-contract
status: approved
revision: 1
architecture: core.installer
dependencies:
  - core.result
  - core.paths
  - core.appimage
  - core.desktop
  - core.icons
---

# Installer

## Responsibility

The install pipeline: validate input, copy the AppImage into storage under its normalized `<appId>.appimage` name, integrate it (desktop entry + icons), handle collision/`--force`/`--delete-source`, and roll back on failure.

## Public API

```typescript
export interface InstallOptions {
  readonly deleteSource?: boolean;  // default false
  readonly force?: boolean;         // default false
}

export interface InstallReport {
  readonly appId: string;
  readonly name: string;               // display name (entry Name, or fallback)
  readonly appImagePath: string;       // final storage path
  readonly entryPath: string;
  readonly icons: readonly import("./icons.ts").InstalledIcon[];
  readonly warnings: readonly string[];
  readonly sourceDeleted: boolean;
}

export type InstallError =
  | { readonly kind: "source-not-found"; readonly path: string }
  | { readonly kind: "invalid-appimage"; readonly cause: string }
  | { readonly kind: "collision"; readonly appId: string; readonly existingPath: string }
  | { readonly kind: "fs"; readonly op: string; readonly path: string; readonly cause: string };

export function installAppImage(
  sourcePath: string,
  paths: XdgPaths,
  opts: InstallOptions,
): Promise<Result<InstallReport, InstallError>>;
```

Pipeline (all steps via core modules):
1. Ensure paths; check source exists.
2. Inspect metadata in a fresh temp workdir (`core.appimage`) — needed before copy to learn `appId`.
3. Collision check: if `paths.appsDir/<appId>.appimage` exists and `!opts.force` → `collision`. If `force`, run `core.remove`-equivalent cleanup first (installer inlines image+entry+icons removal; it does not import `core.remove` to keep the DAG shallow — see open question).
4. Copy source to `appsDir/<appId>.appimage`, `chmod 0755`. If source already equals the target path, skip the copy.
5. Render entry: parsed entry + overrides `{ exec: appImagePath, icon: appId }`, or `fallbackEntry` when `entry` is null (warning recorded). Icon fallback (no usable icons) records a warning; entry `Icon=` then points at a generic theme icon.
6. Write entry, install icons, refresh caches.
7. If `deleteSource` and the source was copied (not in-place): delete source; any deletion failure is a warning, not an error.
8. On failure at any point after copy: roll back copied image, written entry, and installed icons.

## Preconditions

- `paths` from `core.paths.ensurePaths` (or ensured inside step 1).
- `sourcePath` may point anywhere, including already inside `appsDir`.

## Postconditions

- Success: image executable at storage, entry written with `Exec=` = image path, icons installed, caches refreshed; report complete.
- Every warning in the report corresponds to a fallback actually taken.
- No partial installs remain after an error result (rollback complete).
- In `--force` mode, the new install is staged aside and only swapped in after every
  step succeeds; if any step fails, the previous install's image, entry, and icons are
  preserved unchanged.

## Invariants

- Source file is never modified, moved, or deleted unless `deleteSource` and success.
- No FUSE mount is required at any point.

## State

- Stateless; uses a fresh `mkdtemp` workdir per call, removed on all paths.

## Error semantics

- Structured `InstallError`; nothing throws for bad input files or full disks (`fs`).

## Dependencies

- `core.result`, `core.paths`, `core.appimage`, `core.desktop`, `core.icons`

## Performance

- Dominated by copy + extraction; acceptable for interactive CLI/GUI use.

## Acceptance criteria

- Fresh install of a fixture AppImage yields image + entry + icons, exit ok.
- Collision without force errors and changes nothing; with force, previous artifacts are gone.
- Failure injected after copy (e.g. unwritable applications dir) leaves the tree as before and keeps the source.
- `--delete-source` leaves source intact on failure, removes it on success.
- Force mode: inject a failure after staging (unwritable applications dir) while an old
  install exists → old image, entry, and icons are byte-identical afterwards.

## Open questions

- Force-cleanup currently inlined in installer vs. importing `core.remove` (would add `core.remove` to the DAG). Decide at blueprint time; contract surface unaffected.

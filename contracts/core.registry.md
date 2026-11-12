---
id: core.registry
kind: module-contract
status: draft
revision: 1
architecture: core.registry
dependencies:
  - core.result
  - core.paths
  - core.appimage
  - core.desktop
  - core.icons
---

# Registry

## Responsibility

Derive the installed-app set live from the filesystem, and implement `sync`: regenerate missing integration for stored images and prune orphaned entries/icons.

## Public API

```typescript
export interface InstalledApp {
  readonly appId: string;
  readonly name: string;           // entry Name; appId when entry missing/unparseable
  readonly version: string | null; // X-AppImage-Version, null if absent
  readonly appImagePath: string;
  readonly entryPath: string;      // applicationsDir/<appId>.desktop
}

export type RegistryError = { readonly kind: "fs"; readonly op: string; readonly path: string; readonly cause: string };

export function listInstalled(paths: XdgPaths): Promise<Result<InstalledApp[], RegistryError>>;
// Scans appsDir for *.appimage / *.AppImage, matches each with applicationsDir/<appId>.desktop.
// Sorted by name (locale-independent, case-insensitive). Entry absent => still listed (name=appId).

export interface SyncReport {
  readonly regenerated: readonly string[];  // appIds re-integrated
  readonly pruned: readonly string[];       // entry/icon targets removed
}

export function sync(paths: XdgPaths): Promise<Result<SyncReport, RegistryError>>;
// Regenerate: for every stored image without a readable entry, re-inspect and rebuild entry+icons.
// Prune: for every entry in applicationsDir whose id has no stored image AND whose Exec=
// points inside paths.storageRoot (i.e. the tool manages it), remove the entry and its icons.
// Entries whose Exec points elsewhere (foreign) are never touched.
```

## Preconditions

- `paths` ensured. Storage may be empty.

## Postconditions

- `listInstalled` reflects the filesystem at call time; never cached.
- After a successful `sync`, every stored image has an entry, and no managed entry lacks an image.

## Invariants

- `sync` only removes entries it manages (Exec inside `storageRoot`); foreign entries are untouched.
- Matching is by appId in both directions; never by fuzzy name.

## State

- Stateless.

## Error semantics

- Filesystem failures are structured `RegistryError`; per-item problems (one corrupt image) are skipped and reported via `pruned`/`regenerated` semantics? No — a corrupt image during regeneration yields an fs-level error? Contract: corrupt images are skipped with the appId omitted from regenerated; sync continues (resilience over atomicity). The CLI surfaces a warning.

## Dependencies

- `core.result`, `core.paths`, `core.appimage`, `core.desktop`, `core.icons`

## Performance

- Linear in stored images; regeneration cost = one extraction each (acceptable; sync is explicit).

## Acceptance criteria

- List after installing fixtures shows names, versions, paths, sorted.
- Sync with a deleted entry regenerates it; sync with a deleted image prunes entry+icons; foreign entries survive.
- Empty storage: both functions succeed with empty results.

## Open questions

None.

---
id: core.paths
kind: module-contract
status: approved
revision: 1
architecture: core.paths
dependencies:
  - core.result
---

# Paths

## Responsibility

Resolve the XDG storage locations the tool manages and create them on demand. Pure resolution, isolated from effects except `ensurePaths`.

## Public API

```typescript
export interface XdgPaths {
  readonly appsDir: string;          // <dataHome-local>/Apps (AppImages)
  readonly applicationsDir: string;  // <dataHome>/applications (desktop entries)
  readonly iconThemeDir: string;     // <dataHome>/icons/hicolor
  readonly storageRoot: string;      // appsDir's parent, for managed-entry checks
}

export interface PathOverrides {
  readonly appsDir?: string;
  readonly applicationsDir?: string;
  readonly iconThemeDir?: string;
  readonly storageRoot?: string;
  readonly homeDir?: string;         // test hook; defaults to os.homedir()
  readonly dataHome?: string;        // test hook; defaults to $XDG_DATA_HOME or ~/.local/share
}

export type PathsError = { readonly kind: "mkdir-failed"; readonly path: string; readonly cause: string };

export function resolvePaths(overrides?: PathOverrides): XdgPaths;
export function ensurePaths(paths: XdgPaths): Promise<Result<void, PathsError>>;
```

Resolution defaults (no overrides): `applicationsDir = $XDG_DATA_HOME/applications` or `~/.local/share/applications`; `iconThemeDir = <dataHome>/icons/hicolor`; `appsDir = ~/.local/Apps`; `storageRoot = ~/.local/Apps`.

## Preconditions

- `resolvePaths` may be called with any subset of overrides; unset fields fall back to defaults.

## Postconditions

- `resolvePaths` never performs I/O and never throws on odd environment variables (empty/relative values are ignored).
- `ensurePaths` creates `appsDir`, `applicationsDir`, and `iconThemeDir` (plus intermediates, mode `0755`). Existing directories are not an error.

## Invariants

- Returned paths are absolute, with no trailing separators, regardless of environment quirks.
- `resolvePaths` is deterministic for identical inputs and environment.

## State

- Stateless; reads environment and home directory only.

## Error semantics

- The only expected failure is directory creation (`mkdir-failed`).

## Dependencies

- `core.result`

## Performance

- O(1); one stat per directory in `ensurePaths`.

## Acceptance criteria

- With `XDG_DATA_HOME` set, applications and icons resolve under it while `appsDir` stays at `~/.local/Apps`.
- Overrides produce exactly the given paths (tests use temp dirs).
- `ensurePaths` on an existing tree succeeds.

## Open questions

None.

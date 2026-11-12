---
id: core.paths.resolve
kind: source-design
contract: core.paths
contract_revision: 1
targets:
  - src/core/paths.ts
  - tests/core/paths.test.ts
depends_on:
  - core.result.types
exports:
  - XdgPaths
  - PathOverrides
  - PathsError
  - resolvePaths
  - ensurePaths
verification:
  - tests/core/paths.test.ts
  - just check
---

# Paths

## Responsibility

Resolve XDG storage locations (pure) and create them (effect), per contract `core.paths`.

## Implementation strategy

- `resolvePaths(overrides)`: compute `homeDir` (`overrides.homeDir` ?? `os.homedir()`),
  `dataHome` (`overrides.dataHome` if absolute, else `$XDG_DATA_HOME` if absolute, else
  `<homeDir>/.local/share`). Build defaults from those; apply per-field overrides last
  (overrides win unconditionally). Normalize with `path.resolve` and strip trailing separators.
- `ensurePaths`: `mkdir(..., { recursive: true, mode: 0o755 })` for `appsDir`,
  `applicationsDir`, `iconThemeDir`; map thrown errors to `mkdir-failed` with `cause:
  String(err)`. Reuse `Result` helpers.
- Empty or relative `XDG_DATA_HOME`/`dataHome` values are ignored (fall back), never joined raw.

## Invariants

- `resolvePaths` performs no I/O and never throws (defensive `String()` on env values).
- Absolute-path guarantee: run every result through `path.resolve` with the resolved home as base.

## Error handling

- Only expected failure is `mkdir-failed`; no throws cross the boundary.

## Tests

- Defaults with/without `XDG_DATA_HOME` (set/restore env in test).
- Each override field wins; `appsDir` stays at `~/.local/Apps` unless overridden.
- Empty/relative `XDG_DATA_HOME` ignored.
- `ensurePaths` creates nested dirs in a temp home; second call succeeds (idempotent).
- Failure injection: `ensurePaths` with a file blocking the path → `mkdir-failed`.

## Design rationale

Overridable paths (never env-only) are what make every higher module testable against temp dirs.

## Open questions

None.

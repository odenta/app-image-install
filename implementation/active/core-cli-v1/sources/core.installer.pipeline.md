---
id: core.installer.pipeline
kind: source-design
contract: core.installer
contract_revision: 1
targets:
  - src/core/installer.ts
  - tests/core/installer.test.ts
depends_on:
  - core.appimage.inspect
exports:
  - InstallOptions
  - InstallReport
  - InstallError
  - installAppImage
verification:
  - tests/core/installer.test.ts
  - just check
---

# Installer pipeline

## Responsibility

Orchestrate the whole install with collision policy, copy, integration, `--delete-source`,
warnings, and rollback, per contract `core.installer`.

## Implementation strategy

- `mkdtemp` workdir per call (under `os.tmpdir()`); `finally: rm -rf`.
- Step order per contract: ensure paths → source exists → `inspectAppImage(source, workdir)` →
  collision check (`appsDir/<appId>.appimage` exists && !force → `collision`; force → inline
  cleanup of that appId's image/entry/icons) → copy (skip when source path === target path;
  `fs.copyFile` then `chmod 0o755`) → build entry data:
  - entry parsed → `renderDesktopEntry(entry, { exec: targetPath, icon: appId })`;
  - entry null → `fallbackEntry(appId, basename(source))` + warning "no embedded desktop entry;
    generated fallback";
  - icons empty → warning "no icons found; using generic icon" and `Icon=` set to a generic
    theme name (`application-x-executable`).
- Write entry (`core.desktop.writeEntry`), `installIcons`, `refreshCaches`.
- `--delete-source` only when a copy happened and everything succeeded; deletion failure →
  warning, not error.
- Rollback: track completed steps (copied image path, written entry id, installed icons); on
  any later failure, remove them best-effort before returning the error. Rollback failures are
  swallowed (original error wins).

## Invariants

- Source never mutated unless `deleteSource` + full success.
- No partial state after an error result.

## Error handling

- Structured `InstallError`; nothing throws for bad inputs or full disks.

## Tests

- Happy path with `valid` fixture: files exist, entry Exec points at target, report complete.
- Collision refuse / force-replaces (old icons gone).
- Failure injection: make `applicationsDir` read-only after copy? Simpler: pre-create
  `applicationsDir/<appId>.desktop` as a **directory** so writeEntry fails → rollback leaves
  no image, source intact.
- `--delete-source` keeps source on failure, removes on success.
- In-place install (source already the target path): no copy, no delete-source effect.
- `no-desktop` fixture → fallback entry + warnings; `no-icons` → generic-icon warning.

## Design rationale

Force-cleanup is inlined (not via `core.remove`) per the contract's open question: it keeps the
installer dependency-light and avoids cross-module cycles; the duplication is two `rm` calls.

## Open questions

None.

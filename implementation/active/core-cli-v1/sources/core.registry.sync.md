---
id: core.registry.sync
kind: source-design
contract: core.registry
contract_revision: 1
targets:
  - src/core/registry.ts
  - tests/core/registry.test.ts
depends_on:
  - core.appimage.inspect
  - core.remove.app
exports:
  - InstalledApp
  - RegistryError
  - listInstalled
  - SyncReport
  - sync
verification:
  - tests/core/registry.test.ts
  - just check
---

# Registry

## Responsibility

Live filesystem-derived listing and reconciliation (`sync`), per contract `core.registry`.

## Implementation strategy

- `listInstalled`: enumerate images in `appsDir` (both `.appimage` and `.AppImage`, appId =
  basename sans final extension); read matching entry (`readEntry`); build `InstalledApp`
  (name = entry?.name ?? appId; version = entry?.version ?? null); skip entries that fail hard
  at fs level; sort by `name.toLowerCase()`. Images whose entry is missing/unparseable are
  still listed (name=appId) per list spec.
- `sync`:
  - Regenerate: for each image with no readable entry → `inspectAppImage(image, workdir)` and
    rebuild entry+icons exactly like the installer (render with overrides; fallback entry +
    warning to stderr? No — warnings are returned? Contract: sync continues; the CLI prints
    per-item warnings. `sync` signature has no warning channel, so regeneration problems on
    individual images are skipped (appId omitted from `regenerated`); the CLI compares images
    vs regenerated to warn. Hmm — simpler: sync collects and includes a `warnings` field?
    Contract's `SyncReport` has only regenerated/pruned. Resolution: follow contract exactly;
    corrupt-image detection by CLI via listInstalled afterwards is over-engineering. Instead:
    sync skips uninspectable images and the CLI prints a generic "some images could not be
    re-integrated" only if counts mismatch. Documented here as the interpretation.)
  - Prune: `listEntries(applicationsDir)`; an entry is managed iff its `Exec` (parsed raw via
    `readEntryRaw` helper — parse `Exec=` line directly) starts with `paths.storageRoot + "/"`.
    Managed entries with no image of the same appId → `removeEntry` + `removeIcons`; collect
    pruned appIds. Foreign entries untouched.
  - `refreshCaches` at the end.
- Shared private helpers for entry rendering reused from the same pattern as installer
  (duplicated ~10 lines; acceptable, or extract later — note in report).

## Invariants

- Prune only ever removes entries whose Exec points inside storageRoot.
- Matching strictly by appId.

## Error handling

- Structured `RegistryError` for fs failures; per-item resilience for corrupt images.

## Tests

- listInstalled: sorted, versions present/absent, entry-missing image listed by appId.
- sync: regenerate missing entry for seeded image (entry deleted); prune orphan entry+icons;
  foreign entry (Exec=/usr/bin/other) survives; empty storage → empty report.
- Corrupt image (garbage fixture renamed to `broken.appimage`) → sync succeeds, id omitted from
  regenerated.

## Design rationale

Exec-inside-storageRoot is the ownership marker because entry filenames alone cannot prove the
tool owns a foreign entry with a coincidental id.

## Open questions

None.

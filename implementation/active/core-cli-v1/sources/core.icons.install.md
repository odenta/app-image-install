---
id: core.icons.install
kind: source-design
contract: core.icons
contract_revision: 1
targets:
  - src/core/icons.ts
  - tests/core/icons.test.ts
depends_on:
  - core.result.types
exports:
  - ExtractedIcon
  - InstalledIcon
  - IconError
  - installIcons
  - removeIcons
  - refreshCaches
verification:
  - tests/core/icons.test.ts
  - just check
---

# Icons

## Responsibility

Copy extracted icons into the hicolor theme keyed by appId, remove them, and best-effort cache
refresh, per contract `core.icons`.

## Implementation strategy

- Size mapping (`mapTargetRelPath(relPath)`): prefer the deepest path segment matching
  `^\d+x\d+$` → `<size>/apps/`; `.svg` without size segment → `scalable/apps/`; otherwise
  (root-level `.png`/`.xpm`/`.DirIcon`) → `256x256/apps/`. Target name `<appId><ext>` where ext
  is normalized lowercase; `.DirIcon` (no extension) → `.png`.
- `installIcons`: filter `icons` to supported extensions (`.png`, `.svg`, `.xpm`); copy each to
  `iconThemeDir/<mapped>` (mkdir recursive first); overwrites allowed. Collect `InstalledIcon[]`.
- `removeIcons`: glob `iconThemeDir/*/apps/<appId>.*`; delete matches; return count. Never fails
  on absent files.
- `refreshCaches`: for each of `gtk-update-icon-cache`, `kbuildsycoca6`: if resolvable on PATH
  (`which` semantics via `Bun.which`), spawn detached with theme dir (gtk) / no args (kbuild)
  and ignore all outcomes. Always resolves immediately; never throws/rejects.

## Invariants

- Sources (extraction dir) are only read, never mutated.
- `appId` path-segment validation like `core.desktop`.

## Error handling

- `IconError` (`fs` with op/path/cause). Unsupported formats silently filtered per contract.

## Tests

- hicolor-path icons land at `<size>/apps/<appId>.png`; `.DirIcon` → `256x256/apps/...`;
  svg → `scalable/apps/...` when no size segment.
- Re-install overwrites; `removeIcons` count matches; second remove → 0.
- `refreshCaches` resolves with no cache tools on PATH (empty env variant).

## Design rationale

Best-effort cache refresh keeps the tool useful on minimal systems while never blocking on
KDE/GTK tooling quirks.

## Open questions

None.

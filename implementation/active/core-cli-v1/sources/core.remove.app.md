---
id: core.remove.app
kind: source-design
contract: core.remove
contract_revision: 1
targets:
  - src/core/remove.ts
  - tests/core/remove.test.ts
depends_on:
  - core.appimage.inspect
exports:
  - RemoveReport
  - RemoveError
  - removeApp
verification:
  - tests/core/remove.test.ts
  - just check
---

# Remove

## Responsibility

Remove one app completely (image + entry + icons) matched by query, per contract `core.remove`.

## Implementation strategy

- Enumerate `*.appimage`/`*.AppImage` in `paths.appsDir` (appId = basename sans extension).
- Match candidates: `appId.toLowerCase() === query.toLowerCase()` OR entry `Name.toLowerCase()`
  equals query (read each candidate's entry via `core.desktop.readEntry`; unreadable entry counts
  as name-miss only).
- Ambiguity: >1 match → `not-found` error whose message lists candidates (contract open
  question resolved this way; operator can refine).
- Execute: delete image (absent → `removedImage: false`), `removeEntry` (absent → false),
  `removeIcons` (count), then `refreshCaches`.
- Report exactly what existed and was removed.

## Invariants

- Only the matched appId's artifacts are touched; other files in appsDir are never deleted.
- Matching is exact (case-insensitive), never fuzzy.

## Error handling

- `not-found` (no or ambiguous match), structured `fs`.

## Tests

- Seed temp paths via installer-free setup: drop image + entry + icons manually (or reuse
  installer in test setup), then:
  - remove by appId and by Name (case-insensitive);
  - partial absence (entry pre-deleted) → success with false flags;
  - `nope` → not-found, nothing deleted;
  - two apps matching query → not-found listing both.

## Design rationale

Remove runs before installer in the DAG only because the installer's `--force` inline-cleanup
mirrors this logic; keeping them sibling-independent of each other avoids a cycle.

## Open questions

None.

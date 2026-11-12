---
id: core.desktop.groups
kind: source-design
contract: core.desktop
contract_revision: 2
targets:
  - src/core/desktop.ts
  - tests/core/desktop.test.ts
depends_on: []
exports:
  - DesktopEntryData
  - DesktopParseError
  - parseDesktopEntry
  - EntryOverrides
  - renderDesktopEntry
  - fallbackEntry
  - EntryFsError
  - readEntry
  - writeEntry
  - removeEntry
  - listEntries
verification:
  - tests/core/desktop.test.ts
  - just check
---

# Desktop entry revision 2 — group preservation

## Responsibility

Revise `core.desktop` per the gate-3-approved revision: entries with action groups (and any
other non-`[Desktop Entry]` groups) round-trip verbatim; `Type` is consumed by the parser so
the renderer's mandatory `Type=Application` never duplicates.

## Implementation strategy

- Parser collects groups: `main` (the `[Desktop Entry]` group, parsed as before) plus
  `otherGroups: { name: string, lines: readonly string[] }[]` captured **raw, verbatim**
  (every non-empty, non-comment line as-is, in order of appearance).
- `DesktopEntryData` gains `readonly otherGroups: readonly { name: string; lines: readonly string[] }[]`.
- `Type` becomes a known key: parsed, validated to be `Application` if present (non-Application
  values are still accepted but ignored — contract keeps rendering `Application`), never stored
  in `extra`.
- `renderDesktopEntry`: emit main group as before, then each other group as `[name]` followed
  by its verbatim lines.
- Round-trip guarantee: `parse → render → parse` preserves group content byte-for-byte
  (modulo the renderer's own main-group ordering).

## Invariants

- Unknown/duplicate-key semantics for the main group unchanged (first occurrence wins).
- Groups other than `[Desktop Entry]` are never interpreted, only preserved.

## Tests

- VSCodium-shaped entry: `Actions=` + `[Desktop Action new-empty-window]` group survives
  round-trip; rendered output has no duplicate `Type`.
- Rendered output for that entry passes `desktop-file-validate` when the tool is installed
  (skip, not fail, when absent).
- Existing parser/render/fs tests stay green (no regression).

## Design rationale

Menu validity of real-world entries outranks minimalism: losing action groups breaks
`desktop-file-validate` for a large class of real AppImages.

## Open questions

None.

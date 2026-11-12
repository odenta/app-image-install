---
id: core.desktop.entry
kind: source-design
contract: core.desktop
contract_revision: 1
targets:
  - src/core/desktop.ts
  - tests/core/desktop.test.ts
depends_on:
  - core.result.types
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

# Desktop entry

## Responsibility

Parse/render desktop entries (pure) and read/write/remove/list them under the applications dir
(effects), plus fallback entry generation, per contract `core.desktop`.

## Implementation strategy

- Parser: line-oriented state machine. Track current group (`[...]`); only keys inside
  `[Desktop Entry]` are recognized (other groups' keys are skipped). Comment lines (`#`) and
  blank lines skipped. Key/value split on first `=`; keys with locale suffix (`Name[de]`) and
  unknown keys land in `extra` (first occurrence wins). Known keys: `Name` (required →
  `missing-name` if absent/empty), `Exec`, `Icon`, `Comment`, `Categories` (split on `;`, drop
  empties), `Terminal` (`true` → true), `X-AppImage-Version`. Empty `[Desktop Entry]` group or
  text without any group → `empty-entry`.
- `renderDesktopEntry`: emit keys in stable order — `Type=Application`, `Name`, `Comment` (if
  present), `Exec` (override), `Icon` (override), `Categories` (joined `;` + trailing `;` when
  non-empty), `Terminal` (always emitted), then `extra` keys sorted, then `X-AppImage-Version`
  if present (also kept in `extra`? No: contract says `version` captured separately; render it
  explicitly and exclude from extra emission to avoid duplicates). Trailing newline.
- `fallbackEntry(appId, sourceFileName)`: strip final extension from `sourceFileName`, replace
  `[-_]` runs with single space, trim, collapse whitespace; use result as `name` (fallback to
  `appId` if empty).
- FS ops: `readEntry` (absent → `ok(null)`; parse errors → `err`), `writeEntry` (atomic-ish:
  write `<id>.desktop.tmp` then rename), `removeEntry` (absent → `ok(false)`), `listEntries`
  (read all `*.desktop`, skip+continue on individual parse/fs errors? Contract: structured error;
  for `listEntries`, one bad file is skipped — resilience for `list` spec's "entry unreadable"
  scenario; callers that need strictness use `readEntry`).

## Invariants

- `id` validated as single path segment (`/`, `..`, empty → throw = programmer error).
- No module-level state; parsers are pure functions of their input.

## Error handling

- Structured `DesktopParseError` / `EntryFsError`; no throws for malformed files.

## Tests

- Parse: full entry, locale keys, unknown keys preserved, missing Name, empty text, comments.
- Render: round-trip parse→render→parse preserves preserved fields; overrides win.
- Fallback: `Foo_Bar-1.2.3.AppImage` → Name `Foo Bar 1.2.3`; `x` → `x`.
- FS: write/read/remove/list round trip over temp dir; remove absent → `ok(false)`.

## Design rationale

Stable render order keeps entries diffable and tests deterministic; temp-then-rename avoids
truncated entries on crash.

## Open questions

None.

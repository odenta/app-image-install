---
id: core.desktop
kind: module-contract
status: approved
revision: 3
architecture: core.desktop
dependencies:
  - core.result
---

# Desktop entries

## Responsibility

Parse, render, write, read, list, and remove freedesktop desktop entries under the applications directory. Generate fallback entries for AppImages without embedded metadata. Pure parsing/rendering; effects confined to explicit read/write/remove/list functions.

## Public API

```typescript
export interface DesktopEntryData {
  readonly id: string;                              // file name without ".desktop"
  readonly name: string;                            // Name= (mandatory)
  readonly exec: string | null;                     // Exec=
  readonly icon: string | null;                     // Icon=
  readonly comment: string | null;                  // Comment=
  readonly categories: readonly string[];           // Categories= split on ";"
  readonly terminal: boolean;                       // Terminal=, default false
  readonly version: string | null;                  // X-AppImage-Version=, null if absent
  /** Non-[Desktop Entry] groups preserved verbatim (action groups etc.). */
  readonly otherGroups: readonly { readonly name: string; readonly lines: readonly string[] }[];
  /** All other keys, verbatim (including locale-suffixed variants). */
  readonly extra: Readonly<Record<string, string>>;
}

export type DesktopParseError =
  | { readonly kind: "empty-entry" }
  | { readonly kind: "missing-name"; readonly id: string };

export function parseDesktopEntry(id: string, text: string): Result<DesktopEntryData, DesktopParseError>;
// Known keys: Name (required), Exec, Icon, Comment, Categories, Terminal,
// X-AppImage-Version, Type (consumed: renderer owns Type=Application; never stored in extra).
// Duplicate keys keep the first occurrence. All keys inside [Desktop Entry] not listed above
// land in `extra`. Groups other than [Desktop Entry] are preserved verbatim in otherGroups
// (never interpreted).

export interface EntryOverrides {
  readonly exec: string;   // installed image path
  readonly icon: string;   // installed icon name or absolute icon path
}
export function renderDesktopEntry(data: DesktopEntryData, overrides: EntryOverrides): string;

export function fallbackEntry(appId: string, sourceFileName: string): DesktopEntryData;

/** Single-segment id check shared by all core modules (no '/', no '.', '..', or empty). */
export function isSafeEntryId(id: string): boolean;
// Name derived from sourceFileName: strip extension, replace [-_] with space, trim.

export type EntryFsError = { readonly kind: "fs"; readonly op: string; readonly path: string; readonly cause: string };

export function readEntry(applicationsDir: string, id: string): Promise<Result<DesktopEntryData | null, EntryFsError | DesktopParseError>>;
// null = file absent. Unparseable file => ok(null) + caller warning? No: unparseable => err(missing-name/empty-entry)? Spec: list treats unparseable as warning + fallback name; readEntry returns parse errors as error value.

export function writeEntry(applicationsDir: string, id: string, rendered: string): Promise<Result<void, EntryFsError>>;
export function removeEntry(applicationsDir: string, id: string): Promise<Result<boolean, EntryFsError>>; // false = was absent
export function listEntries(applicationsDir: string): Promise<Result<DesktopEntryData[], EntryFsError>>;
```

`renderDesktopEntry` emits a `[Desktop Entry]` group containing `Type=Application`, preserved
`Name`, `Comment`, `Categories`, `Terminal`, all `extra` keys, and `Exec`/`Icon` from overrides
(overrides win over parsed values); **key order is unspecified**, then each of `otherGroups`
verbatim (`[name]` + its lines). Ends with a trailing newline. If the input contains multiple
`[Desktop Entry]` groups, their lines are merged in order of appearance (first occurrence wins
per key). `listEntries` (and callers deriving ids from filenames) skip files whose derived id
is not a safe single path segment instead of throwing.

## Preconditions

- `id` is a single path segment: no `/`, no `..` (violations are programmer errors).
- `text` may be any string, including malformed INI.

## Postconditions

- Valid entry with `Name` parses to `DesktopEntryData` with all known keys captured and unknown keys preserved in `extra`.
- `parseDesktopEntry` then `renderDesktopEntry` with neutral overrides round-trips all preserved fields.
- `fallbackEntry` never fails and always yields a usable `name`.

## Invariants

- Parsing never throws; malformed lines are skipped, duplicate keys keep the first occurrence.
- No module-level state; all functions safe for concurrent use.

## State

- Stateless.

## Error semantics

- Expected failures: missing `Name`, empty `[Desktop Entry]` group, filesystem errors (structured `EntryFsError`).

## Dependencies

- `core.result`

## Performance

- Linear in entry text size; `listEntries` linear in number of entries.

## Acceptance criteria

- Parses entries with grouped keys, comments, and locale-suffixed keys (`Name[de]` lands in `extra`).
- Generated entry passes `desktop-file-validate` when available (manual check).
- Fallback entry for `Foo_Bar-1.2.3.AppImage` has Name `Foo Bar 1.2.3`? No: strip trailing version-ish suffix? — see open question.

## Open questions

- Fallback Name cleanup: strip extension only, or also trailing `-<version>`-like suffixes? Current contract: extension only (predictable); operator may refine.

---
id: core.remove
kind: module-contract
status: draft
revision: 1
architecture: core.remove
dependencies:
  - core.result
  - core.paths
  - core.desktop
  - core.icons
---

# Remove

## Responsibility

Remove one installed app completely: image, desktop entry, icons — matched by user-supplied name against entry Name or appId.

## Public API

```typescript
export interface RemoveReport {
  readonly appId: string;
  readonly removedImage: boolean;   // false if image was already absent
  readonly removedEntry: boolean;   // false if entry was already absent
  readonly removedIcons: number;
}

export type RemoveError =
  | { readonly kind: "not-found"; readonly query: string }
  | { readonly kind: "fs"; readonly op: string; readonly path: string; readonly cause: string };

export function removeApp(paths: XdgPaths, query: string): Promise<Result<RemoveReport, RemoveError>>;
```

Matching: gather candidate appIds from storage images; a candidate matches when `appId.toLowerCase() === query.toLowerCase()` or its entry `Name.toLowerCase() === query.toLowerCase()`. First match wins; ambiguous matches are an error? Contract: ambiguous is `not-found`-style error with the candidate list (see open question).

## Preconditions

- `paths` ensured.

## Postconditions

- Success: image gone (if present), entry removed, all `hicolor/*/apps/<appId>.*` gone, caches refreshed.
- Partial pre-existing absence (entry already gone) is not an error; the report reflects what was actually removed.

## Invariants

- Only the matched appId's artifacts are touched.
- Foreign entries/icons (different appId) are never affected.

## State

- Stateless.

## Error semantics

- `not-found` for no match; structured `fs` for failures. Never throws.

## Dependencies

- `core.result`, `core.paths`, `core.desktop`, `core.icons`

## Performance

- Linear in stored images; no extraction needed.

## Acceptance criteria

- `remove codium` matches appId `codium` and Name "VSCodium" (case-insensitive).
- Removing an app whose entry was manually deleted still removes image and icons.
- `remove nope` errors with not-found and changes nothing.

## Open questions

- Ambiguous query matching two apps: error listing candidates (current contract) vs. removing both. Recommend error.

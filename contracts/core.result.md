---
id: core.result
kind: module-contract
status: approved
revision: 1
architecture: core.result
dependencies: []
---

# Result

## Responsibility

Shared error-value type used by every core module. Expected failures are values, not exceptions.

## Public API

```typescript
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
export function ok<T>(value: T): Result<T, never>;
export function err<E>(error: E): Result<never, E>;
```

## Preconditions

- None. Works for any `T`, `E`.

## Postconditions

- `ok(v)` produces `{ ok: true, value: v }`; `err(e)` produces `{ ok: false, error: e }`.
- No wrapping, mutation, or validation of payloads.

## Invariants

- Pure and total. Never throws.
- `Result` values are discriminated by `ok`, enabling exhaustive narrowing.

## State

- Stateless. No module-level mutable state.

## Error semantics

- This module defines the mechanism; it introduces no error types of its own.

## Performance

- O(1).

## Acceptance criteria

- Narrowing on `ok` refines to `value`; narrowing on `!ok` refines to `error`.
- `ok`/`err` usable as discriminated-union constructors in all core modules.

## Open questions

None.

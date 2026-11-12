---
id: core.result.types
kind: source-design
contract: core.result
contract_revision: 1
targets:
  - src/core/result.ts
depends_on: []
exports:
  - Result
  - ok
  - err
verification:
  - tests/core/result.test.ts
  - just check
---

# Result types

## Responsibility

Implement the `Result<T, E>` discriminated union and its two constructors, exactly per contract.

## Implementation strategy

- Pure type + two one-line functions. No imports.
- `ok`/`err` declared with explicit return types matching the contract signatures.

## Invariants

- Never throws; no validation of payloads.

## Tests

- Type-level narrowing behaves (assert via branching in tests).
- `ok(1)` deep-equals `{ ok: true, value: 1 }`; `err("x")` deep-equals `{ ok: false, error: "x" }`.

## Design rationale

Everything downstream depends on this file; keep it dependency-free so the DAG root never moves.

## Open questions

None.

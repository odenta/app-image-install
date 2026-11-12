---
id: cli.run
kind: source-design
contract: cli
contract_revision: 1
targets:
  - src/cli/run.ts
  - tests/cli/run.test.ts
depends_on:
  - core.installer.pipeline
  - core.registry.sync
exports:
  - CliIO
  - CliDeps
  - runCli
verification:
  - tests/cli/run.test.ts
  - just check
---

# CLI run

## Responsibility

Argument parsing and dispatch to core modules with output formatting and exit codes, per
contract `cli`. No integration logic.

## Implementation strategy

- Hand-rolled parser (no dependency): first non-flag token = command; remaining flags parsed
  per command (`install`: `--delete-source`, `--force`, file operands ≥1; `remove`: 1 operand;
  `list`, `sync`: 0 operands; `gui`: 0 operands; `--help`/`-h` anywhere → usage).
- Wiring: `resolvePaths(deps.paths)` → `ensurePaths` → dispatch:
  - `install`: loop files, print per-file success (`Installed <name> (<appId>)`) or error line;
    aggregate exit 0 iff all ok. Print warnings indented to stderr.
  - `remove`: print removed summary or error.
  - `list`: columnar NAME/VERSION/PATH, version column empty when null.
  - `sync`: print `regenerated:` and `pruned:` lists (skip section when empty); on image/regenerated
    count mismatch print "warning: some images could not be re-integrated" to stderr.
  - `gui`: spawn `bun ["src/gui/main.ts"]` detached, inherit stdio; if the entry file is absent,
    stderr "GUI is not built in this wave" and exit 1. Spawn errors → exit 1 with message.
- Exit codes: 0 ok / 1 runtime / 2 usage (unknown command, missing/unknown operands) per contract.

## Invariants

- All output through `deps.io`; no direct `console` use in `run.ts` (main.ts wires real io).
- Never calls `process.exit` (returns code).

## Error handling

- Core `Result` errors rendered as one-line stderr messages; expected failures never stack-trace.

## Tests

- Full end-to-end over temp dirs with fixture AppImages: install → list → sync → remove;
  exit codes for usage errors; `--help` lists all commands; per-file continue on multi-install
  with one bad file; collision message content; delete-source behavior observable at fs level.

## Design rationale

Hand-rolled parsing keeps zero runtime deps and full control of usage-error semantics (exit 2).

## Open questions

None.

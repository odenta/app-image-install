---
id: cli
kind: module-contract
status: approved
revision: 1
architecture: cli
dependencies:
  - core.result
  - core.paths
  - core.installer
  - core.registry
  - core.remove
---

# CLI front

## Responsibility

Command-line interface: parse arguments, dispatch to core modules, format output, and return process exit codes. Contains no integration logic of its own.

## Public API

```typescript
export interface CliIO {
  readonly stdout: (text: string) => void;   // line-oriented output sink
  readonly stderr: (text: string) => void;
}
export interface CliDeps {
  readonly io: CliIO;
  readonly paths?: PathOverrides;            // test hook; undefined = real home
}

export function runCli(argv: readonly string[], deps: CliDeps): Promise<number>;
// argv excludes node/bun and script path. Returns the process exit code; never calls process.exit.
```

Commands:
- `app-img-installer install <file>… [--delete-source] [--force]` — installs each file in order; continues with remaining files after a per-file failure; exit 0 iff all succeeded.
- `app-img-installer remove <name>` — single app.
- `app-img-installer list` — columns: NAME VERSION PATH; empty result prints nothing (exit 0).
- `app-img-installer sync` — prints `regenerated: …` / `pruned: …` sections (omitted when empty).
- `app-img-installer gui` — launches the Electrobun window (spawns the GUI entrypoint; on headless/unsupported hosts exits non-zero with a clear error).
- `--help` / no command prints usage to stdout, exit 0; unknown command prints usage to stderr, exit 2; usage errors exit 2; runtime failures exit 1.

## Preconditions

- None beyond core module preconditions.

## Postconditions

- Exit code faithfully reflects overall success (0) vs runtime failure (1) vs usage error (2).
- All output (including warnings from fallbacks) goes through `deps.io`.

## Invariants

- No direct filesystem or process effects except through core modules and the `gui` spawn.
- Deterministic output ordering (input order for install, sorted for list).

## State

- Stateless per invocation.

## Error semantics

- Core errors are rendered as human-readable stderr lines; no stack traces for expected failures.

## Dependencies

- `core.result`, `core.paths`, `core.installer`, `core.registry`, `core.remove`

## Performance

- Bounded by core operations.

## Acceptance criteria

- `runCli` is unit-testable with a fake `CliIO` and `PathOverrides` pointing at temp dirs (no real home touched).
- Exit codes match the table above; `--help` output lists every command.

## Open questions

None.

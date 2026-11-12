---
id: cli.main
kind: source-design
contract: cli
contract_revision: 1
targets:
  - src/cli/main.ts
depends_on:
  - cli.run
exports: []
verification:
  - just check
  - smoke: bun src/cli/main.ts --help
---

# CLI main

## Responsibility

Process entry point: wire real IO to `runCli` and exit with its code.

## Implementation strategy

```typescript
import { runCli } from "./run.ts";
const code = await runCli(process.argv.slice(2), { io: { stdout: console.log, stderr: console.error } });
process.exit(code);
```

Shebang `#!/usr/bin/env bun` first line (bin entry). Top-level await is fine on Bun.

## Invariants

- Contains zero logic beyond wiring; all behavior lives in `runCli` (testable).

## Tests

- No unit test (covered by `runCli` tests); smoke check `bun src/cli/main.ts --help` exits 0.

## Design rationale

Thin entries are what keep `runCli` unit-testable with fake IO.

## Open questions

None.

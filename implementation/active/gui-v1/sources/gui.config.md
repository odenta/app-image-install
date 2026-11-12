---
id: gui.config
kind: source-design
contract: gui
contract_revision: 1
targets:
  - electrobun.config.ts
  - hutch.config.ts
  - package.json
depends_on: []
exports: []
verification:
  - just check
  - just verify
---

# Electrobun configuration

## Responsibility

Bootstrap Electrobun 2.x into the existing repo without letting the template own the layout:
main-process entry points at `src/gui/bun/index.ts`, webview at `src/gui/mainview/`.

## Implementation strategy

- `bun add -d electrobun` (pinned version matching Hutch's current release).
- `electrobun.config.ts`: entrypoint `src/gui/bun/index.ts`; mainview URL `views://mainview/index.html`;
  output under `build/` (gitignored). Follow the init template's schema; adapt paths, don't
  restructure the repo.
- `hutch.config.ts`: pin `electrobun` version; keep existing just-driven workflow untouched.
- `package.json`: add script `"gui": "bun src/gui/main.ts"`? No — GUI launches via
  `app-img-installer gui` (cli contract) which spawns the Electrobun entry; add
  `"dev:gui": "electrobun dev"` (or Hutch equivalent) for development.
- Ensure `just verify` stays green: Electrobun types must not break `tsc --noEmit`
  (exclude its build cache dir in tsconfig/eslint if needed).

## Invariants

- No change to approved contracts; config only wires the approved `gui` contract's runtime.

## Tests

- `just verify` green after init.

## Design rationale

Keeping our layout (fronts under `src/gui/`) preserves the approved module map and the CLI's
`gui` dispatch path (`src/gui/main.ts`).

## Open questions

- Exact Electrobun 2.x config schema is version-dependent; resolve against the installed
  release during implementation (fact, not a decision).

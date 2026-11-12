# app-img-installer — task runner
# Required project interfaces (AI Engineering Workflow Spec — TS v0.1, §3.2)

# Type check (strict, no emit)
check:
    bunx tsc --noEmit

# Unit tests (Bun test runner)
test:
    bun test

# Lint (ESLint + typescript-eslint)
lint:
    bunx eslint .

# Architecture / contract / SDR policy checks
arch-check:
    bun tools/policy-check/index.ts

# OpenSpec validation
spec-check:
    openspec validate --specs --strict

# Full verification
verify: check test lint arch-check spec-check

# app-img-installer — agent instructions

AppImage installer/integrator (CLI + Electrobun GUI). TypeScript on Bun, strict mode.
Development model: specification-driven, human-governed, AI-implemented (AI Engineering Workflow Specification — TS v0.1).

## Verify

- `just verify` is the full gate (check, test, lint, arch-check, spec-check). Run it before reporting any phase complete; a phase with a red gate is not done.

## Authority (never cross silently)

- `architecture/model.md` (L1), `openspec/specs/` (L2), `contracts/` (L3) are operator-approved. Escalate conflicts; never edit them to match code.
- `implementation/active/` (L4 blueprints/SDRs) is agent-authored but subordinate: it must not change L1–L3.
- Contract frontmatter `status: draft` = awaiting operator approval; `approved` = authoritative.

## Conventions

- Public API changes start in the owning contract (keep status honest); code follows the contract, never the reverse.
- Core modules return `Result<T, E>` (`core.result`); `throw` is for programmer errors only.
- Dependency direction: fronts (`cli`, `gui`) → `core.*`. `core.*` never imports a front; `cli` and `gui` never import each other.
- No new runtime dependency without operator approval.

## Shape of the system

- Stateless: the filesystem is the database. One key everywhere: `<appId>.appimage` in `~/.local/Apps/` ↔ `<appId>.desktop` in applications dir ↔ `hicolor/<size>/apps/<appId>.*` icons.
- `src/core/` = integration logic; `src/cli/` and `src/gui/` = thin fronts over it.

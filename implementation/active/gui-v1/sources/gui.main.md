---
id: gui.main
kind: source-design
contract: gui
contract_revision: 1
targets:
  - src/gui/bun/index.ts
depends_on:
  - gui.config
  - core.desktop.groups
exports: []
verification:
  - just check
  - manual smoke (W5)
---

# GUI main process

## Responsibility

Electrobun main process: window, typed RPC surface from the approved `gui` contract, native
file dialog, launch/detach, appsChanged events. All integration logic delegates to core modules.

## Implementation strategy

- Create `BrowserWindow` titled "App Image Installer", default ~720x480, resizable.
- Define shared RPC schema type (inline in this file or `src/gui/rpc.ts`): `listApps`,
  `addApps`, `removeApp`, `launchApp`; one-way event `appsChanged`.
- `listApps`: `resolvePaths()` + `listInstalled` → map to DTO; entry parse errors surface as
  name=appId (core behavior already).
- `addApps`: `Utils.openFileDialog({ allowedFileTypes: ["appimage"], allowsMultipleSelection: true })`;
  empty → `{ cancelled: true }`; else install each via `installAppImage`, collecting
  installed/failed; emit `appsChanged` at the end.
- `removeApp`: `removeApp(paths, appId)`; core errors cross the RPC boundary as
  `{ message }` (never throw across the bridge, per contract).
- `launchApp`: `Bun.spawn([imagePath], { stdio: "ignore" }).unref()`; ENOENT-style failures →
  error message result.
- Window close = exit; no persistence.

## Invariants

- Webview receives data only through the RPC schema; no filesystem capability in the view.
- Known accepted limitation: X11 backend (XWayland on Plasma Wayland, upstream #568).

## Tests

- Manual smoke only (per plan): launch, add fixture AppImage, launch app, remove.
- `just check` keeps the file type-clean.

## Design rationale

The main process is the only trusted side; keeping it a thin delegate preserves CLI/GUI parity
by construction.

## Open questions

None.

# Implementation Blueprint — gui-v1

Wave: Electrobun GUI front + one approved contract revision discovered by the real-AppImage
smoke test (VSCodium, commit-era tag implementation/core-cli-v1).

## Covered contracts

- `gui` (revision 1, approved) — full implementation.
- `core.desktop` — **revision 2 delta (operator-approved at gate 3)**: preserve non-`[Desktop Entry]`
  groups verbatim; consume `Type` (renderer owns it). Motivation: real AppImages (e.g. VSCodium)
  ship `Actions=` keys with `[Desktop Action …]` groups; dropping the groups produces entries
  that fail `desktop-file-validate` and may be rejected by menus.

## Planned files

| File | Responsibility | SDR |
|---|---|---|
| `src/core/desktop.ts` (+ test) | group preservation, `Type` consumption | `core.desktop.groups` |
| `electrobun.config.ts`, `hutch.config.ts`, `package.json` | Electrobun bundler config; `electrobun` devDep | `gui.config` |
| `src/gui/bun/index.ts` | main process: window, typed RPC, native dialog, launch | `gui.main` |
| `src/gui/mainview/index.html` / `index.css` / `index.ts` | list view, Add/Launch/Remove, confirm | `gui.view` |

## Source DAG

Within this wave: `core.desktop.groups` ← `gui.main` ← `gui.view`; `gui.config` independent.
`gui.main`'s substantive dependencies are the **already-implemented** core modules (tag
`implementation/core-cli-v1`), recorded in its SDR as `uses_implemented`:

```
gui.view
  -> gui.main --uses_implemented--> core.installer, core.registry, core.remove,
                                    core.paths, core.result
  -> core.desktop.groups (this wave's only core source change)
```

RPC-to-core mapping (approved `gui` contract): `listApps`→`core.registry.listInstalled`,
`addApps`→`core.installer.installAppImage`, `removeApp`→`core.remove.removeApp`,
`launchApp`→spawn stored image. `gui.main` imports no other integration logic.

## Execution order (tasks.yaml)

W1 `gui.config` → W2 `core.desktop.groups` → W3 `gui.main` → W4 `gui.view` → W5 manual smoke.

## Integration strategy

- Gate after every wave (`just verify`); Electrobun typings must not weaken `tsc --noEmit`.
- `gui.main` RPC is thin: every method delegates to a core call; webview holds no logic
  (parity scenario from GUI spec).
- Final: manual smoke `bun run gui` (deps confirmed present: gtk3, webkit2gtk4.1,
  libappindicator-gtk3, librsvg2) — XWayland expected (upstream #568, accepted).

## Known risks

- Electrobun 2.0 init flow (Hutch) may restructure `package.json`/scripts — keep `just verify`
  green after init; adapt, don't let the template own the repo.
- GUI untested by `bun test` (manual only, per plan); RPC schema is the typed seam.

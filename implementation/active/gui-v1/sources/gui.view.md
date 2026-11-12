---
id: gui.view
kind: source-design
contract: gui
contract_revision: 1
targets:
  - src/gui/mainview/index.html
  - src/gui/mainview/index.css
  - src/gui/mainview/index.ts
depends_on:
  - gui.main
exports: []
verification:
  - just check
  - manual smoke (W5)
---

# GUI webview

## Responsibility

The visible window: list of installed apps (icon + name + version), Add/Launch/Remove per row,
confirmation before remove, warning toasts for pipeline warnings. Pure view over RPC.

## Implementation strategy

- `index.html`: toolbar ("Add AppImage…" button) + empty-state text + `<ul>` list.
- `index.ts`: `Electroview.defineRPC` client; `refresh()` calls `listApps` on load and on
  `appsChanged`; renders rows (icon via `icon://` if Electrobun exposes it, else appId text
  badge — icon rendering is best-effort cosmetic).
- Add → `addApps()`; on result: cancelled → no-op; failed entries → inline error text;
  warnings → toast area.
- Remove → `window.confirm`-style custom dialog → `removeApp(appId)`.
- Launch → `launchApp(appId)`; error → toast.
- No local state beyond the rendered list; all mutations flow through RPC.

## Invariants

- No integration decisions in the webview (parity requirement).
- Works when the list is empty (empty state visible).

## Tests

- Manual smoke (W5).

## Design rationale

Dumb view = the parity scenario from the GUI spec holds by construction.

## Open questions

None.

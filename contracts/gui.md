---
id: gui
kind: module-contract
status: approved
revision: 2
architecture: gui
dependencies:
  - core.result
  - core.paths
  - core.installer
  - core.registry
  - core.remove
---

# GUI front

## Responsibility

Electrobun application: a single window listing installed AppImages with Add / Launch / Remove actions. All integration work happens in the Bun main process via core modules; the webview is a dumb view over typed RPC.

## Public API

RPC schema (typed, shared between main and webview). **All payloads crossing the bridge are
JSON-safe DTOs** — plain objects with the fields the UI needs, never core module types.
Expected failures cross as **rejected requests** carrying a human-readable message (Electrobun
transports handler `throw`s as rejections); the webview catches them and shows the message.
`appId` values received from the webview are validated (single safe path segment) before any
filesystem or process use.

```typescript
// webview -> main (requests)
export interface GuiRpc {
  listApps(): Promise<AppDto[]>;                    // AppDto = { appId, name, version, appImagePath }
  addApps(): Promise<AddResultDto>;                 // opens native file dialog, installs each picked file
  removeApp(appId: string): Promise<{ removed: true }>;
  launchApp(appId: string): Promise<{ launched: true }>;
}
// main -> webview (one-way messages)
export interface GuiEvents {
  appsChanged(): void;     // emitted after any mutation; webview refetches listApps
}
export interface AddResultDto {
  readonly installed: readonly { appId: string; name: string; warnings: readonly string[] }[];
  readonly failed: readonly { file: string; error: string }[];
  readonly cancelled: boolean;
}
```

Main process additionally handles: window creation (title "App Image Installer", sensible default size, resizable), and `launchApp` spawning with error surfaced to the webview when the image fails to start.

## Preconditions

- Same runtime requirements as Electrobun on Linux (GTK3 + WebKitGTK 4.1); missing libs produce a clear startup error.

## Postconditions

- Every mutation through the GUI yields an `appsChanged` event and a refreshed list.
- No integration decision is made in the webview.

## Invariants

- Webview holds no filesystem or process capabilities beyond the RPC surface.
- Known accepted limitation: Electrobun forces X11 backend (XWayland on Plasma Wayland, upstream #568).

## State

- Window/RPC state owned by Electrobun main process; no persistent state.

## Error semantics

- Core `Result` failures become rejected requests carrying a human-readable message; the webview renders them as user-visible messages.

## Dependencies

- `core.result`, `core.paths`, `core.installer`, `core.registry`, `core.remove`
- Electrobun runtime (`electrobun/main`, `electrobun/view`)

## Performance

- List refresh is a filesystem scan; fine at interactive rates.

## Acceptance criteria

- Installing through the GUI and the CLI produce identical artifacts (parity scenario from GUI spec).
- Cancelled file dialog is a no-op.
- Remove always confirms before calling `removeApp`.

## Open questions

None.

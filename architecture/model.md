# Architecture Model — app-img-installer

Level: L1 (design graph). Status: **approved** (gate 1).
Plain-Markdown design graph (LikeC4 intentionally omitted at this scale, per workflow spec §4.1).

## Components

| ID | Responsibility |
|---|---|
| `core.result` | Shared `Result<T, E>` error-value type |
| `core.paths` | Resolve and ensure XDG storage paths |
| `core.appimage` | Read AppImages: validate, `--appimage-extract`, parse embedded desktop file and icons |
| `core.desktop` | Parse/render/write/prune desktop entries; fallback entry generation |
| `core.icons` | Install/remove icons under the hicolor theme; cache refresh (best-effort) |
| `core.installer` | Install pipeline: copy, collision/`--force`, integration, `--delete-source`, rollback |
| `core.registry` | Derive installed-app list from filesystem; `sync` (regenerate + prune) |
| `core.remove` | Remove one app: image + entry + icons |
| `cli` | CLI front: arg parsing, subcommands, exit codes (delegates to core) |
| `gui` | Electrobun front: window, list view, Add/Launch/Remove via RPC to core |

## Allowed dependencies (downward only)

| Module | May depend on |
|---|---|
| `core.result` | — |
| `core.paths` | `core.result` |
| `core.appimage` | `core.result`, `core.desktop` |
| `core.desktop` | `core.result` |
| `core.icons` | `core.result` |
| `core.installer` | `core.result`, `core.paths`, `core.appimage`, `core.desktop`, `core.icons` |
| `core.registry` | `core.result`, `core.paths`, `core.appimage`, `core.desktop`, `core.icons` |
| `core.remove` | `core.result`, `core.paths`, `core.desktop`, `core.icons` |
| `cli` | `core.*` (all core) |
| `gui` | `core.*` (all core) |

## Architectural constraints

1. **Direction**: fronts → core. `core.*` never imports `cli`/`gui`; `cli` and `gui` never import each other.
2. **Statelessness**: no config database. The filesystem is the database; every read is derived live.
3. **One key**: `appId` (the embedded desktop-entry ID, e.g. `codium`). Storage name is normalized to `<appId>.appimage`; entries are `<appId>.desktop`; icons are `hicolor/<size>/apps/<appId>.<ext>`.
4. **Errors**: expected failures are `Result` values; `throw` only for programmer errors.
5. **Side effects at boundaries**: core logic takes paths/IO as parameters; only `core.installer`, `core.registry`, `core.remove`, `core.icons` (cache refresh), and fronts perform effects.

## Communication

- `cli`/`gui` call core module functions directly (in-process). `gui` talks to its webview over Electrobun RPC; the webview holds no integration logic.

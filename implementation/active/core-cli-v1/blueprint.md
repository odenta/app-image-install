# Implementation Blueprint — core-cli-v1

Wave: implementation of all approved core modules + the CLI front. The `gui` contract is out of
scope for this wave (separate blueprint once core is proven).

1. **Approved contracts covered (revision 1, status approved, gate 1)**:
   `core.result`, `core.paths`, `core.desktop`, `core.icons`, `core.appimage`,
   `core.installer`, `core.registry`, `core.remove`, `cli`.
2. **Planned files & responsibilities**: see SDRs in `sources/` (one SDR per source unit; test
   files are targets of their module's SDR).
3. **Internal interfaces**: only cross-module interfaces are the approved contract public APIs.
   Shared internal conventions: all modules import `Result`/`ok`/`err` from `core.result`;
   structured error types are plain `readonly` object types, discriminated by `kind`.
4. **Source dependency DAG**: `core.result` ← {`core.paths`, `core.desktop`, `core.icons`} ←
   `core.appimage` ← {`core.installer`, `core.registry`} ← `core.remove` ← `cli.run` ←
   `cli.main`; `testsupport.fixtures` is independent. (Machine-checkable via `just arch-check`.)
5. **Execution ordering** (see `tasks.yaml`): W1 result → W2 paths/desktop/icons/fixtures →
   W3 appimage → W4 remove → W5 installer + registry (parallel) → W6 cli.run → W7 cli.main.
6. **Parallelizable work units**: W2 (four independent SDRs), W5 (installer and registry share no
   sources; both only read approved contracts and depend on W3/W4 outputs).
7. **Integration strategy**: bottom-up. After each wave, `just check && just test` must be green
   before starting the next. Final integration: `tests/cli/run.test.ts` drives `runCli` against
   temp-dir paths end-to-end (install → list → sync → remove), then full `just verify`.
8. **Test responsibilities**: each module SDR owns its unit tests; `testsupport.fixtures` owns the
   fixture-AppImage builder and committed AppDir trees; CLI owns end-to-end coverage of exit codes
   and output formatting. `gui` remains manual for now (contract `gui` acceptance criteria
   partially verifiable only after the GUI wave).
9. **Known risks / unresolved questions**:
   - Fixture AppImages are executable shell scripts honouring `--appimage-extract`, not ELF
     runtimes. Mitigation: hermetic and fast; before the GUI wave, run one manual smoke test
     against a real AppImage to validate the real extraction path.
   - `cli` contract's `gui` subcommand: this wave dispatches to `bun src/gui/main.ts`; when the
     entry does not exist yet it prints "GUI is not built in this wave" and exits 1. The GUI
     wave replaces nothing in `cli.run` — the dispatch stays.
   - Rollback paths in `core.installer` are failure-injected in tests via unwritable target dirs
     (running tests as non-root; CI note in AGENTS.md if ever root).

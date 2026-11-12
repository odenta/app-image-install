// Entry point for `app-img-installer gui` (spawns `bun src/gui/main.ts`).
// Electrobun's own entry is src/gui/bun/index.ts (see electrobun.config.ts);
// this shim exists so the CLI dispatch path stays a one-liner.
import "./bun/index.ts";

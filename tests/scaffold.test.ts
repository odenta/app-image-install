// Scaffold-phase smoke tests. These verify repo-level invariants until Phase E
// replaces them with real module unit tests (fixture AppImages per contract acceptance criteria).
import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

test("all five capability specs exist", async () => {
  for (const cap of ["install", "remove", "list", "sync", "gui"]) {
    const spec = Bun.file(path.join(ROOT, "openspec", "specs", cap, "spec.md"));
    expect(await spec.exists(), `missing openspec/specs/${cap}/spec.md`).toBe(true);
  }
});

test("contracts exist and are non-empty", async () => {
  const files = (await readdir(path.join(ROOT, "contracts"))).filter((f) => f.endsWith(".md"));
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const text = await Bun.file(path.join(ROOT, "contracts", file)).text();
    expect(text.startsWith("---\n"), `${file} lacks YAML frontmatter`).toBe(true);
    expect(text.length).toBeGreaterThan(500);
  }
});

test("architecture model names every contract", async () => {
  const model = await Bun.file(path.join(ROOT, "architecture", "model.md")).text();
  const contracts = (await readdir(path.join(ROOT, "contracts"))).filter((f) => f.endsWith(".md"));
  for (const file of contracts) {
    const id = file.replace(/\.md$/, "");
    expect(model.includes(`\`${id}\``), `model.md does not reference ${id}`).toBe(true);
  }
});

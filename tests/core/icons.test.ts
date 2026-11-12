import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { installIcons, refreshCaches, removeIcons, type ExtractedIcon } from "../../src/core/icons.ts";
import { resolvePaths } from "../../src/core/paths.ts";

let root: string;
let themeDir: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "icons-test-"));
  themeDir = resolvePaths({ homeDir: root }).iconThemeDir;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function seedExtraction(): Promise<{ workDir: string; icons: ExtractedIcon[] }> {
  const workDir = await mkdtemp(path.join(tmpdir(), "extract-"));
  const appDir = path.join(workDir, "squashfs-root");
  await cp(path.resolve(import.meta.dir, "../fixtures/appdirs/valid"), appDir, { recursive: true });
  const icons: ExtractedIcon[] = [
    { absPath: path.join(appDir, "usr/share/icons/hicolor/64x64/apps/codium.png"), relPath: "usr/share/icons/hicolor/64x64/apps/codium.png", ext: ".png" },
    { absPath: path.join(appDir, ".DirIcon"), relPath: ".DirIcon", ext: ".png" },
  ];
  return { workDir, icons };
}

describe("core.icons", () => {
  test("installs hicolor icons by size and .DirIcon to 256x256, named by appId", async () => {
    const { icons } = await seedExtraction();
    const r = await installIcons(themeDir, "codium", icons);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const targets = r.value.map((i) => i.relTarget).sort();
    expect(targets).toEqual(["256x256/apps/codium.png", "64x64/apps/codium.png"]);
  });

  test("empty icon list is a no-op", async () => {
    const r = await installIcons(themeDir, "codium", []);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  test("removeIcons removes only the app's icons and counts them", async () => {
    const { icons } = await seedExtraction();
    await installIcons(themeDir, "codium", icons);
    await installIcons(themeDir, "other", icons);
    const r = await removeIcons(themeDir, "codium");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(2);
    const otherLeft = await removeIcons(themeDir, "other");
    if (otherLeft.ok) expect(otherLeft.value).toBe(2);
    const zero = await removeIcons(themeDir, "codium");
    if (zero.ok) expect(zero.value).toBe(0);
  });

  test("prefix-named icons of other apps are untouched", async () => {
    const { icons } = await seedExtraction();
    await installIcons(themeDir, "codium", icons);
    const foreignDir = path.join(themeDir, "48x48", "apps");
    await rm(foreignDir, { recursive: true, force: true }).catch(() => {});
    await writeFile(path.join(foreignDir, "codium-extra.png"), "x").then(() => {}).catch(async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(foreignDir, { recursive: true });
      await writeFile(path.join(foreignDir, "codium-extra.png"), "x");
    });
    const r = await removeIcons(themeDir, "codium");
    if (r.ok) expect(r.value).toBe(2); // 64x64 + 256x256 only, not codium-extra.png
  });

  test("exact-match removal: similar appIds never lose each other's icons", async () => {
    const { icons } = await seedExtraction();
    await installIcons(themeDir, "thing", icons);
    await installIcons(themeDir, "thing-0.1", icons);
    // removing "thing" must not touch "thing-0.1" (prefix collision regression)
    const r = await removeIcons(themeDir, "thing");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(2);
    const other = await removeIcons(themeDir, "thing-0.1");
    if (other.ok) expect(other.value).toBe(2);
  });

  test("refreshCaches resolves even with no cache tools on PATH", async () => {
    const prev = process.env.PATH;
    process.env.PATH = "/nonexistent";
    try {
      await expect(refreshCaches()).resolves.toBeUndefined();
    } finally {
      process.env.PATH = prev;
    }
  });
});

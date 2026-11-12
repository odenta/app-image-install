import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { removeApp } from "../../src/core/remove.ts";
import { fallbackEntry, renderDesktopEntry, writeEntry } from "../../src/core/desktop.ts";
import { installIcons } from "../../src/core/icons.ts";
import { ensurePaths, resolvePaths, type XdgPaths } from "../../src/core/paths.ts";

let root: string;
let paths: XdgPaths;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "remove-test-"));
  paths = resolvePaths({
    homeDir: root,
    appsDir: path.join(root, "Apps"),
    applicationsDir: path.join(root, "applications"),
    iconThemeDir: path.join(root, "icons", "hicolor"),
  });
  await ensurePaths(paths);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function seedApp(appId: string, name: string): Promise<void> {
  await Bun.write(path.join(paths.appsDir, `${appId}.appimage`), "#!/bin/sh\n");
  const entry = { ...fallbackEntry(appId, `${appId}.appimage`), name };
  await writeEntry(paths.applicationsDir, appId, renderDesktopEntry(entry, { exec: "/x", icon: appId }));
  const iconSrc = path.resolve(import.meta.dir, "../fixtures/appdirs/valid/.DirIcon");
  await installIcons(paths.iconThemeDir, appId, [{ absPath: iconSrc, relPath: ".DirIcon", ext: ".png" }]);
}

describe("core.remove", () => {
  test("removes image, entry, and icons; matches by appId", async () => {
    await seedApp("codium", "VSCodium");
    const r = await removeApp(paths, "codium");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.appId).toBe("codium");
    expect(r.value.removedImage).toBe(true);
    expect(r.value.removedEntry).toBe(true);
    expect(r.value.removedIcons).toBe(1);
    expect(await Bun.file(path.join(paths.appsDir, "codium.appimage")).exists()).toBe(false);
    expect(await Bun.file(path.join(paths.applicationsDir, "codium.desktop")).exists()).toBe(false);
  });

  test("matches by Name case-insensitively", async () => {
    await seedApp("codium", "VSCodium");
    const r = await removeApp(paths, "vscodium");
    expect(r.ok).toBe(true);
  });

  test("tolerates pre-deleted entry", async () => {
    await seedApp("codium", "VSCodium");
    await rm(path.join(paths.applicationsDir, "codium.desktop"));
    const r = await removeApp(paths, "codium");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.removedImage).toBe(true);
    expect(r.value.removedEntry).toBe(false);
    expect(r.value.removedIcons).toBe(1);
  });

  test("not-found changes nothing", async () => {
    await seedApp("codium", "VSCodium");
    const r = await removeApp(paths, "nope");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("not-found");
    expect(await Bun.file(path.join(paths.appsDir, "codium.appimage")).exists()).toBe(true);
  });

  test("ambiguous query errors listing both candidates", async () => {
    await seedApp("alpha", "Same");
    await seedApp("beta", "same");
    const r = await removeApp(paths, "same");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("not-found");
      if (r.error.kind === "not-found") expect(r.error.candidates).toEqual(["alpha", "beta"]);
    }
  });

  test("other apps are untouched", async () => {
    await seedApp("codium", "VSCodium");
    await seedApp("other", "Other");
    const r = await removeApp(paths, "codium");
    expect(r.ok).toBe(true);
    expect(await Bun.file(path.join(paths.appsDir, "other.appimage")).exists()).toBe(true);
    expect(await Bun.file(path.join(paths.applicationsDir, "other.desktop")).exists()).toBe(true);
  });
});

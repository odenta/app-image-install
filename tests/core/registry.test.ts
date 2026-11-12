import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listInstalled, sync } from "../../src/core/registry.ts";
import { installAppImage } from "../../src/core/installer.ts";
import { writeEntry, renderDesktopEntry, fallbackEntry } from "../../src/core/desktop.ts";

import { ensurePaths, resolvePaths, type XdgPaths } from "../../src/core/paths.ts";
import { makeFixtureAppImage } from "../fixtures/make-fixture-appimage.ts";

let root: string;
let paths: XdgPaths;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "registry-test-"));
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

describe("core.registry listInstalled", () => {
  test("empty storage yields empty list", async () => {
    const r = await listInstalled(paths);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([]);
  });

  test("lists installed apps sorted with versions", async () => {
    await installAppImage(await makeFixtureAppImage("valid", path.join(root, "codium.AppImage")), paths, {});
    const r = await listInstalled(paths);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBe(1);
    expect(r.value[0]?.name).toBe("VSCodium");
    expect(r.value[0]?.version).toBe("1.2.3");
    expect(r.value[0]?.appImagePath).toBe(path.join(paths.appsDir, "codium.appimage"));
  });

  test("lists multiple apps sorted by name", async () => {
    await installAppImage(await makeFixtureAppImage("valid", path.join(root, "codium.AppImage")), paths, {});
    await installAppImage(await makeFixtureAppImage("no-icons", path.join(root, "foo.AppImage")), paths, {});
    const r = await listInstalled(paths);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.map((a) => a.name)).toEqual(["Thing", "VSCodium"]);
  });

  test("image without entry is listed by appId with null version", async () => {
    await Bun.write(path.join(paths.appsDir, "lonely.appimage"), "#!/bin/sh\n");
    const r = await listInstalled(paths);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value[0]?.name).toBe("lonely");
    expect(r.value[0]?.version).toBeNull();
  });
});

describe("core.registry sync", () => {
  test("empty state: nothing to do", async () => {
    const r = await sync(paths);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ regenerated: [], pruned: [] });
  });

  test("regenerates missing entry and icons from the image", async () => {
    await installAppImage(await makeFixtureAppImage("valid", path.join(root, "codium.AppImage")), paths, {});
    await rm(path.join(paths.applicationsDir, "codium.desktop"));
    await rm(path.join(paths.iconThemeDir), { recursive: true, force: true });
    const r = await sync(paths);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.regenerated).toEqual(["codium"]);
    expect(r.value.pruned).toEqual([]);
    const entryText = await Bun.file(path.join(paths.applicationsDir, "codium.desktop")).text();
    expect(entryText).toContain("Name=VSCodium");
    expect(await Bun.file(path.join(paths.iconThemeDir, "64x64", "apps", "codium.png")).exists()).toBe(true);
  });

  test("prunes orphaned entry and icons", async () => {
    await installAppImage(await makeFixtureAppImage("valid", path.join(root, "codium.AppImage")), paths, {});
    await rm(path.join(paths.appsDir, "codium.appimage"));
    const r = await sync(paths);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pruned).toEqual(["codium"]);
    expect(await Bun.file(path.join(paths.applicationsDir, "codium.desktop")).exists()).toBe(false);
    expect(await Bun.file(path.join(paths.iconThemeDir, "64x64", "apps", "codium.png")).exists()).toBe(false);
  });

  test("foreign entries (Exec outside storage) survive", async () => {
    const foreign = renderDesktopEntry(
      { ...fallbackEntry("foreign", "x"), name: "Foreign" },
      { exec: "/usr/bin/something", icon: "x" },
    );
    await writeEntry(paths.applicationsDir, "foreign", foreign);
    const r = await sync(paths);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pruned).toEqual([]);
    expect(await Bun.file(path.join(paths.applicationsDir, "foreign.desktop")).exists()).toBe(true);
  });

  test("corrupt image is skipped, sync still succeeds", async () => {
    await makeFixtureAppImage(null, path.join(root, "broken"), { garbage: true });
    await rename(path.join(root, "broken"), path.join(paths.appsDir, "broken.appimage"));
    const r = await sync(paths);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.regenerated).toEqual([]);
    expect(r.value.pruned).toEqual([]);
  });

  test("sync is idempotent", async () => {
    await installAppImage(await makeFixtureAppImage("valid", path.join(root, "codium.AppImage")), paths, {});
    const first = await sync(paths);
    const second = await sync(paths);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value.regenerated).toEqual([]);
      expect(second.value).toEqual({ regenerated: [], pruned: [] });
    }
  });
});

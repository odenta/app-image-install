import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { inspectAppImage } from "../../src/core/appimage.ts";
import { makeFixtureAppImage } from "../fixtures/make-fixture-appimage.ts";

async function workDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "appimage-test-"));
}

describe("core.appimage", () => {
  test("valid fixture: entry parsed, entryId from entry, icons best-first", async () => {
    const dir = await workDir();
    try {
      const image = await makeFixtureAppImage("valid", path.join(dir, "codium-1.2.3.AppImage"));
      const r = await inspectAppImage(image, dir);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.entry?.name).toBe("VSCodium");
      expect(r.value.entry?.version).toBe("1.2.3");
      expect(r.value.entryId).toBe("codium");
      expect(r.value.icons.length).toBe(3); // 64x64, 48x48, .DirIcon
      expect(r.value.icons[0]?.relPath).toBe("usr/share/icons/hicolor/64x64/apps/codium.png");
      expect(r.value.icons[1]?.relPath).toBe("usr/share/icons/hicolor/48x48/apps/codium.png");
      expect(r.value.icons[2]?.relPath).toBe(".DirIcon");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("no-desktop fixture: null entry, entryId from file name, icons found", async () => {
    const dir = await workDir();
    try {
      const image = await makeFixtureAppImage("no-desktop", path.join(dir, "thing-0.1.AppImage"));
      const r = await inspectAppImage(image, dir);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.entry).toBeNull();
      expect(r.value.entryId).toBe("thing-0.1");
      expect(r.value.icons.length).toBe(1);
      expect(r.value.icons[0]?.relPath).toBe("usr/share/icons/hicolor/32x32/apps/thing.png");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("no-icons fixture: entry parsed, empty icons", async () => {
    const dir = await workDir();
    try {
      const image = await makeFixtureAppImage("no-icons", path.join(dir, "foo.appimage"));
      const r = await inspectAppImage(image, dir);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.entry?.name).toBe("Thing");
      expect(r.value.icons).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("garbage fixture: extract-failed, never throws", async () => {
    const dir = await workDir();
    try {
      const image = await makeFixtureAppImage(null, path.join(dir, "garbage.AppImage"), { garbage: true });
      const r = await inspectAppImage(image, dir);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe("extract-failed");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("missing path: not-found", async () => {
    const dir = await workDir();
    try {
      const r = await inspectAppImage(path.join(dir, "nope.AppImage"), dir);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe("not-found");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("cleanup: squashfs-root removed after success and after failure", async () => {
    const dir = await workDir();
    try {
      const image = await makeFixtureAppImage("valid", path.join(dir, "ok.AppImage"));
      await inspectAppImage(image, dir);
      expect(await Bun.file(path.join(dir, "squashfs-root")).exists()).toBe(false);

      const bad = await makeFixtureAppImage(null, path.join(dir, "bad.AppImage"), { garbage: true });
      await inspectAppImage(bad, dir);
      expect(await Bun.file(path.join(dir, "squashfs-root")).exists()).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

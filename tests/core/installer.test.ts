import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { installAppImage } from "../../src/core/installer.ts";
import { ensurePaths, resolvePaths, type XdgPaths } from "../../src/core/paths.ts";
import { makeFixtureAppImage } from "../fixtures/make-fixture-appimage.ts";

let root: string;
let paths: XdgPaths;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "installer-test-"));
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

describe("core.installer", () => {
  test("happy path: image + entry + icons, entry Exec points at target", async () => {
    const source = await makeFixtureAppImage("valid", path.join(root, "downloads", "codium-1.2.3.AppImage"));
    const r = await installAppImage(source, paths, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.appId).toBe("codium");
    expect(r.value.name).toBe("VSCodium");
    expect(r.value.appImagePath).toBe(path.join(paths.appsDir, "codium.appimage"));
    expect(r.value.warnings).toEqual([]);
    expect(r.value.sourceDeleted).toBe(false);
    const entryText = await Bun.file(r.value.entryPath).text();
    expect(entryText).toContain(`Exec=${path.join(paths.appsDir, "codium.appimage")}`);
    expect(entryText).toContain("Icon=codium");
    expect(r.value.icons.length).toBe(3); // 64x64, 48x48, 256x256 (from .DirIcon)
    const mode = (await Bun.file(r.value.appImagePath).stat())?.mode;
    expect(mode !== undefined && (mode & 0o111) !== 0).toBe(true);
    // source untouched
    expect((await Bun.file(source).stat())?.size ?? 0).toBeGreaterThan(0);
  });

  test("collision refuses without force, changes nothing", async () => {
    const source = await makeFixtureAppImage("valid", path.join(root, "codium-1.2.3.AppImage"));
    expect((await installAppImage(source, paths, {})).ok).toBe(true);
    const other = await makeFixtureAppImage("valid", path.join(root, "other", "codium-9.9.AppImage"));
    await mkdir(path.dirname(other), { recursive: true });
    const r = await installAppImage(other, paths, {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("collision");
      if (r.error.kind === "collision") expect(r.error.appId).toBe("codium");
    }
  });

  test("force replaces the previous install fully", async () => {
    const source = await makeFixtureAppImage("valid", path.join(root, "codium-1.2.3.AppImage"));
    expect((await installAppImage(source, paths, {})).ok).toBe(true);
    const replacement = await makeFixtureAppImage("valid", path.join(root, "codium-2.0.0.AppImage"));
    const r = await installAppImage(replacement, paths, { force: true });
    expect(r.ok).toBe(true);
    // only one image, icons not duplicated
    expect(await Bun.file(path.join(paths.appsDir, "codium.appimage")).exists()).toBe(true);
    const entries = await readdirSafe(paths.applicationsDir);
    expect(entries.filter((f) => f === "codium.desktop").length).toBe(1);
  });

  test("failure after copy rolls back and keeps source", async () => {
    const source = await makeFixtureAppImage("valid", path.join(root, "codium-1.2.3.AppImage"));
    // Force entry write to fail: place a directory where codium.desktop must be written.
    await mkdir(path.join(paths.applicationsDir, "codium.desktop"));
    const r = await installAppImage(source, paths, {});
    expect(r.ok).toBe(false);
    expect(await Bun.file(path.join(paths.appsDir, "codium.appimage")).exists()).toBe(false);
    expect(await Bun.file(path.join(paths.iconThemeDir, "64x64", "apps", "codium.png")).exists()).toBe(false);
    expect((await Bun.file(source).stat())?.size ?? 0).toBeGreaterThan(0);
  });

  test("--delete-source removes source only on success", async () => {
    const source = await makeFixtureAppImage("valid", path.join(root, "ok.AppImage"));
    const good = await installAppImage(source, paths, { deleteSource: true });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.value.sourceDeleted).toBe(true);
    expect(await Bun.file(source).exists()).toBe(false);

    const source2 = await makeFixtureAppImage("valid", path.join(root, "fail.AppImage"));
    await rm(path.join(paths.applicationsDir, "codium.desktop"));
    await mkdir(path.join(paths.applicationsDir, "codium.desktop"));
    const bad = await installAppImage(source2, paths, { deleteSource: true });
    expect(bad.ok).toBe(false);
    expect(await Bun.file(source2).exists()).toBe(true);
  });

  test("in-place install skips copy and ignores delete-source", async () => {
    const target = path.join(paths.appsDir, "codium.appimage");
    await makeFixtureAppImage("valid", target);
    const r = await installAppImage(target, paths, { deleteSource: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.appId).toBe("codium");
    expect(r.value.sourceDeleted).toBe(false);
    expect((await Bun.file(target).stat())?.size ?? 0).toBeGreaterThan(0);
  });

  test("no-desktop fixture: fallback entry + warning", async () => {
    const source = await makeFixtureAppImage("no-desktop", path.join(root, "thing.AppImage"));
    const r = await installAppImage(source, paths, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.warnings.some((w) => w.includes("desktop entry"))).toBe(true);
    const entryText = await Bun.file(r.value.entryPath).text();
    expect(entryText).toContain(`Name=${"thing"}`);
  });

  test("no-icons fixture: generic icon + warning", async () => {
    const source = await makeFixtureAppImage("no-icons", path.join(root, "foo.AppImage"));
    const r = await installAppImage(source, paths, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.warnings.some((w) => w.includes("generic icon"))).toBe(true);
    const entryText = await Bun.file(r.value.entryPath).text();
    expect(entryText).toContain("Icon=application-x-executable");
  });

  test("garbage source: invalid-appimage, nothing installed", async () => {
    const source = await makeFixtureAppImage(null, path.join(root, "garbage.AppImage"), { garbage: true });
    const r = await installAppImage(source, paths, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("invalid-appimage");
    expect((await readdirSafe(paths.appsDir)).length).toBe(0);
  });

  test("missing source: source-not-found", async () => {
    const r = await installAppImage(path.join(root, "nope.AppImage"), paths, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("source-not-found");
  });
});

async function readdirSafe(dir: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  return readdir(dir).catch(() => [] as string[]);
}

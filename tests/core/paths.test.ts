import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensurePaths, resolvePaths, type XdgPaths } from "../../src/core/paths.ts";

async function tempPaths(): Promise<{ root: string; paths: XdgPaths }> {
  const root = await mkdtemp(path.join(tmpdir(), "paths-test-"));
  const paths = resolvePaths({
    homeDir: root,
    dataHome: path.join(root, ".local", "share"),
    appsDir: path.join(root, "Apps"),
    applicationsDir: path.join(root, "apps-dir"),
    iconThemeDir: path.join(root, "icons", "hicolor"),
  });
  return { root, paths };
}

describe("core.paths", () => {
  test("defaults: appsDir under ~/.local/Apps, rest under XDG_DATA_HOME", () => {
    const withEnv = resolvePaths({ homeDir: "/tmp/fake-home", dataHome: "/tmp/fake-data" });
    expect(withEnv.appsDir).toBe("/tmp/fake-home/.local/Apps");
    expect(withEnv.applicationsDir).toBe("/tmp/fake-data/applications");
    expect(withEnv.iconThemeDir).toBe("/tmp/fake-data/icons/hicolor");
    expect(withEnv.storageRoot).toBe(withEnv.appsDir);
  });

  test("relative XDG_DATA_HOME is ignored", () => {
    const prev = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = "relative/nonsense";
    try {
      const p = resolvePaths({ homeDir: "/tmp/fake-home" });
      expect(p.applicationsDir).toBe("/tmp/fake-home/.local/share/applications");
    } finally {
      if (prev === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = prev;
    }
  });

  test("overrides win unconditionally", () => {
    const p = resolvePaths({ homeDir: "/h", appsDir: "/custom/Apps", applicationsDir: "/custom/appdir" });
    expect(p.appsDir).toBe("/custom/Apps");
    expect(p.applicationsDir).toBe("/custom/appdir");
    expect(p.iconThemeDir).toBe("/h/.local/share/icons/hicolor");
  });

  test("ensurePaths creates nested dirs and is idempotent", async () => {
    const { root, paths } = await tempPaths();
    try {
      expect((await ensurePaths(paths)).ok).toBe(true);
      expect((await ensurePaths(paths)).ok).toBe(true);
      const exists = await stat(paths.appsDir).then(() => true, () => false);
      expect(exists).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("ensurePaths reports mkdir failure", async () => {
    const { root, paths } = await tempPaths();
    try {
      await writeFile(paths.appsDir, "i am a file, not a dir");
      const result = await ensurePaths(paths);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("mkdir-failed");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

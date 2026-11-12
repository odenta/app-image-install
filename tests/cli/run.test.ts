import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCli, type CliIO } from "../../src/cli/run.ts";
import { ensurePaths, resolvePaths, type XdgPaths } from "../../src/core/paths.ts";
import { makeFixtureAppImage } from "../fixtures/make-fixture-appimage.ts";

let root: string;
let paths: XdgPaths;
let out: string[];
let errOut: string[];
const io: CliIO = { stdout: (t) => out.push(t), stderr: (t) => errOut.push(t) };

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "cli-test-"));
  paths = resolvePaths({
    homeDir: root,
    appsDir: path.join(root, "Apps"),
    applicationsDir: path.join(root, "applications"),
    iconThemeDir: path.join(root, "icons", "hicolor"),
  });
  await ensurePaths(paths);
  out = [];
  errOut = [];
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function deps() {
  return { io, paths: { homeDir: root, appsDir: paths.appsDir, applicationsDir: paths.applicationsDir, iconThemeDir: paths.iconThemeDir } };
}

describe("cli end-to-end", () => {
  test("install -> list -> sync -> remove lifecycle", async () => {
    const source = await makeFixtureAppImage("valid", path.join(root, "downloads", "codium-1.2.3.AppImage"));

    expect(await runCli(["install", source], deps())).toBe(0);
    expect(out.some((l) => l.includes("Installed VSCodium (codium)"))).toBe(true);
    expect(await Bun.file(path.join(paths.appsDir, "codium.appimage")).exists()).toBe(true);

    out = [];
    expect(await runCli(["list"], deps())).toBe(0);
    expect(out[0]).toContain("NAME");
    expect(out.some((l) => l.includes("VSCodium") && l.includes("1.2.3"))).toBe(true);

    out = [];
    errOut = [];
    expect(await runCli(["sync"], deps())).toBe(0);
    expect(out).toEqual([]); // nothing regenerated or pruned
    expect(errOut).toEqual([]); // no spurious warnings on a healthy install

    expect(await runCli(["remove", "codium"], deps())).toBe(0);
    expect(await Bun.file(path.join(paths.appsDir, "codium.appimage")).exists()).toBe(false);
    out = [];
    expect(await runCli(["list"], deps())).toBe(0);
    expect(out).toEqual([]); // contract: empty result prints nothing
  });

  test("exit codes: usage errors -> 2", async () => {
    expect(await runCli(["bogus"], deps())).toBe(2);
    expect(await runCli(["install"], deps())).toBe(2);
    expect(await runCli(["remove"], deps())).toBe(2);
    expect(await runCli(["install", "--bogus-flag", "x"], deps())).toBe(2);
    expect(errOut.length).toBeGreaterThan(0);
  });

  test("--help exits 0 and lists every command", async () => {
    expect(await runCli(["--help"], deps())).toBe(0);
    const usage = out.join("\n");
    for (const cmd of ["install", "remove", "list", "sync", "gui"]) {
      expect(usage).toContain(cmd);
    }
  });

  test("missing file -> exit 1", async () => {
    expect(await runCli(["install", path.join(root, "nope.AppImage")], deps())).toBe(1);
    expect(errOut.some((l) => l.includes("not found"))).toBe(true);
  });

  test("collision -> 1; --force -> 0", async () => {
    const a = await makeFixtureAppImage("valid", path.join(root, "a", "codium-1.AppImage"));
    const b = await makeFixtureAppImage("valid", path.join(root, "b", "codium-2.AppImage"));
    expect(await runCli(["install", a], deps())).toBe(0);
    expect(await runCli(["install", b], deps())).toBe(1);
    expect(errOut.some((l) => l.includes("already installed") && l.includes("--force"))).toBe(true);
    expect(await runCli(["install", b, "--force"], deps())).toBe(0);
  });

  test("multi-install continues after per-file failure", async () => {
    const good = await makeFixtureAppImage("valid", path.join(root, "good", "codium.AppImage"));
    const bad = await makeFixtureAppImage(null, path.join(root, "bad.AppImage"), { garbage: true });
    expect(await runCli(["install", good, bad], deps())).toBe(1);
    expect(await Bun.file(path.join(paths.appsDir, "codium.appimage")).exists()).toBe(true);
  });

  test("--delete-source removes source after success", async () => {
    const source = await makeFixtureAppImage("valid", path.join(root, "codium.AppImage"));
    expect(await runCli(["install", source, "--delete-source"], deps())).toBe(0);
    expect(await Bun.file(source).exists()).toBe(false);
    expect(out.some((l) => l.includes("Deleted source"))).toBe(true);
  });

  test("fallback warnings surface on stderr", async () => {
    const source = await makeFixtureAppImage("no-desktop", path.join(root, "thing.AppImage"));
    expect(await runCli(["install", source], deps())).toBe(0);
    expect(errOut.some((l) => l.includes("warning") && l.includes("desktop entry"))).toBe(true);
  });

  test("remove not-found -> 1", async () => {
    expect(await runCli(["remove", "nope"], deps())).toBe(1);
    expect(errOut.some((l) => l.includes("no installed app matches"))).toBe(true);
  });

  test("list warns on unreadable entry but still lists the app", async () => {
    await Bun.write(path.join(paths.appsDir, "lonely.appimage"), "#!/bin/sh\n");
    await Bun.write(path.join(paths.applicationsDir, "lonely.desktop"), "[Desktop Entry]\nExec=only-no-name\n");
    expect(await runCli(["list"], deps())).toBe(0);
    expect(out.some((l) => l.startsWith("lonely"))).toBe(true);
    expect(errOut.some((l) => l.includes("warning: lonely"))).toBe(true);
  });
});

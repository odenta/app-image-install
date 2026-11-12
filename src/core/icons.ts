import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { err, ok, type Result } from "./result.ts";

export interface ExtractedIcon {
  readonly absPath: string;
  readonly relPath: string;
  readonly ext: string;
}

export interface InstalledIcon {
  readonly relTarget: string;
  readonly absPath: string;
}

export type IconError = {
  readonly kind: "fs";
  readonly op: string;
  readonly path: string;
  readonly cause: string;
};

const SUPPORTED = new Set([".png", ".svg", ".xpm"]);

function assertSafeAppId(appId: string): void {
  if (appId === "" || appId.includes("/") || appId === "." || appId === ".." || path.basename(appId) !== appId) {
    throw new Error(`programmer error: unsafe appId '${appId}'`);
  }
}

function normalizeExt(absPath: string): string | null {
  const base = path.basename(absPath);
  if (base === ".DirIcon") return ".png";
  const ext = path.extname(base).toLowerCase();
  return SUPPORTED.has(ext) ? ext : null;
}

function mapTargetRelPath(relPath: string, ext: string, appId: string): string {
  const segments = relPath.split("/");
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (seg !== undefined && /^\d+x\d+$/.test(seg)) {
      return path.join(seg, "apps", `${appId}${ext}`);
    }
  }
  if (ext === ".svg") return path.join("scalable", "apps", `${appId}${ext}`);
  return path.join("256x256", "apps", `${appId}${ext}`);
}

function fsError(op: string, iconPath: string, e: unknown): IconError {
  return { kind: "fs", op, path: iconPath, cause: e instanceof Error ? e.message : String(e) };
}

export async function installIcons(
  iconThemeDir: string,
  appId: string,
  icons: readonly ExtractedIcon[],
): Promise<Result<InstalledIcon[], IconError>> {
  assertSafeAppId(appId);
  const installed: InstalledIcon[] = [];
  for (const icon of icons) {
    const ext = normalizeExt(icon.absPath);
    if (ext === null) continue;
    const relTarget = mapTargetRelPath(icon.relPath, ext, appId);
    const absTarget = path.join(iconThemeDir, relTarget);
    try {
      await mkdir(path.dirname(absTarget), { recursive: true });
      await copyFile(icon.absPath, absTarget);
    } catch (e) {
      return err(fsError("install", absTarget, e));
    }
    installed.push({ relTarget, absPath: absTarget });
  }
  return ok(installed);
}

export async function removeIcons(iconThemeDir: string, appId: string): Promise<Result<number, IconError>> {
  assertSafeAppId(appId);
  let sizes: string[];
  try {
    sizes = await readdir(iconThemeDir);
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT") return ok(0);
    return err(fsError("list-themes", iconThemeDir, e));
  }
  let removed = 0;
  // Exact names only — prefix matches like `<appId>-other.png` belong to other apps.
  const targets = new Set([appId, `${appId}.png`, `${appId}.svg`, `${appId}.xpm`]);
  for (const size of sizes) {
    const appsDir = path.join(iconThemeDir, size, "apps");
    let files: string[];
    try {
      files = await readdir(appsDir);
    } catch {
      continue; // not a size dir with apps/; ignore
    }
    for (const file of files) {
      if (!targets.has(file)) continue;
      try {
        await rm(path.join(appsDir, file));
        removed++;
      } catch (e) {
        return err(fsError("remove", path.join(appsDir, file), e));
      }
    }
  }
  return ok(removed);
}

export async function refreshCaches(): Promise<void> {
  for (const [tool, args] of [
    ["gtk-update-icon-cache", []],
    ["kbuildsycoca6", []],
  ] as const) {
    const bin = Bun.which(tool);
    if (bin === null) continue;
    try {
      Bun.spawn([bin, ...args], { stdout: "ignore", stderr: "ignore" }).unref();
    } catch {
      // best-effort by contract; never block on cache tooling quirks
    }
  }
}

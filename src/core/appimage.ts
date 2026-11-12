import { chmod, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { err, ok, type Result } from "./result.ts";
import { parseDesktopEntry, type DesktopEntryData } from "./desktop.ts";
import type { ExtractedIcon } from "./icons.ts";

export interface AppImageMetadata {
  readonly entry: DesktopEntryData | null;
  readonly entryId: string;
  readonly rawEntryText: string | null;
  readonly icons: readonly ExtractedIcon[];
}

export type AppImageError =
  | { readonly kind: "not-found"; readonly path: string }
  | { readonly kind: "not-executable"; readonly path: string }
  | { readonly kind: "extract-failed"; readonly stderr: string }
  | { readonly kind: "no-appdir" };

const IMAGE_EXT = new Set([".png", ".svg", ".xpm"]);
const STDERR_LIMIT = 500;

async function walk(dir: string, acc: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(abs, acc);
    else if (entry.isFile()) acc.push(abs);
  }
}

function relOf(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join("/");
}

function normalizeIconExt(absPath: string): string | null {
  if (path.basename(absPath) === ".DirIcon") return ".png";
  const ext = path.extname(absPath).toLowerCase();
  return IMAGE_EXT.has(ext) ? ext : null;
}

function stripExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx > 0 ? fileName.slice(0, idx) : fileName;
}

function sizeOfHicolorPath(rel: string): number | null {
  const m = /\/icons\/hicolor\/(\d+)x(\d+)\/apps\//.exec(`/${rel}`);
  return m && m[1] !== undefined ? Number.parseInt(m[1], 10) : null;
}

export async function inspectAppImage(
  appImagePath: string,
  workDir: string,
): Promise<Result<AppImageMetadata, AppImageError>> {
  const root = path.join(workDir, "squashfs-root");
  try {
    try {
      await stat(appImagePath);
    } catch {
      return err({ kind: "not-found", path: appImagePath });
    }
    try {
      await chmod(appImagePath, 0o755);
    } catch {
      return err({ kind: "not-executable", path: appImagePath });
    }

    await rm(root, { recursive: true, force: true });
    const proc = Bun.spawn([appImagePath, "--appimage-extract"], {
      cwd: workDir,
      stdout: "ignore",
      stderr: "pipe",
    });
    const stderrText = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      return err({ kind: "extract-failed", stderr: stderrText.trim().slice(-STDERR_LIMIT) });
    }
    const rootStat = await stat(root).catch(() => null);
    if (rootStat === null || !rootStat.isDirectory()) {
      return err({ kind: "no-appdir" });
    }

    // Embedded desktop entry: AppDir root first, then usr/share/applications.
    let entry: DesktopEntryData | null = null;
    let rawEntryText: string | null = null;
    let desktopAbs: string | null = null;
    const rootFiles = (await readdir(root)).filter((f) => f.endsWith(".desktop")).sort();
    const rootDesktop = rootFiles[0];
    if (rootDesktop !== undefined) {
      desktopAbs = path.join(root, rootDesktop);
    } else {
      const usrDir = path.join(root, "usr", "share", "applications");
      const usrFiles = (await readdir(usrDir).catch(() => [] as string[]))
        .filter((f) => f.endsWith(".desktop"))
        .sort();
      const usrDesktop = usrFiles[0];
      if (usrDesktop !== undefined) desktopAbs = path.join(usrDir, usrDesktop);
    }
    if (desktopAbs !== null) {
      const text = await readFile(desktopAbs, "utf8");
      rawEntryText = text;
      const id = path.basename(desktopAbs, ".desktop");
      const parsed = parseDesktopEntry(id, text);
      if (parsed.ok) entry = parsed.value;
    }

    // Icon candidates, best-first.
    const allFiles: string[] = [];
    await walk(root, allFiles);
    const candidates: { abs: string; rel: string; priority: number; size: number }[] = [];
    for (const abs of allFiles) {
      const rel = relOf(root, abs);
      const ext = normalizeIconExt(abs);
      if (ext === null) continue;
      const base = path.basename(rel);
      const atRoot = !rel.includes("/");
      const hicolorSize = sizeOfHicolorPath(rel);
      const underUsrIcons = rel.startsWith("usr/share/icons/");
      let priority: number;
      let size = 0;
      if (hicolorSize !== null) {
        priority = 0;
        size = hicolorSize;
      } else if (underUsrIcons && !atRoot) {
        priority = 1;
      } else if (atRoot) {
        priority = 2;
      } else {
        continue; // icons elsewhere (e.g. usr/share/pixmaps handled via other rules? skip)
      }
      candidates.push({ abs, rel, priority, size });
    }
    candidates.sort((a, b) => a.priority - b.priority || b.size - a.size || a.rel.localeCompare(b.rel));
    const icons: ExtractedIcon[] = candidates.map((c) => ({
      absPath: c.abs,
      relPath: c.rel,
      ext: normalizeIconExt(c.abs) ?? ".png",
    }));

    const entryId = entry?.id ?? stripExtension(path.basename(appImagePath));
    return ok({ entry, entryId, rawEntryText, icons });
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }
}

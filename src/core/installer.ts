import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectAppImage } from "./appimage.ts";
import { fallbackEntry, renderDesktopEntry, writeEntry, type DesktopEntryData } from "./desktop.ts";
import { installIcons, refreshCaches, removeIcons, type InstalledIcon } from "./icons.ts";
import { ensurePaths, type XdgPaths } from "./paths.ts";
import { err, ok, type Result } from "./result.ts";

export interface InstallOptions {
  readonly deleteSource?: boolean;
  readonly force?: boolean;
}

export interface InstallReport {
  readonly appId: string;
  readonly name: string;
  readonly appImagePath: string;
  readonly entryPath: string;
  readonly icons: readonly InstalledIcon[];
  readonly warnings: readonly string[];
  readonly sourceDeleted: boolean;
}

export type InstallError =
  | { readonly kind: "source-not-found"; readonly path: string }
  | { readonly kind: "invalid-appimage"; readonly cause: string }
  | { readonly kind: "collision"; readonly appId: string; readonly existingPath: string }
  | { readonly kind: "fs"; readonly op: string; readonly path: string; readonly cause: string };

const GENERIC_ICON = "application-x-executable";

function fsError(op: string, p: string, e: unknown): InstallError {
  return { kind: "fs", op, path: p, cause: e instanceof Error ? e.message : String(e) };
}

async function exists(p: string): Promise<boolean> {
  return (await stat(p).catch(() => null)) !== null;
}

function isSafeAppId(appId: string): boolean {
  return appId !== "" && !appId.includes("/") && appId !== "." && appId !== ".." && path.basename(appId) === appId;
}

/** Copy hicolor/<size>/apps/<appId>[.{png,svg,xpm}] into destDir/<size>/; returns whether anything was backed up. */
async function backupIcons(themeDir: string, appId: string, destDir: string): Promise<boolean> {
  let any = false;
  const targets = new Set([appId, `${appId}.png`, `${appId}.svg`, `${appId}.xpm`]);
  const sizes = await readdir(themeDir).catch(() => [] as string[]);
  for (const size of sizes) {
    const appsDir = path.join(themeDir, size, "apps");
    const files = await readdir(appsDir).catch(() => [] as string[]);
    for (const file of files) {
      if (!targets.has(file)) continue;
      const dest = path.join(destDir, size, file);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(path.join(appsDir, file), dest);
      any = true;
    }
  }
  return any;
}

/** Restore icons previously saved by backupIcons. */
async function restoreIcons(backupDir: string, themeDir: string): Promise<void> {
  const sizes = await readdir(backupDir).catch(() => [] as string[]);
  for (const size of sizes) {
    const files = await readdir(path.join(backupDir, size)).catch(() => [] as string[]);
    for (const file of files) {
      const dest = path.join(themeDir, size, "apps", file);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(path.join(backupDir, size, file), dest);
    }
  }
}

export async function installAppImage(
  sourcePath: string,
  paths: XdgPaths,
  opts: InstallOptions,
): Promise<Result<InstallReport, InstallError>> {
  const warnings: string[] = [];
  const undo: (() => Promise<void>)[] = [];
  const rollback = async (): Promise<void> => {
    for (const step of [...undo].reverse()) {
      await step().catch(() => {});
    }
  };

  let workDir: string;
  try {
    workDir = await mkdtemp(path.join(os.tmpdir(), "app-img-install-"));
  } catch (e) {
    return err(fsError("mkdtemp", os.tmpdir(), e));
  }

  try {
    const ensured = await ensurePaths(paths);
    if (!ensured.ok) {
      return err({ kind: "fs", op: "mkdir", path: ensured.error.path, cause: ensured.error.cause });
    }
    if (!(await exists(sourcePath))) {
      return err({ kind: "source-not-found", path: sourcePath });
    }

    const inspected = await inspectAppImage(sourcePath, workDir);
    if (!inspected.ok) {
      switch (inspected.error.kind) {
        case "not-found":
          return err({ kind: "source-not-found", path: sourcePath });
        case "not-executable":
          return err({ kind: "fs", op: "chmod", path: sourcePath, cause: "could not make executable" });
        default:
          return err({ kind: "invalid-appimage", cause: `${inspected.error.kind}: ${"stderr" in inspected.error ? inspected.error.stderr : ""}` });
      }
    }
    const metadata = inspected.value;

    const appId = metadata.entryId;
    if (!isSafeAppId(appId)) {
      return err({ kind: "invalid-appimage", cause: `unsafe app id '${appId}'` });
    }

    const targetPath = path.join(paths.appsDir, `${appId}.appimage`);
    const entryPath = path.join(paths.applicationsDir, `${appId}.desktop`);
    const sourceIsTarget = path.resolve(sourcePath) === path.resolve(targetPath);
    const hasExisting = !sourceIsTarget && (await exists(targetPath));

    if (hasExisting && opts.force !== true) {
      return err({ kind: "collision", appId, existingPath: targetPath });
    }

    // Force mode (stage-then-swap, approved spec scenario): build the new install beside
    // the old one and only swap after every step succeeds, so a failure leaves the
    // previous install untouched and no partial state remains.
    const staging = hasExisting;
    const imageDest = staging ? `${targetPath}.stage` : targetPath;
    const entryDest = staging ? `${entryPath}.stage` : entryPath;
    const iconBackupDir = path.join(workDir, "icon-backup");
    let iconsBackedUp = false;
    let backupEntryText: string | null = null;

    if (staging) {
      iconsBackedUp = await backupIcons(paths.iconThemeDir, appId, iconBackupDir).catch(() => false);
      backupEntryText = await readFile(entryPath, "utf8").catch(() => null);
      // Pushed first => runs last in reverse rollback: clear the new artifacts, then
      // restore the previous install's entry text and icons.
      undo.push(async () => {
        await rm(imageDest, { force: true });
        await rm(entryDest, { force: true });
        await rm(entryPath, { force: true });
        if (backupEntryText !== null) {
          await writeEntry(paths.applicationsDir, appId, backupEntryText).catch(() => {});
        }
        if (iconsBackedUp) await restoreIcons(iconBackupDir, paths.iconThemeDir).catch(() => {});
      });
    }

    let copied = false;
    if (!sourceIsTarget) {
      try {
        await copyFile(sourcePath, imageDest);
        await chmod(imageDest, 0o755);
        copied = true;
        undo.push(async () => {
          await rm(imageDest, { force: true });
        });
      } catch (e) {
        await rollback();
        return err(fsError("copy", imageDest, e));
      }
    }

    let entryData: DesktopEntryData;
    if (metadata.entry !== null) {
      entryData = metadata.entry;
    } else {
      entryData = fallbackEntry(appId, path.basename(sourcePath));
      warnings.push("no embedded desktop entry; generated a minimal one");
    }

    const iconName = metadata.icons.length > 0 ? appId : GENERIC_ICON;
    if (metadata.icons.length === 0) {
      warnings.push("no icons found; using a generic icon");
    }
    const rendered = renderDesktopEntry(entryData, { exec: targetPath, icon: iconName });

    let written: Result<void, { readonly kind: "fs"; readonly op: string; readonly path: string; readonly cause: string }>;
    if (staging) {
      try {
        await writeFile(entryDest, rendered);
        written = ok(undefined);
      } catch (e) {
        written = err({
          kind: "fs",
          op: "write-entry",
          path: entryDest,
          cause: e instanceof Error ? e.message : String(e),
        });
      }
    } else {
      written = await writeEntry(paths.applicationsDir, appId, rendered);
    }
    if (!written.ok) {
      await rollback();
      return err(fsError(written.error.op, written.error.path, written.error.cause));
    }
    undo.push(async () => {
      await rm(entryDest, { force: true });
    });

    const iconsResult = await installIcons(paths.iconThemeDir, appId, metadata.icons);
    if (!iconsResult.ok) {
      await rollback();
      return err(fsError(iconsResult.error.op, iconsResult.error.path, iconsResult.error.cause));
    }
    const installedIcons = iconsResult.value;
    if (installedIcons.length > 0 && !staging) {
      const themeDir = paths.iconThemeDir;
      undo.push(async () => {
        await removeIcons(themeDir, appId);
      });
    }

    if (staging) {
      try {
        await rm(entryPath, { force: true });
        await rename(entryDest, entryPath);
        await rm(targetPath, { force: true });
        await rename(imageDest, targetPath);
      } catch (e) {
        await rollback();
        return err(fsError("force-swap", targetPath, e));
      }
    }

    await refreshCaches();

    let sourceDeleted = false;
    if (opts.deleteSource && copied) {
      try {
        await rm(sourcePath);
        sourceDeleted = true;
      } catch (e) {
        warnings.push(`could not delete source: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return ok({
      appId,
      name: entryData.name,
      appImagePath: targetPath,
      entryPath,
      icons: installedIcons,
      warnings,
      sourceDeleted,
    });
  } catch (e) {
    await rollback();
    return err(fsError("install", sourcePath, e));
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

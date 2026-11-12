import { chmod, copyFile, mkdtemp, rm, stat } from "node:fs/promises";
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
    const sourceIsTarget = path.resolve(sourcePath) === path.resolve(targetPath);

    if (!sourceIsTarget && (await exists(targetPath))) {
      if (!opts.force) {
        return err({ kind: "collision", appId, existingPath: targetPath });
      }
      await rm(targetPath, { force: true });
      await rm(path.join(paths.applicationsDir, `${appId}.desktop`), { force: true });
      await removeIcons(paths.iconThemeDir, appId);
    }

    let copied = false;
    if (!sourceIsTarget) {
      try {
        await copyFile(sourcePath, targetPath);
        await chmod(targetPath, 0o755);
        copied = true;
        undo.push(async () => {
          await rm(targetPath, { force: true });
        });
      } catch (e) {
        await rollback();
        return err(fsError("copy", targetPath, e));
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

    const entryPath = path.join(paths.applicationsDir, `${appId}.desktop`);
    const written = await writeEntry(paths.applicationsDir, appId, rendered);
    if (!written.ok) {
      await rollback();
      return err(fsError(written.error.op, written.error.path, written.error.cause));
    }
    undo.push(async () => {
      await rm(entryPath, { force: true });
    });

    const iconsResult = await installIcons(paths.iconThemeDir, appId, metadata.icons);
    if (!iconsResult.ok) {
      await rollback();
      return err(fsError(iconsResult.error.op, iconsResult.error.path, iconsResult.error.cause));
    }
    const installedIcons = iconsResult.value;
    if (installedIcons.length > 0) {
      const themeDir = paths.iconThemeDir;
      undo.push(async () => {
        await removeIcons(themeDir, appId);
      });
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

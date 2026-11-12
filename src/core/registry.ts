import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectAppImage } from "./appimage.ts";
import { fallbackEntry, isSafeEntryId, listEntries, readEntry, removeEntry, renderDesktopEntry, writeEntry } from "./desktop.ts";
import { installIcons, refreshCaches, removeIcons } from "./icons.ts";
import type { XdgPaths } from "./paths.ts";
import { err, ok, type Result } from "./result.ts";

export interface InstalledApp {
  readonly appId: string;
  readonly name: string;
  readonly version: string | null;
  readonly appImagePath: string;
  readonly entryPath: string;
}

export type RegistryError = { readonly kind: "fs"; readonly op: string; readonly path: string; readonly cause: string };

export interface SyncReport {
  readonly regenerated: readonly string[];
  readonly pruned: readonly string[];
}

function fsError(op: string, p: string, e: unknown): RegistryError {
  return { kind: "fs", op, path: p, cause: e instanceof Error ? e.message : String(e) };
}

async function storedAppIds(appsDir: string): Promise<Result<string[], RegistryError>> {
  let files: string[];
  try {
    files = await readdir(appsDir);
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT") return ok([]);
    return err(fsError("list-storage", appsDir, e));
  }
  return ok(
    files
      .filter((f) => /\.appimage$/i.test(f))
      .map((f) => f.replace(/\.appimage$/i, ""))
      .sort(),
  );
}

export async function listInstalled(paths: XdgPaths): Promise<Result<InstalledApp[], RegistryError>> {
  const ids = await storedAppIds(paths.appsDir);
  if (!ids.ok) return ids;
  const apps: InstalledApp[] = [];
  for (const appId of ids.value) {
    const appImagePath = path.join(paths.appsDir, `${appId}.appimage`);
    const entryPath = path.join(paths.applicationsDir, `${appId}.desktop`);
    let usable = null;
    if (isSafeEntryId(appId)) {
      const entry = await readEntry(paths.applicationsDir, appId);
      usable = entry.ok ? entry.value : null;
    }
    apps.push({
      appId,
      name: usable?.name ?? appId,
      version: usable?.version ?? null,
      appImagePath,
      entryPath,
    });
  }
  apps.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.appId.localeCompare(b.appId));
  return ok(apps);
}

async function readExecRaw(entryFile: string): Promise<string | null> {
  try {
    const text = await readFile(entryFile, "utf8");
    for (const line of text.split("\n")) {
      if (line.startsWith("Exec=")) return line.slice("Exec=".length).trim();
    }
    return null;
  } catch {
    return null;
  }
}

function isManagedExec(exec: string, storageRoot: string): boolean {
  const unquoted = exec.replace(/^"(.*)"$/, "$1");
  const root = path.resolve(storageRoot);
  return unquoted === root || unquoted.startsWith(root + path.sep);
}

async function reintegrate(appId: string, imagePath: string, paths: XdgPaths): Promise<boolean> {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "app-img-sync-"));
  try {
    const inspected = await inspectAppImage(imagePath, workDir);
    if (!inspected.ok) return false;
    const metadata = inspected.value;
    const entryData = metadata.entry ?? fallbackEntry(appId, path.basename(imagePath));
    const iconName = metadata.icons.length > 0 ? appId : "application-x-executable";
    const rendered = renderDesktopEntry(entryData, { exec: imagePath, icon: iconName });
    const written = await writeEntry(paths.applicationsDir, appId, rendered);
    if (!written.ok) return false;
    const icons = await installIcons(paths.iconThemeDir, appId, metadata.icons);
    if (!icons.ok) {
      // Do not leave a half-integrated app: the entry would make future syncs
      // skip icon installation forever.
      await removeEntry(paths.applicationsDir, appId);
      return false;
    }
    return true;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function sync(paths: XdgPaths): Promise<Result<SyncReport, RegistryError>> {
  const ids = await storedAppIds(paths.appsDir);
  if (!ids.ok) return ids;
  const idSet = new Set(ids.value);
  const regenerated: string[] = [];
  const pruned: string[] = [];

  // Prune orphaned managed entries.
  const entries = await listEntries(paths.applicationsDir);
  if (!entries.ok) return entries;
  for (const entry of entries.value) {
    if (idSet.has(entry.id)) continue;
    const exec = await readExecRaw(path.join(paths.applicationsDir, `${entry.id}.desktop`));
    if (exec === null || !isManagedExec(exec, paths.storageRoot)) continue;
    const removed = await removeEntry(paths.applicationsDir, entry.id);
    if (!removed.ok) return removed;
    if (removed.value) {
      const icons = await removeIcons(paths.iconThemeDir, entry.id);
      if (!icons.ok) return icons;
      pruned.push(entry.id);
    }
  }

  // Regenerate missing integration.
  for (const appId of ids.value) {
    const entry = await readEntry(paths.applicationsDir, appId);
    if (entry.ok && entry.value !== null) continue;
    const okReintegrated = await reintegrate(appId, path.join(paths.appsDir, `${appId}.appimage`), paths);
    if (okReintegrated) regenerated.push(appId);
  }

  if (regenerated.length > 0 || pruned.length > 0) {
    await refreshCaches();
  }

  return ok({ regenerated, pruned });
}

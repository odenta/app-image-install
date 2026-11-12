import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { err, ok, type Result } from "./result.ts";
import { readEntry, removeEntry } from "./desktop.ts";
import { refreshCaches, removeIcons } from "./icons.ts";
import type { XdgPaths } from "./paths.ts";

export interface RemoveReport {
  readonly appId: string;
  readonly removedImage: boolean;
  readonly removedEntry: boolean;
  readonly removedIcons: number;
}

export type RemoveError =
  | { readonly kind: "not-found"; readonly query: string; readonly candidates: readonly string[] }
  | { readonly kind: "fs"; readonly op: string; readonly path: string; readonly cause: string };

function fsError(op: string, p: string, e: unknown): RemoveError {
  return { kind: "fs", op, path: p, cause: e instanceof Error ? e.message : String(e) };
}

function appIdOfImage(fileName: string): string {
  return fileName.replace(/\.appimage$/i, "");
}

async function storedAppIds(appsDir: string): Promise<Result<string[], RemoveError>> {
  let files: string[];
  try {
    files = await readdir(appsDir);
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT") return ok([]);
    return err(fsError("list", appsDir, e));
  }
  return ok(files.filter((f) => /\.appimage$/i.test(f)).map(appIdOfImage));
}

export async function removeApp(paths: XdgPaths, query: string): Promise<Result<RemoveReport, RemoveError>> {
  const q = query.trim().toLowerCase();
  const ids = await storedAppIds(paths.appsDir);
  if (!ids.ok) return ids;
  const candidates = [...new Set(ids.value)].sort();

  const matches: string[] = [];
  for (const appId of candidates) {
    if (appId.toLowerCase() === q) {
      matches.push(appId);
      continue;
    }
    const entry = await readEntry(paths.applicationsDir, appId);
    if (entry.ok && entry.value !== null && entry.value.name.trim().toLowerCase() === q) {
      matches.push(appId);
    }
  }

  if (matches.length !== 1) {
    return err({ kind: "not-found", query, candidates: matches.length > 1 ? matches : candidates });
  }
  const appId = matches[0] as string;

  const imagePath = path.join(paths.appsDir, `${appId}.appimage`);
  let removedImage = false;
  try {
    await rm(imagePath);
    removedImage = true;
  } catch (e) {
    if (!(e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT")) {
      return err(fsError("remove-image", imagePath, e));
    }
  }

  const entryResult = await removeEntry(paths.applicationsDir, appId);
  if (!entryResult.ok) return entryResult;
  const removedEntry = entryResult.value;

  const iconsResult = await removeIcons(paths.iconThemeDir, appId);
  if (!iconsResult.ok) return iconsResult;

  await refreshCaches();

  return ok({ appId, removedImage, removedEntry, removedIcons: iconsResult.value });
}

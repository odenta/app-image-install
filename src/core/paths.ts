import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { err, ok, type Result } from "./result.ts";

export interface XdgPaths {
  /** AppImage storage, e.g. ~/.local/Apps */
  readonly appsDir: string;
  /** Desktop entries, e.g. ~/.local/share/applications */
  readonly applicationsDir: string;
  /** Icon theme root, e.g. ~/.local/share/icons/hicolor */
  readonly iconThemeDir: string;
  /** Root that owns managed artifacts; Exec= inside it marks an entry as ours. */
  readonly storageRoot: string;
}

export interface PathOverrides {
  readonly appsDir?: string;
  readonly applicationsDir?: string;
  readonly iconThemeDir?: string;
  readonly storageRoot?: string;
  readonly homeDir?: string;
  readonly dataHome?: string;
}

export type PathsError = {
  readonly kind: "mkdir-failed";
  readonly path: string;
  readonly cause: string;
};

function absoluteOr(value: string | undefined, fallback: string): string {
  if (value && path.isAbsolute(value)) return path.resolve(value);
  return path.resolve(fallback);
}

function resolveDataHome(overrides: PathOverrides | undefined, homeDir: string): string {
  const fromOverride = overrides?.dataHome;
  if (fromOverride && path.isAbsolute(fromOverride)) return path.resolve(fromOverride);
  const fromEnv = process.env.XDG_DATA_HOME;
  if (fromEnv && path.isAbsolute(fromEnv)) return path.resolve(fromEnv);
  return path.join(homeDir, ".local", "share");
}

export function resolvePaths(overrides?: PathOverrides): XdgPaths {
  const homeDir = path.resolve(overrides?.homeDir ?? os.homedir());
  const dataHome = resolveDataHome(overrides, homeDir);

  const appsDir = absoluteOr(overrides?.appsDir, path.join(homeDir, ".local", "Apps"));
  const applicationsDir = absoluteOr(overrides?.applicationsDir, path.join(dataHome, "applications"));
  const iconThemeDir = absoluteOr(overrides?.iconThemeDir, path.join(dataHome, "icons", "hicolor"));
  const storageRoot = absoluteOr(overrides?.storageRoot, appsDir);

  return { appsDir, applicationsDir, iconThemeDir, storageRoot };
}

export async function ensurePaths(paths: XdgPaths): Promise<Result<void, PathsError>> {
  for (const dir of [paths.appsDir, paths.applicationsDir, paths.iconThemeDir]) {
    try {
      await mkdir(dir, { recursive: true, mode: 0o755 });
    } catch (e) {
      return err({ kind: "mkdir-failed", path: dir, cause: e instanceof Error ? e.message : String(e) });
    }
  }
  return ok(undefined);
}

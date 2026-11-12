// Electrobun main process — thin delegate over core modules (approved `gui` contract).
// The webview holds no integration logic; everything flows through the typed RPC schema.
import path from "node:path";
import { BrowserView, BrowserWindow, Utils } from "electrobun/main";
import { installAppImage } from "../../core/installer.ts";
import { ensurePaths, resolvePaths } from "../../core/paths.ts";
import { listInstalled, type InstalledApp } from "../../core/registry.ts";
import { removeApp } from "../../core/remove.ts";
import type { AddResultDto, AppDto, GuiSchema } from "../rpc.ts";

const paths = resolvePaths();

function toDto(app: InstalledApp): AppDto {
  return { appId: app.appId, name: app.name, version: app.version, appImagePath: app.appImagePath };
}

function coreError(e: { kind: string } & Record<string, unknown>): string {
  if (e.kind === "fs") return `${e.op} failed on ${e.path}: ${e.cause}`;
  if (e.kind === "not-found") return "no installed app matches";
  if (e.kind === "source-not-found") return `file not found: ${e.path}`;
  if (e.kind === "invalid-appimage") return `not a usable AppImage: ${e.cause}`;
  if (e.kind === "collision") return `'${e.appId}' is already installed; use --force to replace`;
  return e.kind;
}

// Same rules as core.installer's isSafeAppId: the webview-supplied appId must never
// escape the storage directory (approved gui contract: no process capability via RPC).
function isSafeAppId(appId: string): boolean {
  return appId !== "" && !appId.includes("/") && appId !== "." && appId !== ".." && !appId.includes("\\");
}

const rpc = BrowserView.defineRPC<GuiSchema>({
  handlers: {
    requests: {
      listApps: async () => {
        const result = await listInstalled(paths);
        if (!result.ok) throw new Error(coreError(result.error));
        return result.value.map(toDto);
      },

      addApps: async (): Promise<AddResultDto> => {
        const picked = await Utils.openFileDialog({
          startingFolder: "~/",
          allowedFileTypes: "*.appimage *.AppImage",
          canChooseFiles: true,
          canChooseDirectory: false,
          allowsMultipleSelection: true,
        });
        if (picked.length === 0) return { installed: [], failed: [], cancelled: true };

        await ensurePaths(paths);
        const installed: { appId: string; name: string; warnings: readonly string[] }[] = [];
        const failed: { file: string; error: string }[] = [];
        for (const file of picked) {
          const result = await installAppImage(file, paths, {});
          if (result.ok) {
            installed.push({ appId: result.value.appId, name: result.value.name, warnings: result.value.warnings });
          } else {
            failed.push({ file, error: coreError(result.error) });
          }
        }
        rpc.send.appsChanged({});
        return { installed, failed, cancelled: false };
      },

      removeApp: async ({ appId }) => {
        const result = await removeApp(paths, appId);
        if (!result.ok) throw new Error(coreError(result.error));
        rpc.send.appsChanged({});
        return { removed: true };
      },

      launchApp: async ({ appId }) => {
        if (!isSafeAppId(appId)) {
          throw new Error(`invalid app id '${appId}'`);
        }
        const imagePath = path.resolve(paths.appsDir, `${appId}.appimage`);
        if (!imagePath.startsWith(path.resolve(paths.appsDir) + path.sep)) {
          throw new Error(`invalid app id '${appId}'`);
        }
        try {
          Bun.spawn([imagePath], { stdio: ["ignore", "ignore", "ignore"] }).unref();
        } catch (e) {
          throw new Error(`could not launch ${appId}: ${e instanceof Error ? e.message : String(e)}`);
        }
        return { launched: true };
      },
    },
  },
});

new BrowserWindow({
  title: "App Image Installer",
  url: "views://mainview/index.html",
  frame: {
    width: 760,
    height: 520,
  },
  rpc,
});

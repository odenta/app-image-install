import { existsSync } from "node:fs";
import path from "node:path";
import { installAppImage } from "../core/installer.ts";
import { listInstalled, sync } from "../core/registry.ts";
import { removeApp } from "../core/remove.ts";
import { ensurePaths, resolvePaths, type PathOverrides } from "../core/paths.ts";
import type { InstallError } from "../core/installer.ts";

export interface CliIO {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

export interface CliDeps {
  readonly io: CliIO;
  readonly paths?: PathOverrides;
}

const USAGE = `app-img-installer — integrate AppImages into your desktop

Usage:
  app-img-installer install <file>… [--delete-source] [--force]
  app-img-installer remove <name>
  app-img-installer list
  app-img-installer sync
  app-img-installer gui
  app-img-installer --help
`;

function installErrorText(error: InstallError): string {
  switch (error.kind) {
    case "source-not-found":
      return `not found: ${error.path}`;
    case "invalid-appimage":
      return `not a usable AppImage: ${error.cause}`;
    case "collision":
      return `'${error.appId}' is already installed (${error.existingPath}); use --force to replace`;
    case "fs":
      return `${error.op} failed on ${error.path}: ${error.cause}`;
  }
}

async function cmdInstall(files: string[], flags: Set<string>, deps: CliDeps): Promise<number> {
  const paths = resolvePaths(deps.paths);
  const ensured = await ensurePaths(paths);
  if (!ensured.ok) {
    deps.io.stderr(`error: could not create ${ensured.error.path}: ${ensured.error.cause}`);
    return 1;
  }
  let failures = 0;
  for (const file of files) {
    const result = await installAppImage(file, paths, {
      deleteSource: flags.has("--delete-source"),
      force: flags.has("--force"),
    });
    if (!result.ok) {
      deps.io.stderr(`error: ${file}: ${installErrorText(result.error)}`);
      failures++;
      continue;
    }
    deps.io.stdout(`Installed ${result.value.name} (${result.value.appId})`);
    for (const warning of result.value.warnings) {
      deps.io.stderr(`warning: ${result.value.appId}: ${warning}`);
    }
    if (result.value.sourceDeleted) {
      deps.io.stdout(`Deleted source ${file}`);
    }
  }
  return failures === 0 ? 0 : 1;
}

async function cmdRemove(query: string, deps: CliDeps): Promise<number> {
  const result = await removeApp(resolvePaths(deps.paths), query);
  if (!result.ok) {
    if (result.error.kind === "not-found") {
      const listed = result.error.candidates.length > 0 ? `: ${result.error.candidates.join(", ")}` : "";
      deps.io.stderr(`error: no installed app matches '${query}'${listed}`);
    } else {
      deps.io.stderr(`error: ${result.error.op} failed on ${result.error.path}: ${result.error.cause}`);
    }
    return 1;
  }
  deps.io.stdout(
    `Removed ${result.value.appId} (image: ${result.value.removedImage ? "yes" : "absent"}, ` +
      `entry: ${result.value.removedEntry ? "yes" : "absent"}, icons: ${result.value.removedIcons})`,
  );
  return 0;
}

async function cmdList(deps: CliDeps): Promise<number> {
  const result = await listInstalled(resolvePaths(deps.paths));
  if (!result.ok) {
    deps.io.stderr(`error: ${result.error.op} failed on ${result.error.path}: ${result.error.cause}`);
    return 1;
  }
  const nameW = Math.max("NAME".length, ...result.value.map((a) => a.name.length));
  const verW = Math.max("VERSION".length, ...result.value.map((a) => (a.version ?? "").length));
  deps.io.stdout(`${"NAME".padEnd(nameW)}  ${"VERSION".padEnd(verW)}  PATH`);
  for (const app of result.value) {
    deps.io.stdout(`${app.name.padEnd(nameW)}  ${(app.version ?? "").padEnd(verW)}  ${app.appImagePath}`);
  }
  return 0;
}

async function cmdSync(deps: CliDeps): Promise<number> {
  const paths = resolvePaths(deps.paths);
  const result = await sync(paths);
  if (!result.ok) {
    deps.io.stderr(`error: ${result.error.op} failed on ${result.error.path}: ${result.error.cause}`);
    return 1;
  }
  if (result.value.regenerated.length > 0) {
    deps.io.stdout(`regenerated: ${result.value.regenerated.join(", ")}`);
  }
  if (result.value.pruned.length > 0) {
    deps.io.stdout(`pruned: ${result.value.pruned.join(", ")}`);
  }
  const listed = await listInstalled(paths);
  if (listed.ok && listed.value.length > result.value.regenerated.length) {
    const integrated = new Set(result.value.regenerated);
    const missing = listed.value.filter((a) => !integrated.has(a.appId)).map((a) => a.appId);
    if (missing.length > 0) {
      deps.io.stderr(`warning: some images could not be re-integrated: ${missing.join(", ")}`);
    }
  }
  return 0;
}

async function cmdGui(): Promise<number> {
  const guiEntry = resolveGuiEntry();
  if (guiEntry === null) {
    console.error("error: GUI is not built in this wave");
    return 1;
  }
  try {
    Bun.spawn(["bun", guiEntry], { stdio: ["ignore", "inherit", "inherit"] }).unref();
    return 0;
  } catch (e) {
    console.error(`error: could not launch GUI: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

function resolveGuiEntry(): string | null {
  const entry = path.resolve(import.meta.dir, "../gui/main.ts");
  return existsSync(entry) ? entry : null;
}

export async function runCli(argv: readonly string[], deps: CliDeps): Promise<number> {
  const args = [...argv];
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    deps.io.stdout(USAGE);
    return 0;
  }

  const command = args[0] ?? "";
  const rest = args.slice(1);

  switch (command) {
    case "install": {
      const flags = new Set(rest.filter((a) => a.startsWith("--")));
      const files = rest.filter((a) => !a.startsWith("--"));
      const known = new Set(["--delete-source", "--force"]);
      for (const flag of flags) {
        if (!known.has(flag)) {
          deps.io.stderr(`error: unknown flag '${flag}'\n${USAGE}`);
          return 2;
        }
      }
      if (files.length === 0) {
        deps.io.stderr(`error: install requires at least one file\n${USAGE}`);
        return 2;
      }
      return cmdInstall(files, flags, deps);
    }
    case "remove": {
      if (rest.length !== 1) {
        deps.io.stderr(`error: remove requires exactly one name\n${USAGE}`);
        return 2;
      }
      return cmdRemove(rest[0] as string, deps);
    }
    case "list": {
      if (rest.length !== 0) {
        deps.io.stderr(`error: list takes no arguments\n${USAGE}`);
        return 2;
      }
      return cmdList(deps);
    }
    case "sync": {
      if (rest.length !== 0) {
        deps.io.stderr(`error: sync takes no arguments\n${USAGE}`);
        return 2;
      }
      return cmdSync(deps);
    }
    case "gui": {
      if (rest.length !== 0) {
        deps.io.stderr(`error: gui takes no arguments\n${USAGE}`);
        return 2;
      }
      return cmdGui();
    }
    default: {
      deps.io.stderr(`error: unknown command '${command}'\n${USAGE}`);
      return 2;
    }
  }
}

import { readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { err, ok, type Result } from "./result.ts";

export interface DesktopEntryData {
  /** File name without ".desktop". */
  readonly id: string;
  readonly name: string;
  readonly exec: string | null;
  readonly icon: string | null;
  readonly comment: string | null;
  readonly categories: readonly string[];
  readonly terminal: boolean;
  readonly version: string | null;
  /** Non-[Desktop Entry] groups preserved verbatim (action groups etc.). */
  readonly otherGroups: readonly { readonly name: string; readonly lines: readonly string[] }[];
  /** All other keys, verbatim (including locale-suffixed variants). */
  readonly extra: Readonly<Record<string, string>>;
}

export type DesktopParseError =
  | { readonly kind: "empty-entry" }
  | { readonly kind: "missing-name"; readonly id: string };

export type EntryFsError = {
  readonly kind: "fs";
  readonly op: string;
  readonly path: string;
  readonly cause: string;
};

const KNOWN_KEYS = new Set([
  "type",
  "name",
  "exec",
  "icon",
  "comment",
  "categories",
  "terminal",
  "x-appimage-version",
]);

function assertSafeId(id: string): void {
  if (id === "" || id.includes("/") || id === "." || id === ".." || path.basename(id) !== id) {
    throw new Error(`programmer error: unsafe desktop entry id '${id}'`);
  }
}

interface MutableGroup {
  name: string;
  lines: string[];
}

export function parseDesktopEntry(id: string, text: string): Result<DesktopEntryData, DesktopParseError> {
  const groups: MutableGroup[] = [];
  let current: MutableGroup | null = null;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "" || line.startsWith("#")) continue;
    const group = /^\[(.+)\]$/.exec(line);
    if (group && group[1] !== undefined) {
      current = { name: group[1], lines: [] };
      groups.push(current);
      continue;
    }
    current?.lines.push(line);
  }

  const main = groups.find((g) => g.name === "Desktop Entry") ?? null;
  const otherGroups = groups.filter((g) => g.name !== "Desktop Entry");

  const extra: Record<string, string> = {};
  let name: string | undefined;
  let exec: string | null = null;
  let icon: string | null = null;
  let comment: string | null = null;
  let categories: readonly string[] = [];
  let sawCategories = false;
  let terminal = false;
  let sawTerminal = false;
  let version: string | null = null;

  if (main !== null) {
    for (const line of main.lines) {
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1);
      const lower = key.toLowerCase();
      // First occurrence wins, for known and unknown keys alike.
      if (KNOWN_KEYS.has(lower)) {
        if (lower === "type") continue; // consumed: renderer owns Type=Application
        const alreadySeen =
          (lower === "name" && name !== undefined) ||
          (lower === "exec" && exec !== null) ||
          (lower === "icon" && icon !== null) ||
          (lower === "comment" && comment !== null) ||
          (lower === "categories" && sawCategories) ||
          (lower === "terminal" && sawTerminal) ||
          (lower === "x-appimage-version" && version !== null);
        if (alreadySeen) continue;
        switch (lower) {
          case "name":
            name = value;
            break;
          case "exec":
            exec = value;
            break;
          case "icon":
            icon = value;
            break;
          case "comment":
            comment = value;
            break;
          case "categories":
            categories = value.split(";").map((s) => s.trim()).filter((s) => s !== "");
            sawCategories = true;
            break;
          case "terminal":
            terminal = value.trim().toLowerCase() === "true";
            sawTerminal = true;
            break;
          case "x-appimage-version":
            version = value;
            break;
        }
        continue;
      }
      if (!(key in extra)) extra[key] = value;
    }
  }

  if (main === null || main.lines.length === 0) {
    return err({ kind: "empty-entry" });
  }
  if (name === undefined || name.trim() === "") {
    return err({ kind: "missing-name", id });
  }
  return ok({
    id,
    name,
    exec,
    icon,
    comment,
    categories,
    terminal,
    version,
    otherGroups: otherGroups.map((g) => ({ name: g.name, lines: [...g.lines] })),
    extra,
  });
}

export interface EntryOverrides {
  readonly exec: string;
  readonly icon: string;
}

export function renderDesktopEntry(data: DesktopEntryData, overrides: EntryOverrides): string {
  const lines: string[] = [];
  lines.push("[Desktop Entry]");
  lines.push("Type=Application");
  lines.push(`Name=${data.name}`);
  if (data.comment !== null) lines.push(`Comment=${data.comment}`);
  lines.push(`Exec=${overrides.exec}`);
  lines.push(`Icon=${overrides.icon}`);
  if (data.categories.length > 0) lines.push(`Categories=${[...data.categories, ""].join(";")}`);
  lines.push(`Terminal=${data.terminal ? "true" : "false"}`);
  for (const key of Object.keys(data.extra).sort()) {
    lines.push(`${key}=${data.extra[key]}`);
  }
  if (data.version !== null) lines.push(`X-AppImage-Version=${data.version}`);
  for (const group of data.otherGroups) {
    lines.push(`[${group.name}]`);
    for (const line of group.lines) lines.push(line);
  }
  return `${lines.join("\n")}\n`;
}

export function fallbackEntry(appId: string, sourceFileName: string): DesktopEntryData {
  assertSafeId(appId);
  const base = sourceFileName.replace(/\.[^./\\]*$/, "");
  const cleaned = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return {
    id: appId,
    name: cleaned === "" ? appId : cleaned,
    exec: null,
    icon: null,
    comment: null,
    categories: [],
    terminal: false,
    version: null,
    otherGroups: [],
    extra: {},
  };
}

function fsError(op: string, entryPath: string, e: unknown): EntryFsError {
  return { kind: "fs", op, path: entryPath, cause: e instanceof Error ? e.message : String(e) };
}

function entryPath(applicationsDir: string, id: string): string {
  assertSafeId(id);
  return path.join(applicationsDir, `${id}.desktop`);
}

export async function readEntry(
  applicationsDir: string,
  id: string,
): Promise<Result<DesktopEntryData | null, EntryFsError | DesktopParseError>> {
  const p = entryPath(applicationsDir, id);
  let text: string;
  try {
    text = await readFile(p, "utf8");
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") return ok(null);
    return err(fsError("read", p, e));
  }
  return parseDesktopEntry(id, text);
}

export async function writeEntry(applicationsDir: string, id: string, rendered: string): Promise<Result<void, EntryFsError>> {
  const p = entryPath(applicationsDir, id);
  const tmp = `${p}.tmp`;
  try {
    await writeFile(tmp, rendered);
    await rename(tmp, p);
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => {});
    return err(fsError("write", p, e));
  }
  return ok(undefined);
}

export async function removeEntry(applicationsDir: string, id: string): Promise<Result<boolean, EntryFsError>> {
  const p = entryPath(applicationsDir, id);
  try {
    await rm(p);
    return ok(true);
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") return ok(false);
    return err(fsError("remove", p, e));
  }
}

export async function listEntries(applicationsDir: string): Promise<Result<DesktopEntryData[], EntryFsError>> {
  let files: string[];
  try {
    files = (await readdir(applicationsDir)).filter((f) => f.endsWith(".desktop")).sort();
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") return ok([]);
    return err(fsError("list", applicationsDir, e));
  }
  const out: DesktopEntryData[] = [];
  for (const file of files) {
    const id = file.slice(0, -".desktop".length);
    const parsed = await readEntry(applicationsDir, id);
    if (parsed.ok && parsed.value !== null) out.push(parsed.value);
    // unparseable or unreadable entries are skipped (resilience per SDR)
  }
  return ok(out);
}

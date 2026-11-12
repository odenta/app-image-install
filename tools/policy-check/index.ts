#!/usr/bin/env bun
/**
 * tools/policy-check — deterministic architecture/contract policy checks.
 *
 * Verifies (workflow spec §13.2, §13.3):
 *  1. Every contracts/*.md has parseable YAML frontmatter with id, kind, status, revision, architecture.
 *  2. Contract IDs are unique; `architecture` field equals `id`; `kind` is `module-contract`.
 *  3. Frontmatter `dependencies:` lists resolve to known contract IDs.
 *  4. Dependency policy: core.* must not depend on cli/gui; cli and gui must not depend on each other.
 *  5. Every module ID named in architecture/model.md has a contract.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../..");
const CONTRACTS_DIR = path.join(ROOT, "contracts");
const MODEL_FILE = path.join(ROOT, "architecture", "model.md");

const FRONTS = new Set(["cli", "gui"]);
const errors: string[] = [];

interface ParsedContract {
  file: string;
  id: string;
  dependencies: string[];
}

function parseFrontmatter(text: string): Record<string, string | string[]> | null {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---", 4);
  if (end === -1) return null;
  const data: Record<string, string | string[]> = {};
  let listKey: string | null = null;
  for (const line of text.slice(4, end).split("\n")) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
    if (kv && kv[1] !== undefined && kv[2] !== undefined) {
      const key = kv[1];
      const value = kv[2];
      if (value.trim() === "") {
        data[key] = [];
        listKey = key;
      } else {
        data[key] = value.trim();
        listKey = null;
      }
      continue;
    }
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && item[1] !== undefined && listKey) {
      (data[listKey] as string[]).push(item[1].trim());
    }
  }
  return data;
}

async function loadContracts(): Promise<ParsedContract[]> {
  let files: string[] = [];
  try {
    files = (await readdir(CONTRACTS_DIR)).filter((f) => f.endsWith(".md")).sort();
  } catch {
    errors.push(`contracts/ not found at ${CONTRACTS_DIR}`);
    return [];
  }
  const contracts: ParsedContract[] = [];
  const seen = new Map<string, string>();
  for (const file of files) {
    const rel = `contracts/${file}`;
    const fm = parseFrontmatter(await readFile(path.join(CONTRACTS_DIR, file), "utf8"));
    if (!fm) {
      errors.push(`${rel}: missing or malformed YAML frontmatter`);
      continue;
    }
    for (const field of ["id", "kind", "status", "revision", "architecture"]) {
      if (typeof fm[field] !== "string" || fm[field] === "") {
        errors.push(`${rel}: frontmatter field '${field}' missing or empty`);
      }
    }
    const id = fm.id as string | undefined;
    if (!id) continue;
    if (seen.has(id)) errors.push(`${rel}: duplicate contract id '${id}' (also in ${seen.get(id)})`);
    seen.set(id, rel);
    if (fm.kind !== "module-contract") errors.push(`${rel}: kind must be 'module-contract', got '${String(fm.kind)}'`);
    if (fm.architecture !== id) errors.push(`${rel}: architecture ('${String(fm.architecture)}') must equal id ('${id}')`);
    const deps = Array.isArray(fm.dependencies) ? (fm.dependencies as string[]) : [];
    contracts.push({ file: rel, id, dependencies: deps });
  }
  return contracts;
}

function checkDependencyPolicy(contracts: ParsedContract[]): void {
  const known = new Set(contracts.map((c) => c.id));
  for (const c of contracts) {
    for (const dep of c.dependencies) {
      if (!known.has(dep)) {
        errors.push(`${c.file}: dependency '${dep}' does not resolve to any contract`);
        continue;
      }
      const front = FRONTS.has(c.id);
      const depIsFront = FRONTS.has(dep);
      if (!front && depIsFront) {
        errors.push(`${c.file}: core module '${c.id}' may not depend on front '${dep}'`);
      }
    }
  }
  const cli = contracts.find((c) => c.id === "cli");
  const gui = contracts.find((c) => c.id === "gui");
  if (cli?.dependencies.includes("gui")) errors.push("cli may not depend on gui");
  if (gui?.dependencies.includes("cli")) errors.push("gui may not depend on cli");
}

async function checkModelCoverage(contracts: ParsedContract[]): Promise<void> {
  const model = await readFile(MODEL_FILE, "utf8");
  const known = new Set(contracts.map((c) => c.id));
  const ids = new Set<string>();
  for (const m of model.matchAll(/`((?:core|cli|gui)\.[A-Za-z]+|cli|gui)`/g)) {
    const id = m[1];
    if (id === undefined) continue;
    if (id.split(".").length === 2 || id === "cli" || id === "gui") ids.add(id);
  }
  for (const id of ids) {
    if (!known.has(id)) errors.push(`architecture/model.md names '${id}' with no matching contract`);
  }
}

const contracts = await loadContracts();
checkDependencyPolicy(contracts);
await checkModelCoverage(contracts);

if (errors.length > 0) {
  console.error(`policy-check: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`policy-check: OK (${contracts.length} contracts)`);

#!/usr/bin/env bun
/**
 * tools/policy-check — deterministic architecture/contract/SDR policy checks.
 *
 * Contract checks (workflow spec §13.2):
 *  1. Every contracts/*.md has parseable YAML frontmatter with id, kind, status, revision, architecture.
 *  2. Contract IDs are unique; `architecture` field equals `id`; `kind` is `module-contract`.
 *  3. Frontmatter `dependencies:` lists resolve to known contract IDs.
 *  4. Dependency policy: core.* must not depend on cli/gui; cli and gui must not depend on each other.
 *  5. Every module ID named in architecture/model.md has a contract.
 *
 * SDR checks (§7 blueprint validation, §13.3):
 *  6. Every implementation/active/<wave>/sources/*.md has frontmatter: id, kind=source-design,
 *     contract (resolving to an approved contract), contract_revision, targets (non-empty),
 *     depends_on, exports, verification.
 *  7. SDR IDs unique; every target file owned by exactly one SDR; depends_on resolve to SDR IDs; DAG acyclic.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../..");
const CONTRACTS_DIR = path.join(ROOT, "contracts");
const MODEL_FILE = path.join(ROOT, "architecture", "model.md");
const IMPL_DIR = path.join(ROOT, "implementation", "active");

const FRONTS = new Set(["cli", "gui"]);
const errors: string[] = [];

function parseFrontmatter(text: string, file: string): Record<string, string | string[]> | null {
  if (!text.startsWith("---\n")) {
    errors.push(`${file}: missing or malformed YAML frontmatter`);
    return null;
  }
  const end = text.indexOf("\n---", 4);
  if (end === -1) {
    errors.push(`${file}: unterminated frontmatter`);
    return null;
  }
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

function asList(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: string | string[] | undefined): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

// ---------- contracts ----------

interface ParsedContract {
  file: string;
  id: string;
  status: string;
  dependencies: string[];
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
    const fm = parseFrontmatter(await readFile(path.join(CONTRACTS_DIR, file), "utf8"), rel);
    if (!fm) continue;
    for (const field of ["id", "kind", "status", "revision", "architecture"]) {
      if (asString(fm[field]) === null) errors.push(`${rel}: frontmatter field '${field}' missing or empty`);
    }
    const id = asString(fm.id);
    const status = asString(fm.status) ?? "";
    if (!id) continue;
    if (seen.has(id)) errors.push(`${rel}: duplicate contract id '${id}' (also in ${seen.get(id)})`);
    seen.set(id, rel);
    if (fm.kind !== "module-contract") errors.push(`${rel}: kind must be 'module-contract', got '${String(fm.kind)}'`);
    if (fm.architecture !== id) errors.push(`${rel}: architecture ('${String(fm.architecture)}') must equal id ('${id}')`);
    contracts.push({ file: rel, id, status, dependencies: asList(fm.dependencies) });
  }
  return contracts;
}

function checkContractPolicy(contracts: ParsedContract[]): void {
  const known = new Set(contracts.map((c) => c.id));
  for (const c of contracts) {
    for (const dep of c.dependencies) {
      if (!known.has(dep)) {
        errors.push(`${c.file}: dependency '${dep}' does not resolve to any contract`);
        continue;
      }
      if (!FRONTS.has(c.id) && FRONTS.has(dep)) {
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
  for (const m of model.matchAll(/`((?:core)\.[A-Za-z]+|cli|gui)`/g)) {
    const id = m[1];
    if (id !== undefined) ids.add(id);
  }
  for (const id of ids) {
    if (!known.has(id)) errors.push(`architecture/model.md names '${id}' with no matching contract`);
  }
}

// ---------- SDRs ----------

interface ParsedSdr {
  file: string;
  id: string;
  contract: string;
  targets: string[];
  dependsOn: string[];
}

async function loadSdrs(contracts: ParsedContract[]): Promise<ParsedSdr[]> {
  let impls: string[] = [];
  try {
    impls = (await readdir(IMPL_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return []; // no active implementation waves yet
  }
  const approvedContracts = new Set(contracts.filter((c) => c.status === "approved").map((c) => c.id));
  const knownContracts = new Set(contracts.map((c) => c.id));
  const sdrs: ParsedSdr[] = [];
  const seenIds = new Map<string, string>();
  const seenTargets = new Map<string, string>();

  for (const impl of impls) {
    const sourcesDir = path.join(IMPL_DIR, impl, "sources");
    let files: string[] = [];
    try {
      files = (await readdir(sourcesDir)).filter((f) => f.endsWith(".md")).sort();
    } catch {
      errors.push(`implementation/active/${impl}/: missing sources/ directory`);
      continue;
    }
    for (const file of files) {
      const rel = `implementation/active/${impl}/sources/${file}`;
      const fm = parseFrontmatter(await readFile(path.join(sourcesDir, file), "utf8"), rel);
      if (!fm) continue;
      for (const field of ["id", "kind", "contract", "contract_revision", "targets", "depends_on", "exports", "verification"]) {
        if (fm[field] === undefined) errors.push(`${rel}: frontmatter field '${field}' missing`);
      }
      if (fm.kind !== "source-design") errors.push(`${rel}: kind must be 'source-design', got '${String(fm.kind)}'`);
      const id = asString(fm.id);
      const contract = asString(fm.contract);
      const targets = asList(fm.targets);
      if (!id) continue;
      if (seenIds.has(id)) errors.push(`${rel}: duplicate SDR id '${id}' (also in ${seenIds.get(id)})`);
      seenIds.set(id, rel);
      if (contract) {
        if (!knownContracts.has(contract)) {
          errors.push(`${rel}: contract '${contract}' does not resolve`);
        } else if (!approvedContracts.has(contract)) {
          errors.push(`${rel}: contract '${contract}' is not approved (status must be 'approved')`);
        }
      }
      if (targets.length === 0) errors.push(`${rel}: targets must list at least one file`);
      for (const target of targets) {
        if (seenTargets.has(target)) {
          errors.push(`${rel}: target '${target}' also owned by ${seenTargets.get(target)}`);
        }
        seenTargets.set(target, rel);
      }
      sdrs.push({ file: rel, id, contract: contract ?? "", targets, dependsOn: asList(fm.depends_on) });
    }
  }
  return sdrs;
}

function checkSdrDag(sdrs: ParsedSdr[]): void {
  const known = new Map(sdrs.map((s) => [s.id, s]));
  for (const s of sdrs) {
    for (const dep of s.dependsOn) {
      if (!known.has(dep)) errors.push(`${s.file}: depends_on '${dep}' does not resolve to any SDR`);
    }
  }
  // three-color DFS (white/gray/black); gray target = back edge = cycle
  const color = new Map<string, "gray" | "black">();
  const reported = new Set<string>();
  const visit = (id: string, trail: string[]): void => {
    color.set(id, "gray");
    const node = known.get(id);
    if (node) {
      for (const dep of node.dependsOn) {
        const state = color.get(dep);
        if (state === "gray") {
          const key = `${id}->${dep}`;
          if (!reported.has(key)) {
            reported.add(key);
            errors.push(`implementation DAG has a cycle: ${[...trail, id, dep].join(" -> ")}`);
          }
        } else if (state === undefined) {
          visit(dep, [...trail, id]);
        }
      }
    }
    color.set(id, "black");
  };
  for (const s of sdrs) {
    if (!color.has(s.id)) visit(s.id, []);
  }
}

// ---------- main ----------

const contracts = await loadContracts();
checkContractPolicy(contracts);
await checkModelCoverage(contracts);
const sdrs = await loadSdrs(contracts);
checkSdrDag(sdrs);

if (errors.length > 0) {
  console.error(`policy-check: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`policy-check: OK (${contracts.length} contracts, ${sdrs.length} SDRs)`);

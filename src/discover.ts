/**
 * The filesystem boundary. Everything that touches disk during read
 * operations lives here: finding fragment sources, loading the config,
 * and building the TreeView that drift detection scans for orphans.
 * Paths are repo-relative POSIX strings everywhere above this layer.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { CONFIG_FILE, DEFAULT_CONFIG, parseConfig, type Config } from "./config.js";
import type { TreeView } from "./drift.js";
import { CURSOR_RULES_DIR } from "./targets/cursor.js";
import { COPILOT_ROOT, COPILOT_SCOPED_DIR } from "./targets/copilot.js";

/** Directories never descended into while scanning the repo. */
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", ".venv", "vendor"]);

/** Load rulecast.json from the repo root, or defaults when absent. */
export function loadConfig(rootDir: string): { config: Config; configFile: string | null } {
  const path = join(rootDir, CONFIG_FILE);
  if (!existsSync(path)) {
    return { config: { ...DEFAULT_CONFIG, targets: [...DEFAULT_CONFIG.targets] }, configFile: null };
  }
  return { config: parseConfig(readFileSync(path, "utf8")), configFile: CONFIG_FILE };
}

/**
 * Find fragment sources: every `*.md` under the source dir, recursively,
 * except README.md files (a fragments directory deserves its own README
 * without it becoming a rule). Returned paths are relative to the source
 * dir, POSIX-separated, sorted.
 */
export function discoverFragments(rootDir: string, sourceDir: string): string[] {
  const base = join(rootDir, sourceDir);
  if (!existsSync(base) || !statSync(base).isDirectory()) return [];
  const found: string[] = [];
  walk(base, "", (rel, name) => {
    if (name.toLowerCase().endsWith(".md") && name.toLowerCase() !== "readme.md") {
      found.push(rel);
    }
  });
  return found.sort();
}

/** Does `relDir` exist as a directory under the repo root? (lint L108) */
export function makeDirExists(rootDir: string): (relDir: string) => boolean {
  return (relDir: string) => {
    const full = join(rootDir, ...relDir.split("/"));
    return existsSync(full) && statSync(full).isDirectory();
  };
}

/**
 * A TreeView over the real repo. Orphan candidates are collected from the
 * places rulecast ever writes: CLAUDE.md / AGENTS.md at any depth (skipping
 * dependency and VCS directories), Cursor's rules dir, and the two Copilot
 * locations. The source dir itself is excluded — fragments are inputs.
 */
export function makeTreeView(rootDir: string, config: Config): TreeView {
  return {
    read(relPath: string): string | null {
      const full = join(rootDir, ...relPath.split("/"));
      if (!existsSync(full) || !statSync(full).isFile()) return null;
      return readFileSync(full, "utf8");
    },
    candidates(): string[] {
      const out: string[] = [];
      walk(rootDir, "", (rel, name) => {
        if (rel === config.source || rel.startsWith(config.source + "/")) return;
        if (name === "CLAUDE.md" || name === "AGENTS.md") out.push(rel);
      });
      const cursorDir = join(rootDir, ...CURSOR_RULES_DIR.split("/"));
      if (existsSync(cursorDir) && statSync(cursorDir).isDirectory()) {
        for (const name of readdirSync(cursorDir).sort()) {
          if (name.endsWith(".mdc")) out.push(`${CURSOR_RULES_DIR}/${name}`);
        }
      }
      if (existsSync(join(rootDir, ...COPILOT_ROOT.split("/")))) out.push(COPILOT_ROOT);
      const scopedDir = join(rootDir, ...COPILOT_SCOPED_DIR.split("/"));
      if (existsSync(scopedDir) && statSync(scopedDir).isDirectory()) {
        for (const name of readdirSync(scopedDir).sort()) {
          if (name.endsWith(".instructions.md")) out.push(`${COPILOT_SCOPED_DIR}/${name}`);
        }
      }
      return out;
    },
  };
}

/**
 * Depth-first walk calling `visit(relPath, basename)` for every regular
 * file. Hidden directories and SKIP_DIRS are not descended into (dotfiles
 * themselves are visited only at the top for completeness — none of the
 * filenames rulecast cares about here are hidden).
 */
function walk(baseDir: string, relPrefix: string, visit: (rel: string, name: string) => void): void {
  const full = relPrefix === "" ? baseDir : join(baseDir, ...relPrefix.split("/"));
  let entries;
  try {
    entries = readdirSync(full, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = relPrefix === "" ? entry.name : `${relPrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
      walk(baseDir, rel, visit);
    } else if (entry.isFile()) {
      visit(rel, entry.name);
    }
  }
}

/** Build a native absolute path from a repo-relative POSIX path. */
export function toNativePath(rootDir: string, relPath: string): string {
  return join(rootDir, ...relPath.split("/"));
}

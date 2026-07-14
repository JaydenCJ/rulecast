// Shared factories for the test suite. Everything is deterministic and
// in-memory where possible; CLI tests create their own temp dirs under the
// OS temp root and clean up after themselves.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const CLI = join(ROOT, "dist", "cli.js");

/** Build a Fragment value with sensible defaults for compose/lint tests. */
export function fragment(overrides = {}) {
  return {
    slug: "sample",
    file: ".rulecast/sample.md",
    title: "Sample rules",
    targets: null,
    order: 100,
    body: "- Be concise.",
    ...overrides,
  };
}

/** Default config: fragments in .rulecast, all four targets enabled. */
export function config(overrides = {}) {
  return {
    source: ".rulecast",
    targets: ["claude", "agents", "cursor", "copilot"],
    ...overrides,
  };
}

/** An in-memory TreeView over a { path: content } map for drift tests. */
export function memTree(files) {
  return {
    read: (path) => (path in files ? files[path] : null),
    candidates: () => Object.keys(files),
  };
}

/** Run the built CLI in a subprocess. Returns { status, stdout, stderr }. */
export function runCli(args, { cwd } = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    cwd: cwd ?? ROOT,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Create a temp dir with the given { relativePath: content } files. */
export function tempTree(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), "rulecast-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, ...rel.split("/"));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** A minimal valid fragment source file. */
export function fragmentSource({
  title = "Sample rules",
  extra = "",
  body = "- Be concise.",
} = {}) {
  return `---\ntitle: ${title}\n${extra}---\n\n${body}\n`;
}

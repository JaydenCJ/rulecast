/**
 * Cross-fragment and repo-aware lint rules. Per-file rules (L100–L110)
 * are attached during parsing in fragment.ts; this module adds the checks
 * that need to see every fragment at once (duplicate slugs/titles), the
 * config (targets that will never emit) or the repo layout (scoped
 * directories that do not exist), then merges and sorts everything.
 *
 * Rule codes are stable API — never renumbered, never reused.
 */

import type { FragmentParse } from "./fragment.js";
import { staticPrefix } from "./glob.js";
import type { Config, Diagnostic, Fragment } from "./types.js";

/** Everything project-wide lint needs; `dirExists` keeps it fs-free in tests. */
export interface LintInput {
  parses: FragmentParse[];
  config: Config;
  /** Answers "does this repo-relative directory exist?" for L108. */
  dirExists: (relDir: string) => boolean;
}

/** Run every lint rule and return diagnostics sorted by file, line, code. */
export function lintProject(input: LintInput): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const fragments: Fragment[] = [];
  for (const parse of input.parses) {
    diagnostics.push(...parse.diagnostics);
    if (parse.fragment) fragments.push(parse.fragment);
  }

  diagnostics.push(...duplicateSlugs(fragments));
  diagnostics.push(...duplicateTitles(fragments));
  diagnostics.push(...disabledTargets(fragments, input.config));
  diagnostics.push(...missingScopeDirs(fragments, input.dirExists));

  return diagnostics.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code),
  );
}

/** True when any diagnostic is an error (build refuses to proceed). */
export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

/**
 * L106 — two fragment files reducing to the same slug would silently fight
 * over one `.mdc` / `.instructions.md` output path. Hard error.
 */
function duplicateSlugs(fragments: Fragment[]): Diagnostic[] {
  const bySlug = new Map<string, Fragment[]>();
  for (const f of fragments) {
    const list = bySlug.get(f.slug);
    if (list) list.push(f);
    else bySlug.set(f.slug, [f]);
  }
  const out: Diagnostic[] = [];
  for (const [slug, group] of bySlug) {
    if (group.length < 2) continue;
    const files = group.map((f) => f.file).join(", ");
    for (const f of group) {
      out.push({
        file: f.file,
        line: 1,
        code: "L106",
        severity: "error",
        message: `duplicate slug \`${slug}\` (from: ${files}) — these fragments would overwrite each other's output`,
        hint: "rename one of the files; the filename (minus .md) is the slug",
      });
    }
  }
  return out;
}

/** L111 — same title twice reads as one rule set split by accident. Warning. */
function duplicateTitles(fragments: Fragment[]): Diagnostic[] {
  const byTitle = new Map<string, Fragment[]>();
  for (const f of fragments) {
    const key = f.title.toLowerCase();
    const list = byTitle.get(key);
    if (list) list.push(f);
    else byTitle.set(key, [f]);
  }
  const out: Diagnostic[] = [];
  for (const group of byTitle.values()) {
    if (group.length < 2) continue;
    const files = group.map((f) => f.file).join(", ");
    for (const f of group) {
      out.push({
        file: f.file,
        line: 1,
        code: "L111",
        severity: "warning",
        message: `duplicate title ${JSON.stringify(f.title)} (also in: ${files})`,
        hint: "compiled files use the title as the section heading; make each distinct",
      });
    }
  }
  return out;
}

/**
 * L112 — the fragment names only targets the config has disabled, so it
 * compiles to nothing at all. Warning: possibly intentional, usually a
 * leftover from editing rulecast.json.
 */
function disabledTargets(fragments: Fragment[], config: Config): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const f of fragments) {
    if (f.targets === null) continue;
    const active = f.targets.filter((t) => config.targets.includes(t));
    if (f.targets.length > 0 && active.length === 0) {
      out.push({
        file: f.file,
        line: 1,
        code: "L112",
        severity: "warning",
        message: `every requested target (${f.targets.join(", ")}) is disabled in rulecast.json — the fragment compiles to nothing`,
        hint: `enabled targets: ${config.targets.join(", ")}`,
      });
    }
  }
  return out;
}

/**
 * L108 — the static directory prefix of a scope does not exist. Almost
 * always a typo (`packages/wep/**`); a warning because the directory may
 * legitimately be created later.
 */
function missingScopeDirs(fragments: Fragment[], dirExists: (relDir: string) => boolean): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const f of fragments) {
    if (f.scope === undefined) continue;
    const prefix = staticPrefix(f.scope);
    if (prefix !== "" && !dirExists(prefix)) {
      out.push({
        file: f.file,
        line: 1,
        code: "L108",
        severity: "warning",
        message: `scope \`${f.scope}\` points at \`${prefix}/\`, which does not exist in this repo`,
        hint: "a typo here means the rules silently apply nowhere",
      });
    }
  }
  return out;
}

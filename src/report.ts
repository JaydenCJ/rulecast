/**
 * Rendering. Every command has a text form (for humans, deterministic and
 * diff-friendly) and a JSON form (for CI, a stable shape documented in the
 * README). All functions here are pure string builders.
 */

import { dirScope } from "./glob.js";
import type { Config, Diagnostic, DriftFinding, Fragment, PlannedFile } from "./types.js";
import { resolvedTargets } from "./targets/shared.js";
import { VERSION } from "./version.js";

/** One line of `build` output: what happened to which path. */
export interface BuildAction {
  verb: "wrote" | "unchanged" | "pruned" | "skipped";
  path: string;
  note?: string;
}

/** `1 file`, `2 files` — a count with its correctly pluralized noun. */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------- lint ----

/** `file:line  severity CODE  message` with an indented hint line. */
export function renderLintText(diagnostics: Diagnostic[], strict = false, all = diagnostics): string {
  const lines: string[] = [];
  for (const d of diagnostics) {
    lines.push(`${d.file}:${d.line}  ${d.severity} ${d.code}  ${d.message}`);
    if (d.hint) lines.push(`    hint: ${d.hint}`);
  }
  // Counts come from the full diagnostic set even when --quiet trims the
  // per-file lines, so the summary always matches the exit code.
  const errors = all.filter((d) => d.severity === "error").length;
  const warnings = all.length - errors;
  // Under --strict, warnings fail the run (exit 1); the summary line must
  // never say OK while the process exits non-zero.
  const failed = errors > 0 || (strict && warnings > 0);
  lines.push(
    `lint: ${failed ? "FAIL" : "OK"} (${plural(errors, "error")}, ${plural(warnings, "warning")})${
      failed && errors === 0 ? " — warnings fail under --strict" : ""
    }`,
  );
  return lines.join("\n");
}

export function renderLintJson(diagnostics: Diagnostic[]): string {
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  return stableJson({
    version: VERSION,
    diagnostics,
    summary: { errors, warnings: diagnostics.length - errors },
  });
}

// --------------------------------------------------------------- check ----

/** Aligned `kind  path  (detail)` lines plus a one-line verdict. */
export function renderCheckText(findings: DriftFinding[], planSize: number): string {
  if (findings.length === 0) {
    return `check: OK — ${plural(planSize, "generated file")} in sync`;
  }
  const width = Math.max(...findings.map((f) => f.kind.length));
  const lines = findings.map((f) => `${f.kind.padEnd(width)}  ${f.path}  (${f.detail})`);
  lines.push(`check: FAIL — ${plural(findings.length, "problem")} across ${plural(planSize, "planned file")}`);
  return lines.join("\n");
}

export function renderCheckJson(findings: DriftFinding[], planSize: number): string {
  return stableJson({
    version: VERSION,
    clean: findings.length === 0,
    plannedFiles: planSize,
    findings,
  });
}

// --------------------------------------------------------------- build ----

export function renderBuildText(
  actions: BuildAction[],
  plan: PlannedFile[],
  fragmentCount: number,
  options: { quiet?: boolean } = {},
): string {
  // Quiet mode drops the per-file noise but the summary still counts
  // everything — hiding a line must never change the numbers.
  const shown = options.quiet ? actions.filter((a) => a.verb !== "unchanged") : actions;
  const lines = shown.map(
    (a) => `${a.verb.padEnd(9)}  ${a.path}${a.note ? `  (${a.note})` : ""}`,
  );
  const wrote = actions.filter((a) => a.verb === "wrote").length;
  const unchanged = actions.filter((a) => a.verb === "unchanged").length;
  const pruned = actions.filter((a) => a.verb === "pruned").length;
  const targets = new Set(plan.map((p) => p.target)).size;
  let summary = `built ${plural(plan.length, "file")} for ${plural(targets, "target")} from ${plural(fragmentCount, "fragment")}: ${wrote} written, ${unchanged} unchanged`;
  if (pruned > 0) summary += `, ${pruned} pruned`;
  lines.push(summary);
  return lines.join("\n");
}

export function renderBuildJson(actions: BuildAction[], plan: PlannedFile[], fragmentCount: number): string {
  return stableJson({
    version: VERSION,
    fragments: fragmentCount,
    actions,
    files: plan.map((p) => ({ target: p.target, path: p.path, fragments: p.fragments })),
  });
}

// ---------------------------------------------------------------- list ----

/** Aligned table of every fragment: slug, scope, placement, targets, order. */
export function renderListText(fragments: Fragment[], config: Config): string {
  if (fragments.length === 0) {
    return `no fragments found under ${config.source}/`;
  }
  const rows = fragments.map((f) => [
    f.slug,
    f.scope ?? "(repo-wide)",
    placement(f),
    resolvedTargets(f, config).join(",") || "(none)",
    String(f.order),
  ]);
  const header = ["FRAGMENT", "SCOPE", "PLACEMENT", "TARGETS", "ORDER"];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const fmt = (cells: string[]): string =>
    cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ").trimEnd();
  return [fmt(header), ...rows.map(fmt)].join("\n");
}

export function renderListJson(fragments: Fragment[], config: Config): string {
  return stableJson({
    version: VERSION,
    source: config.source,
    targets: config.targets,
    fragments: fragments.map((f) => ({
      slug: f.slug,
      file: f.file,
      title: f.title,
      scope: f.scope ?? null,
      placement: placement(f),
      targets: resolvedTargets(f, config),
      order: f.order,
    })),
  });
}

/** How nested-Markdown targets will place the fragment. */
function placement(fragment: Fragment): string {
  if (fragment.scope === undefined) return "root";
  const dir = dirScope(fragment.scope);
  return dir === null ? "root+note" : `nested:${dir}`;
}

/** JSON.stringify with 2-space indent and a trailing newline-free string. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Shared types for the whole pipeline. Everything downstream of the
 * filesystem (parsing, composing, linting, diffing) works on these plain
 * values, which is what keeps the core unit-testable without temp dirs.
 */

/** The four rule-file dialects rulecast can compile to. */
export type TargetName = "claude" | "agents" | "cursor" | "copilot";

/** All targets rulecast knows how to emit, in canonical order. */
export const KNOWN_TARGETS: readonly TargetName[] = ["claude", "agents", "cursor", "copilot"];

/** Resolved project configuration (rulecast.json merged over defaults). */
export interface Config {
  /** Directory holding the fragment sources, relative to the repo root. */
  source: string;
  /** Targets to compile; order follows KNOWN_TARGETS regardless of input order. */
  targets: TargetName[];
}

/** One parsed source fragment (a Markdown file with front matter). */
export interface Fragment {
  /** Stable identifier derived from the filename; also the output slug. */
  slug: string;
  /** Path of the source file relative to the repo root (POSIX separators). */
  file: string;
  /** Human heading for the compiled section (front matter `title`). */
  title: string;
  /** Optional one-line summary; surfaces in Cursor/Copilot front matter. */
  description?: string;
  /** Optional path glob limiting where the fragment applies; absent = repo-wide. */
  scope?: string;
  /**
   * Targets the fragment asked for, or null when the front matter omitted
   * `targets` (meaning: every target enabled in the config).
   */
  targets: TargetName[] | null;
  /** Sort key inside each compiled file; lower comes first. Default 100. */
  order: number;
  /** The Markdown body with surrounding blank lines trimmed. */
  body: string;
}

/** Severity of a lint diagnostic. Errors block `build`; warnings do not. */
export type Severity = "error" | "warning";

/** One lint finding, anchored to a source fragment file and line. */
export interface Diagnostic {
  file: string;
  line: number;
  code: string;
  severity: Severity;
  message: string;
  /** Concrete, copy-pasteable suggestion when one can be derived safely. */
  hint?: string;
}

/** One file the compiler intends to write. */
export interface PlannedFile {
  target: TargetName;
  /** Output path relative to the repo root (POSIX separators). */
  path: string;
  /** Full file content, byte-exact, ending in a single newline. */
  content: string;
  /** Slugs of the fragments compiled into this file, in emission order. */
  fragments: string[];
}

/** Kinds of drift `check` can report between the plan and the working tree. */
export type DriftKind = "missing" | "stale" | "unmanaged" | "orphaned";

/** One drift finding from `check` (or a dry-run of `build`). */
export interface DriftFinding {
  kind: DriftKind;
  /** The affected output path, relative to the repo root. */
  path: string;
  target?: TargetName;
  /** Human explanation including the remediation command. */
  detail: string;
}

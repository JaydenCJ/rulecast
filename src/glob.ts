/**
 * Scope globs. Fragments limit where they apply with a repo-relative glob
 * (`packages/web/**`, `**` + `/*.sql`, `services/{api,worker}/**`). This module
 * validates patterns, matches them against POSIX paths, and — the part the
 * compiler leans on — extracts the *directory form* of a pattern so scoped
 * fragments can be placed as nested CLAUDE.md / AGENTS.md files.
 *
 * Supported syntax: `*` (within a segment), `?`, `**` (whole segment only),
 * and single-level `{a,b}` alternation. Character classes are not supported;
 * `validateGlob` says so explicitly rather than mismatching silently.
 */

const SEGMENT_META = /[*?{}\[\]]/;

/**
 * Validate a scope glob. Returns null when the pattern is usable, otherwise
 * a human-readable reason (the lint rule L104 surfaces it verbatim).
 */
export function validateGlob(pattern: string): string | null {
  if (pattern.trim() === "") return "scope is empty";
  if (pattern !== pattern.trim()) return "scope has leading or trailing whitespace";
  if (pattern.startsWith("/")) return "scope must be repo-relative, not absolute";
  if (pattern.includes("\\")) return "use forward slashes; backslashes are not path separators here";
  if (pattern.includes("[") || pattern.includes("]")) {
    return "character classes ([...]) are not supported; use {a,b} alternation";
  }
  let depth = 0;
  for (const ch of pattern) {
    if (ch === "{") {
      depth += 1;
      if (depth > 1) return "nested {…} alternation is not supported";
    } else if (ch === "}") {
      depth -= 1;
      if (depth < 0) return "unbalanced } in scope";
    } else if (ch === "," && depth === 0) {
      // A stray comma outside braces is almost always a forgotten [ ] around
      // a multi-scope attempt; one fragment has exactly one scope.
      return "comma outside {…}; a fragment takes a single scope glob";
    }
  }
  if (depth !== 0) return "unbalanced { in scope";

  for (const seg of pattern.split("/")) {
    if (seg === "") return "empty path segment (double or trailing slash)";
    if (seg === ".") return "`.` segments are redundant; write the path without them";
    if (seg === "..") return "`..` segments would escape the repo root";
    if (seg.includes("**") && seg !== "**") {
      return "`**` must stand alone as a whole path segment";
    }
  }
  return null;
}

/** Compile a validated glob to an anchored RegExp over POSIX paths. */
export function globToRegExp(pattern: string): RegExp {
  const segments = pattern.split("/");
  let out = "^";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i] ?? "";
    const last = i === segments.length - 1;
    if (seg === "**") {
      // `a/**/b` matches `a/b` (zero directories) as well as `a/x/y/b`;
      // a trailing `a/**` matches everything below `a` but not `a` itself.
      out += last ? ".*" : "(?:[^/]+/)*";
    } else {
      out += segmentToRegExp(seg) + (last ? "" : "/");
    }
  }
  return new RegExp(out + "$");
}

function segmentToRegExp(segment: string): string {
  let out = "";
  let i = 0;
  while (i < segment.length) {
    const ch = segment[i] ?? "";
    if (ch === "*") {
      out += "[^/]*";
    } else if (ch === "?") {
      out += "[^/]";
    } else if (ch === "{") {
      const close = segment.indexOf("}", i);
      const inner = segment.slice(i + 1, close);
      out += "(?:" + inner.split(",").map(segmentToRegExp).join("|") + ")";
      i = close;
    } else {
      out += escapeRegExp(ch);
    }
    i += 1;
  }
  return out;
}

function escapeRegExp(ch: string): string {
  return /[.+^$()|\\\[\]]/.test(ch) ? "\\" + ch : ch;
}

/** Match a repo-relative POSIX path against a validated glob. */
export function matchGlob(pattern: string, path: string): boolean {
  return globToRegExp(pattern).test(path);
}

/**
 * If the pattern is simply "everything under one directory" — `dir/**`
 * (optionally with a trailing `/*`) and a fully static `dir` — return that
 * directory. This is what lets claude/agents targets compile the fragment
 * into a *nested* rule file instead of an "applies to" note in the root
 * file. Returns null for every other shape (suffix globs like `*.sql`
 * under `**`, `packages/(star)/src/**`, plain `**`, …).
 */
export function dirScope(pattern: string): string | null {
  let prefix: string;
  if (pattern.endsWith("/**/*")) prefix = pattern.slice(0, -5);
  else if (pattern.endsWith("/**")) prefix = pattern.slice(0, -3);
  else return null;
  if (prefix === "" || SEGMENT_META.test(prefix)) return null;
  return prefix;
}

/**
 * Leading path segments that contain no glob metacharacters, joined back
 * with `/`. Used by lint L108 to ask whether the scoped directory actually
 * exists in the repo. `packages/(star)/src/**` → `packages`; `**` → ``.
 */
export function staticPrefix(pattern: string): string {
  const kept: string[] = [];
  for (const seg of pattern.split("/")) {
    if (SEGMENT_META.test(seg) || seg === "") break;
    kept.push(seg);
  }
  // A fully static pattern names a file, not a directory prefix.
  if (kept.length === pattern.split("/").length) kept.pop();
  return kept.join("/");
}

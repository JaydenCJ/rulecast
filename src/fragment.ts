/**
 * Fragment parsing: turn one source file into a `Fragment` plus any lint
 * diagnostics its front matter earns. Per-file rules (L100–L110) live here
 * so a fragment is validated the moment it is parsed; cross-fragment and
 * repo-dependent rules live in lint.ts.
 */

import { parseFrontmatter } from "./frontmatter.js";
import { validateGlob } from "./glob.js";
import { MARKER_TOKEN } from "./marker.js";
import { KNOWN_TARGETS, type Diagnostic, type Fragment, type TargetName } from "./types.js";

/** Front matter keys rulecast understands; anything else is L105. */
export const KNOWN_KEYS = ["title", "description", "scope", "targets", "order"] as const;

/** Default `order` when the front matter omits it. */
export const DEFAULT_ORDER = 100;

/** Result of parsing a single fragment file. */
export interface FragmentParse {
  /** The fragment, present whenever enough of the file parsed to build one. */
  fragment: Fragment | null;
  /** Per-file lint diagnostics (may be non-empty even when fragment is set). */
  diagnostics: Diagnostic[];
}

/**
 * Derive the output slug from the fragment's path relative to the source
 * dir: basename minus `.md`, lowercased, runs of anything outside
 * [a-z0-9] collapsed to `-`. Subdirectories are organization only — they
 * do not namespace the slug, which is why lint L106 checks collisions.
 */
export function slugFromFile(relPath: string): string {
  const base = relPath.split("/").pop() ?? relPath;
  const stem = base.toLowerCase().replace(/\.md$/, "");
  return stem.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "fragment";
}

/**
 * Parse one fragment source. `file` is the path shown in diagnostics
 * (repo-relative); `slug` should come from slugFromFile on the
 * source-dir-relative path.
 */
export function parseFragment(file: string, slug: string, source: string): FragmentParse {
  const diagnostics: Diagnostic[] = [];
  // Normalize Windows line endings up front: generated files must be
  // byte-identical regardless of which editor authored the fragment, or
  // `check` would report drift between collaborators.
  const fm = parseFrontmatter(source.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
  if (!fm.ok) {
    diagnostics.push({
      file,
      line: fm.error.line,
      code: "L100",
      severity: "error",
      message: `front matter does not parse: ${fm.error.message}`,
      hint: "front matter is flat `key: value` pairs between --- lines; see docs/fragment-format.md",
    });
    return { fragment: null, diagnostics };
  }

  const { data, keyLines, body } = fm.value;
  const lineOf = (key: string): number => keyLines[key] ?? 1;

  for (const key of Object.keys(data)) {
    if (!(KNOWN_KEYS as readonly string[]).includes(key)) {
      diagnostics.push({
        file,
        line: lineOf(key),
        code: "L105",
        severity: "warning",
        message: `unknown front matter key \`${key}\` is ignored`,
        hint: `known keys: ${KNOWN_KEYS.join(", ")}`,
      });
    }
  }

  const title = typeof data["title"] === "string" ? data["title"].trim() : "";
  if (title === "") {
    diagnostics.push({
      file,
      line: lineOf("title"),
      code: "L101",
      severity: "error",
      message: "fragment has no `title`",
      hint: 'add front matter like `title: Web TypeScript conventions` — it becomes the section heading',
    });
  }

  const trimmedBody = body.replace(/^\n+/, "").replace(/\s+$/, "");
  if (trimmedBody === "") {
    diagnostics.push({
      file,
      line: fm.value.bodyLine,
      code: "L102",
      severity: "error",
      message: "fragment body is empty — there is nothing to compile",
    });
  }
  if (trimmedBody.includes(MARKER_TOKEN)) {
    diagnostics.push({
      file,
      line: fm.value.bodyLine,
      code: "L110",
      severity: "error",
      message: `body contains the generated-file marker text ("${MARKER_TOKEN}")`,
      hint: "that phrase is how rulecast recognizes its own output; rephrase the body",
    });
  }

  let description: string | undefined;
  if ("description" in data) {
    if (typeof data["description"] === "string" && data["description"].trim() !== "") {
      description = data["description"].trim();
    } else {
      diagnostics.push({
        file,
        line: lineOf("description"),
        code: "L105",
        severity: "warning",
        message: "`description` is not a non-empty string; ignored",
      });
    }
  }

  let scope: string | undefined;
  if ("scope" in data) {
    const rawScope = data["scope"];
    const reason = typeof rawScope === "string" ? validateGlob(rawScope) : "scope must be a string glob";
    if (reason === null) {
      // `scope: "**"` means the whole repo, which is what "no scope" means;
      // normalizing here keeps every emitter's repo-wide branch identical.
      scope = rawScope === "**" ? undefined : (rawScope as string);
    } else {
      diagnostics.push({
        file,
        line: lineOf("scope"),
        code: "L104",
        severity: "error",
        message: `invalid scope glob: ${reason}`,
        hint: "examples: `packages/web/**`, `services/{api,worker}/**`, `**/*.sql`",
      });
    }
  }

  let targets: TargetName[] | null = null;
  if ("targets" in data) {
    const raw = data["targets"];
    if (!Array.isArray(raw)) {
      diagnostics.push({
        file,
        line: lineOf("targets"),
        code: "L103",
        severity: "error",
        message: "`targets` must be a list of target names",
        hint: "e.g. `targets: [claude, cursor]`",
      });
    } else {
      const picked: TargetName[] = [];
      for (const entry of raw) {
        if (typeof entry === "string" && (KNOWN_TARGETS as readonly string[]).includes(entry)) {
          if (!picked.includes(entry as TargetName)) picked.push(entry as TargetName);
        } else {
          diagnostics.push({
            file,
            line: lineOf("targets"),
            code: "L103",
            severity: "error",
            message: `unknown target ${JSON.stringify(entry)}`,
            hint: `valid targets: ${KNOWN_TARGETS.join(", ")}`,
          });
        }
      }
      if (raw.length === 0) {
        diagnostics.push({
          file,
          line: lineOf("targets"),
          code: "L109",
          severity: "error",
          message: "`targets: []` selects nothing — the fragment would never be compiled",
          hint: "drop the key entirely to target every configured tool",
        });
      }
      targets = picked;
    }
  }

  let order = DEFAULT_ORDER;
  if ("order" in data) {
    const raw = data["order"];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      order = raw;
    } else {
      diagnostics.push({
        file,
        line: lineOf("order"),
        code: "L107",
        severity: "error",
        message: "`order` must be a finite number",
        hint: "lower numbers sort first inside each compiled file; the default is 100",
      });
    }
  }

  if (diagnostics.some((d) => d.severity === "error")) {
    return { fragment: null, diagnostics };
  }

  return {
    fragment: {
      slug,
      file,
      title,
      ...(description !== undefined ? { description } : {}),
      ...(scope !== undefined ? { scope } : {}),
      targets,
      order,
      body: trimmedBody,
    },
    diagnostics,
  };
}

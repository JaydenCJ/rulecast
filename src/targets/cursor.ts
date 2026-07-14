/**
 * Cursor emitter. Cursor's native rule format is one `.mdc` file per rule
 * under `.cursor/rules/`, with front matter carrying `description`,
 * optional `globs`, and `alwaysApply`. That maps one-to-one onto
 * fragments: the scope becomes `globs`, an unscoped fragment becomes an
 * always-applied rule. Note `globs` is deliberately unquoted — Cursor
 * reads the value literally, quotes included.
 */

import { markerComment } from "../marker.js";
import type { Config, Fragment, PlannedFile } from "../types.js";
import { fragmentsForTarget, sectionMarkdown, yamlQuote } from "./shared.js";

/** Directory Cursor reads project rules from. */
export const CURSOR_RULES_DIR = ".cursor/rules";

/** Compile fragments into one `.mdc` rule file each. */
export function emitCursor(fragments: Fragment[], config: Config): PlannedFile[] {
  return fragmentsForTarget(fragments, "cursor", config).map((fragment) => ({
    target: "cursor" as const,
    path: `${CURSOR_RULES_DIR}/${fragment.slug}.mdc`,
    content: mdcFile(fragment, config.source),
    fragments: [fragment.slug],
  }));
}

function mdcFile(fragment: Fragment, sourceDir: string): string {
  const lines = ["---", `description: ${yamlQuote(fragment.description ?? fragment.title)}`];
  if (fragment.scope !== undefined) {
    lines.push(`globs: ${fragment.scope}`);
  }
  lines.push(`alwaysApply: ${fragment.scope === undefined}`, "---");
  const head = lines.join("\n");
  const section = sectionMarkdown(fragment, { headingLevel: 1, scopeNote: false });
  return `${head}\n\n${markerComment(sourceDir)}\n\n${section}\n`;
}

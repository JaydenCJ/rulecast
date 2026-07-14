/**
 * The compiler core: fragments + config in, a deterministic list of
 * planned output files out. Pure — no filesystem — so the same function
 * backs `build` (write the plan), `check` (diff the plan against disk) and
 * the tests (assert on the plan directly).
 */

import { emitCopilot } from "./targets/copilot.js";
import { emitCursor } from "./targets/cursor.js";
import { emitNestedMarkdown } from "./targets/nestedmd.js";
import type { Config, Fragment, PlannedFile, TargetName } from "./types.js";

/** Fixed output filename per nested-Markdown target. */
export const TARGET_FILENAMES: Record<"claude" | "agents", string> = {
  claude: "CLAUDE.md",
  agents: "AGENTS.md",
};

/**
 * Compile every enabled target. Output order is canonical (claude, agents,
 * cursor, copilot; paths sorted within each target), so two runs over the
 * same inputs are byte-identical — the property `check` relies on.
 */
export function composePlan(fragments: Fragment[], config: Config): PlannedFile[] {
  const planned: PlannedFile[] = [];
  for (const target of config.targets) {
    planned.push(...emitTarget(target, fragments, config));
  }
  return planned;
}

function emitTarget(target: TargetName, fragments: Fragment[], config: Config): PlannedFile[] {
  let files: PlannedFile[];
  switch (target) {
    case "claude":
    case "agents":
      files = emitNestedMarkdown(target, TARGET_FILENAMES[target], fragments, config);
      break;
    case "cursor":
      files = emitCursor(fragments, config);
      break;
    case "copilot":
      files = emitCopilot(fragments, config);
      break;
  }
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

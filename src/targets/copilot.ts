/**
 * GitHub Copilot emitter. Copilot reads two shapes: a repo-wide
 * `.github/copilot-instructions.md`, and path-scoped
 * `.github/instructions/<name>.instructions.md` files whose `applyTo`
 * front matter carries a glob. Unscoped fragments compose into the former;
 * scoped fragments each become one of the latter with the scope passed
 * through verbatim — Copilot's own glob matching then takes over.
 */

import { markerComment } from "../marker.js";
import type { Config, Fragment, PlannedFile } from "../types.js";
import { composedFile, fragmentsForTarget, sectionMarkdown, yamlQuote } from "./shared.js";

/** The repo-wide instructions file. */
export const COPILOT_ROOT = ".github/copilot-instructions.md";

/** Directory for path-scoped instruction files. */
export const COPILOT_SCOPED_DIR = ".github/instructions";

/** Compile fragments into Copilot instruction files. */
export function emitCopilot(fragments: Fragment[], config: Config): PlannedFile[] {
  const mine = fragmentsForTarget(fragments, "copilot", config);
  const planned: PlannedFile[] = [];

  const repoWide = mine.filter((f) => f.scope === undefined);
  if (repoWide.length > 0) {
    planned.push({
      target: "copilot",
      path: COPILOT_ROOT,
      content: composedFile(
        config.source,
        repoWide.map((f) => sectionMarkdown(f, { headingLevel: 2, scopeNote: false })),
      ),
      fragments: repoWide.map((f) => f.slug),
    });
  }

  for (const fragment of mine) {
    if (fragment.scope === undefined) continue;
    planned.push({
      target: "copilot",
      path: `${COPILOT_SCOPED_DIR}/${fragment.slug}.instructions.md`,
      content: instructionsFile(fragment, config.source),
      fragments: [fragment.slug],
    });
  }
  return planned;
}

function instructionsFile(fragment: Fragment, sourceDir: string): string {
  const lines = ["---"];
  if (fragment.description !== undefined) {
    lines.push(`description: ${yamlQuote(fragment.description)}`);
  }
  lines.push(`applyTo: ${yamlQuote(fragment.scope ?? "**")}`, "---");
  const section = sectionMarkdown(fragment, { headingLevel: 1, scopeNote: false });
  return `${lines.join("\n")}\n\n${markerComment(sourceDir)}\n\n${section}\n`;
}

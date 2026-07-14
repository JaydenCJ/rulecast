/**
 * Emitter shared by the `claude` and `agents` targets. Both dialects are
 * plain Markdown files with a fixed name (CLAUDE.md / AGENTS.md) that the
 * tool picks up per directory, so both compile the same way:
 *
 *  - repo-wide fragments            → `<NAME>.md` at the repo root
 *  - `dir/**`-scoped fragments      → `dir/<NAME>.md` (the tool's own
 *    nearest-file semantics then scope the rules for free)
 *  - any other scope (`**` + `/*.sql`, `packages/(star)/src/**`) → the root
 *    file, with an explicit "Applies to files matching …" note, because no
 *    directory placement can express those patterns honestly.
 */

import { dirScope } from "../glob.js";
import type { Config, Fragment, PlannedFile, TargetName } from "../types.js";
import { composedFile, fragmentsForTarget, sectionMarkdown } from "./shared.js";

/** Compile fragments into root + nested Markdown rule files. */
export function emitNestedMarkdown(
  target: TargetName,
  filename: string,
  fragments: Fragment[],
  config: Config,
): PlannedFile[] {
  const mine = fragmentsForTarget(fragments, target, config);
  const byDir = new Map<string, Fragment[]>();
  for (const fragment of mine) {
    const dir = fragment.scope === undefined ? "" : (dirScope(fragment.scope) ?? "");
    const bucket = byDir.get(dir);
    if (bucket) bucket.push(fragment);
    else byDir.set(dir, [fragment]);
  }

  const planned: PlannedFile[] = [];
  for (const dir of [...byDir.keys()].sort()) {
    const group = byDir.get(dir) ?? [];
    const sections = group.map((f) =>
      // In a nested file the location already says where the rules apply;
      // the note is only needed for scopes the root file has to carry.
      sectionMarkdown(f, { headingLevel: 2, scopeNote: dir === "" }),
    );
    planned.push({
      target,
      path: dir === "" ? filename : `${dir}/${filename}`,
      content: composedFile(config.source, sections),
      fragments: group.map((f) => f.slug),
    });
  }
  return planned;
}

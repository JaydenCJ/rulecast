/**
 * Building blocks shared by the four target emitters: fragment ordering,
 * target resolution, Markdown section rendering, and the tiny amount of
 * YAML quoting the emitted front matter needs.
 */

import { markerComment } from "../marker.js";
import type { Config, Fragment, TargetName } from "../types.js";

/**
 * Targets a fragment compiles to under the given config: its own list when
 * it has one, otherwise every configured target — always intersected with
 * the configured set, so `targets: [cursor]` in a claude-only repo simply
 * emits nothing (lint L112 warns about that separately).
 */
export function resolvedTargets(fragment: Fragment, config: Config): TargetName[] {
  const wanted = fragment.targets ?? config.targets;
  return config.targets.filter((t) => wanted.includes(t));
}

/** Fragments that compile to `target`, in stable emission order. */
export function fragmentsForTarget(fragments: Fragment[], target: TargetName, config: Config): Fragment[] {
  return sortFragments(fragments.filter((f) => resolvedTargets(f, config).includes(target)));
}

/** Emission order: `order` ascending, then slug — deterministic by design. */
export function sortFragments(fragments: Fragment[]): Fragment[] {
  return [...fragments].sort((a, b) => a.order - b.order || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/**
 * Render one fragment as a Markdown section. `headingLevel` is 2 in
 * composed multi-fragment files and 1 in one-fragment-per-file targets.
 * When `scopeNote` is set and the fragment has a scope, a blockquote spells
 * the glob out — used where the file's location cannot express the scope.
 */
export function sectionMarkdown(
  fragment: Fragment,
  options: { headingLevel: 1 | 2; scopeNote: boolean },
): string {
  const heading = "#".repeat(options.headingLevel) + " " + fragment.title;
  const parts = [heading];
  if (options.scopeNote && fragment.scope !== undefined) {
    parts.push(`> Applies to files matching \`${fragment.scope}\`.`);
  }
  parts.push(fragment.body);
  return parts.join("\n\n");
}

/** Marker + sections, byte-exact, ending in exactly one newline. */
export function composedFile(sourceDir: string, sections: string[]): string {
  return [markerComment(sourceDir), ...sections].join("\n\n") + "\n";
}

/** Double-quote a string for emitted YAML front matter. */
export function yamlQuote(value: string): string {
  return '"' + value.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

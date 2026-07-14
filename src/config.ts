/**
 * Project configuration. `rulecast.json` at the repo root is optional; when
 * absent, defaults apply (fragments in `.rulecast/`, all four targets on).
 * Config problems are hard errors (exit 2), not lint findings: a broken
 * config means every other answer the tool could give would be wrong.
 */

import { KNOWN_TARGETS, type Config, type TargetName } from "./types.js";

export type { Config } from "./types.js";

/** Filename looked up at the repo root. */
export const CONFIG_FILE = "rulecast.json";

/** The configuration used when no rulecast.json exists. */
export const DEFAULT_CONFIG: Config = {
  source: ".rulecast",
  targets: [...KNOWN_TARGETS],
};

/** Thrown for unparseable or invalid configuration. */
export class ConfigError extends Error {}

/**
 * Parse and validate the content of rulecast.json. Strict JSON on purpose —
 * a config with comments would silently disagree between editors and CI.
 */
export function parseConfig(json: string): Config {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    throw new ConfigError(`${CONFIG_FILE} is not valid JSON: ${(err as Error).message}`);
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError(`${CONFIG_FILE} must be a JSON object`);
  }
  const obj = raw as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (key !== "source" && key !== "targets") {
      throw new ConfigError(`${CONFIG_FILE}: unknown key \`${key}\` (known keys: source, targets)`);
    }
  }

  let source = DEFAULT_CONFIG.source;
  if ("source" in obj) {
    if (typeof obj["source"] !== "string" || obj["source"].trim() === "") {
      throw new ConfigError(`${CONFIG_FILE}: \`source\` must be a non-empty string`);
    }
    source = obj["source"].replace(/\/+$/, "");
    if (source.startsWith("/") || source.split("/").includes("..")) {
      throw new ConfigError(`${CONFIG_FILE}: \`source\` must be a relative path inside the repo`);
    }
  }

  let targets: TargetName[] = [...DEFAULT_CONFIG.targets];
  if ("targets" in obj) {
    const raw = obj["targets"];
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new ConfigError(`${CONFIG_FILE}: \`targets\` must be a non-empty array of target names`);
    }
    const picked = new Set<TargetName>();
    for (const entry of raw) {
      if (typeof entry !== "string" || !(KNOWN_TARGETS as readonly string[]).includes(entry)) {
        throw new ConfigError(
          `${CONFIG_FILE}: unknown target ${JSON.stringify(entry)} (valid: ${KNOWN_TARGETS.join(", ")})`,
        );
      }
      picked.add(entry as TargetName);
    }
    // Canonical order keeps output (and therefore drift checks) stable no
    // matter how the user ordered the array.
    targets = KNOWN_TARGETS.filter((t) => picked.has(t));
  }

  return { source, targets };
}

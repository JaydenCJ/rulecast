/**
 * Public programmatic API. Everything exported here is stable within a
 * minor version; the CLI is built entirely on top of these functions, so
 * anything the CLI can do, a script can do without spawning a process.
 */

export { parseFrontmatter, type FrontmatterParse, type FrontmatterResult } from "./frontmatter.js";
export { dirScope, globToRegExp, matchGlob, staticPrefix, validateGlob } from "./glob.js";
export {
  DEFAULT_ORDER,
  KNOWN_KEYS,
  parseFragment,
  slugFromFile,
  type FragmentParse,
} from "./fragment.js";
export { CONFIG_FILE, ConfigError, DEFAULT_CONFIG, parseConfig } from "./config.js";
export { isManaged, markerComment, MARKER_TOKEN } from "./marker.js";
export { composePlan, TARGET_FILENAMES } from "./compose.js";
export { emitNestedMarkdown } from "./targets/nestedmd.js";
export { CURSOR_RULES_DIR, emitCursor } from "./targets/cursor.js";
export { COPILOT_ROOT, COPILOT_SCOPED_DIR, emitCopilot } from "./targets/copilot.js";
export { fragmentsForTarget, resolvedTargets, sortFragments } from "./targets/shared.js";
export { hasErrors, lintProject, type LintInput } from "./lint.js";
export { diffPlan, isClean, type TreeView } from "./drift.js";
export { discoverFragments, loadConfig, makeDirExists, makeTreeView } from "./discover.js";
export {
  renderBuildJson,
  renderBuildText,
  renderCheckJson,
  renderCheckText,
  renderLintJson,
  renderLintText,
  renderListJson,
  renderListText,
  type BuildAction,
} from "./report.js";
export { COMMANDS, isParseError, parseCliArgs, USAGE, type CliOptions } from "./cliargs.js";
export { main, type CliIo } from "./cli.js";
export { VERSION } from "./version.js";
export {
  KNOWN_TARGETS,
  type Config,
  type Diagnostic,
  type DriftFinding,
  type DriftKind,
  type Fragment,
  type PlannedFile,
  type Severity,
  type TargetName,
} from "./types.js";

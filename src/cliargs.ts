/**
 * Command-line parsing: pure argv → options, no I/O, so every flag
 * combination is unit-testable. Errors carry the message to print and the
 * usage exit code is decided by the caller.
 */

export const COMMANDS = ["init", "build", "check", "lint", "list"] as const;
export type Command = (typeof COMMANDS)[number];

export interface CliOptions {
  command: Command | null; // null with help/version
  dir: string | null; // -C/--dir, null = cwd
  format: "text" | "json";
  force: boolean;
  prune: boolean;
  strict: boolean;
  quiet: boolean;
  help: boolean;
  version: boolean;
}

export interface CliParseError {
  message: string;
}

export const USAGE = `rulecast — compile CLAUDE.md, AGENTS.md, Cursor rules and Copilot instructions from scoped fragments

Usage: rulecast <command> [options]

Commands:
  init    scaffold rulecast.json and a first fragment in .rulecast/
  build   compile fragments into the tool rule files
  check   verify generated files match the fragments (CI drift gate)
  lint    validate fragments without writing anything
  list    show every fragment with its scope, placement, targets and order

Options:
  -C, --dir PATH       repo root to operate in (default: current directory)
      --format FORMAT  build/check/lint/list: output format, text (default) or json
      --force          build: replace files that lack the rulecast marker
      --prune          build: delete orphaned generated files
      --strict         lint/check: warnings also fail the run (exit 1)
  -q, --quiet          suppress per-file lines; summaries and errors only
  -h, --help           show this help
  -V, --version        print the version

Exit codes: 0 clean, 1 findings (lint errors / drift), 2 usage or config error.`;

/** Flags each command accepts beyond the global set. */
const PER_COMMAND: Record<Command, ReadonlySet<string>> = {
  init: new Set(),
  build: new Set(["--force", "--prune", "--format"]),
  check: new Set(["--strict", "--format"]),
  lint: new Set(["--strict", "--format"]),
  list: new Set(["--format"]),
};

export function parseCliArgs(argv: string[]): CliOptions | CliParseError {
  const options: CliOptions = {
    command: null,
    dir: null,
    format: "text",
    force: false,
    prune: false,
    strict: false,
    quiet: false,
    help: false,
    version: false,
  };

  const flagsSeen: string[] = [];
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i] ?? "";
    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "-V" || arg === "--version") {
      options.version = true;
    } else if (arg === "-q" || arg === "--quiet") {
      options.quiet = true;
    } else if (arg === "--force") {
      options.force = true;
      flagsSeen.push("--force");
    } else if (arg === "--prune") {
      options.prune = true;
      flagsSeen.push("--prune");
    } else if (arg === "--strict") {
      options.strict = true;
      flagsSeen.push("--strict");
    } else if (arg === "-C" || arg === "--dir") {
      const value = argv[i + 1];
      if (value === undefined) return { message: `${arg} needs a path argument` };
      options.dir = value;
      i += 1;
    } else if (arg === "--format") {
      const value = argv[i + 1];
      if (value !== "text" && value !== "json") {
        return { message: `--format must be text or json, got ${JSON.stringify(value ?? "")}` };
      }
      options.format = value;
      flagsSeen.push("--format");
      i += 1;
    } else if (arg.startsWith("-")) {
      return { message: `unknown option ${arg} (see --help)` };
    } else if (options.command === null) {
      if (!(COMMANDS as readonly string[]).includes(arg)) {
        return { message: `unknown command ${JSON.stringify(arg)} (commands: ${COMMANDS.join(", ")})` };
      }
      options.command = arg as Command;
    } else {
      return { message: `unexpected argument ${JSON.stringify(arg)}` };
    }
    i += 1;
  }

  if (options.help || options.version) return options;
  if (options.command === null) {
    return { message: `a command is required (commands: ${COMMANDS.join(", ")})` };
  }
  for (const flag of flagsSeen) {
    if (!(PER_COMMAND[options.command].has(flag))) {
      return { message: `${flag} does not apply to \`${options.command}\`` };
    }
  }
  return options;
}

/** Type guard distinguishing a parse error from options. */
export function isParseError(value: CliOptions | CliParseError): value is CliParseError {
  return !("command" in value);
}

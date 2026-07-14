#!/usr/bin/env node
/**
 * CLI entry point and command dispatch. This is the only module that
 * writes to the filesystem; everything it delegates to is pure. Exit
 * codes: 0 clean, 1 findings (lint errors, drift), 2 usage/config errors —
 * so CI can tell "your rules drifted" from "you invoked me wrong".
 */

import { mkdirSync, realpathSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";

import { isParseError, parseCliArgs, USAGE, type CliOptions } from "./cliargs.js";
import { composePlan } from "./compose.js";
import { ConfigError } from "./config.js";
import { discoverFragments, loadConfig, makeDirExists, makeTreeView, toNativePath } from "./discover.js";
import { diffPlan } from "./drift.js";
import { parseFragment, slugFromFile, type FragmentParse } from "./fragment.js";
import { hasErrors, lintProject } from "./lint.js";
import {
  plural,
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
import type { Config, Diagnostic, Fragment } from "./types.js";
import { VERSION } from "./version.js";

/** Injectable I/O so tests can run main() without a subprocess. */
export interface CliIo {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/** Everything a command needs after the project is loaded. */
interface Project {
  root: string;
  config: Config;
  parses: FragmentParse[];
  fragments: Fragment[];
  diagnostics: Diagnostic[];
}

export function main(argv: string[], io: CliIo): number {
  const parsed = parseCliArgs(argv);
  if (isParseError(parsed)) {
    io.stderr(`rulecast: ${parsed.message}`);
    return 2;
  }
  if (parsed.version) {
    io.stdout(VERSION);
    return 0;
  }
  if (parsed.help || parsed.command === null) {
    io.stdout(USAGE);
    return 0;
  }

  const root = parsed.dir ?? io.cwd;
  // A missing repo root is a config error (exit 2), never "0 files in
  // sync" — a CI drift gate pointed at the wrong path must not pass.
  if (!existsSync(root)) {
    io.stderr(`rulecast: directory does not exist: ${root}`);
    return 2;
  }
  try {
    switch (parsed.command) {
      case "init":
        return runInit(root, parsed, io);
      case "lint":
        return runLint(loadProject(root), parsed, io);
      case "list":
        return runList(loadProject(root), parsed, io);
      case "check":
        return runCheck(loadProject(root), parsed, io);
      case "build":
        return runBuild(loadProject(root), parsed, io);
    }
  } catch (err) {
    if (err instanceof ConfigError) {
      io.stderr(`rulecast: ${err.message}`);
      return 2;
    }
    throw err;
  }
}

function loadProject(root: string): Project {
  const { config } = loadConfig(root);
  const files = discoverFragments(root, config.source);
  const tree = makeTreeView(root, config);
  const parses = files.map((rel) => {
    const repoRel = `${config.source}/${rel}`;
    return parseFragment(repoRel, slugFromFile(rel), tree.read(repoRel) ?? "");
  });
  const diagnostics = lintProject({ parses, config, dirExists: makeDirExists(root) });
  const fragments = parses.flatMap((p) => (p.fragment ? [p.fragment] : []));
  return { root, config, parses, fragments, diagnostics };
}

// ---------------------------------------------------------------- lint ----

function runLint(project: Project, options: CliOptions, io: CliIo): number {
  const shown = options.quiet
    ? project.diagnostics.filter((d) => d.severity === "error")
    : project.diagnostics;
  io.stdout(
    options.format === "json"
      ? renderLintJson(shown)
      : renderLintText(shown, options.strict, project.diagnostics),
  );
  if (hasErrors(project.diagnostics)) return 1;
  if (options.strict && project.diagnostics.length > 0) return 1;
  return 0;
}

// ---------------------------------------------------------------- list ----

function runList(project: Project, options: CliOptions, io: CliIo): number {
  warnDiagnostics(project, options, io);
  io.stdout(
    options.format === "json"
      ? renderListJson(project.fragments, project.config)
      : renderListText(project.fragments, project.config),
  );
  return 0;
}

// --------------------------------------------------------------- check ----

function runCheck(project: Project, options: CliOptions, io: CliIo): number {
  if (hasErrors(project.diagnostics)) return failOnLint(project, io);
  warnDiagnostics(project, options, io);
  const plan = composePlan(project.fragments, project.config);
  const findings = diffPlan(plan, makeTreeView(project.root, project.config));
  io.stdout(
    options.format === "json"
      ? renderCheckJson(findings, plan.length)
      : renderCheckText(findings, plan.length),
  );
  if (findings.length > 0) return 1;
  // --strict makes the gate as picky as `lint --strict`: warnings fail too.
  if (options.strict && project.diagnostics.length > 0) {
    io.stderr("rulecast: --strict: fragment lint warnings fail the check (run `rulecast lint`)");
    return 1;
  }
  return 0;
}

// --------------------------------------------------------------- build ----

function runBuild(project: Project, options: CliOptions, io: CliIo): number {
  if (hasErrors(project.diagnostics)) return failOnLint(project, io);
  warnDiagnostics(project, options, io);

  const plan = composePlan(project.fragments, project.config);
  const tree = makeTreeView(project.root, project.config);
  const findings = diffPlan(plan, tree);

  // Refuse to clobber hand-written files unless --force: better to write
  // nothing than to half-apply a plan the user has to untangle.
  const unmanaged = findings.filter((f) => f.kind === "unmanaged");
  if (unmanaged.length > 0 && !options.force) {
    for (const f of unmanaged) {
      io.stderr(`rulecast: ${f.path} exists but was not generated by rulecast`);
    }
    io.stderr("rulecast: refusing to overwrite; re-run with --force to replace these files");
    return 2;
  }

  const actions: BuildAction[] = [];
  for (const file of plan) {
    const onDisk = tree.read(file.path);
    if (onDisk === file.content) {
      actions.push({ verb: "unchanged", path: file.path });
      continue;
    }
    const native = toNativePath(project.root, file.path);
    mkdirSync(dirname(native), { recursive: true });
    writeFileSync(native, file.content);
    actions.push({
      verb: "wrote",
      path: file.path,
      note: plural(file.fragments.length, "fragment"),
    });
  }

  for (const finding of findings) {
    if (finding.kind !== "orphaned") continue;
    if (options.prune) {
      rmSync(toNativePath(project.root, finding.path));
      actions.push({ verb: "pruned", path: finding.path });
    } else {
      actions.push({ verb: "skipped", path: finding.path, note: "orphaned; --prune to remove" });
    }
  }

  io.stdout(
    options.format === "json"
      ? renderBuildJson(actions, plan, project.fragments.length)
      : renderBuildText(actions, plan, project.fragments.length, { quiet: options.quiet }),
  );
  return 0;
}

// ---------------------------------------------------------------- init ----

const INIT_FRAGMENT = `---
title: Project conventions
order: 10
---

- Describe the rules every AI coding tool should follow here.
- Add more fragments beside this one; scope them with \`scope: dir/**\`.
`;

const INIT_CONFIG = `{
  "source": ".rulecast",
  "targets": ["claude", "agents", "cursor", "copilot"]
}
`;

function runInit(root: string, options: CliOptions, io: CliIo): number {
  const { config } = loadConfig(root);
  const created: string[] = [];
  const kept: string[] = [];

  const configPath = toNativePath(root, "rulecast.json");
  if (existsSync(configPath)) {
    kept.push("rulecast.json");
  } else {
    writeFileSync(configPath, INIT_CONFIG);
    created.push("rulecast.json");
  }

  const fragmentRel = `${config.source}/00-project.md`;
  const fragmentPath = toNativePath(root, fragmentRel);
  if (existsSync(fragmentPath)) {
    kept.push(fragmentRel);
  } else {
    mkdirSync(dirname(fragmentPath), { recursive: true });
    writeFileSync(fragmentPath, INIT_FRAGMENT);
    created.push(fragmentRel);
  }

  if (!options.quiet) {
    for (const path of created) io.stdout(`created    ${path}`);
    for (const path of kept) io.stdout(`kept       ${path} (already exists)`);
  }
  io.stdout(
    created.length > 0
      ? "init: done — edit the fragment, then run `rulecast build`"
      : "init: nothing to do — already initialized",
  );
  return 0;
}

// ------------------------------------------------------------- helpers ----

function failOnLint(project: Project, io: CliIo): number {
  io.stderr(renderLintText(project.diagnostics.filter((d) => d.severity === "error")));
  io.stderr("rulecast: fragments have lint errors; fix them (see `rulecast lint`)");
  return 2;
}

function warnDiagnostics(project: Project, options: CliOptions, io: CliIo): void {
  if (options.quiet) return;
  for (const d of project.diagnostics) {
    if (d.severity === "warning") {
      io.stderr(`${d.file}:${d.line}  warning ${d.code}  ${d.message}`);
    }
  }
}

// Run when executed as a binary (node dist/cli.js, or the npm bin shim —
// hence the realpath), but stay inert when imported as a module.
const invokedAs = process.argv[1];
if (invokedAs !== undefined) {
  let isEntry = false;
  try {
    isEntry = pathToFileURL(realpathSync(invokedAs)).href === import.meta.url;
  } catch {
    isEntry = false;
  }
  if (isEntry) {
    const code = main(process.argv.slice(2), {
      cwd: process.cwd(),
      stdout: (text) => process.stdout.write(text + "\n"),
      stderr: (text) => process.stderr.write(text + "\n"),
    });
    process.exit(code);
  }
}

// End-to-end CLI integration: every command run as a real subprocess
// against fresh temp repos, asserting on output, exit codes and the files
// actually written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { runCli, tempTree, fragmentSource } from "./helpers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A small polyglot repo: one repo-wide, one dir-scoped, one suffix-scoped fragment. */
function demoRepo() {
  return tempTree({
    "rulecast.json": '{\n  "source": ".rulecast",\n  "targets": ["claude", "agents", "cursor", "copilot"]\n}\n',
    ".rulecast/00-project.md": fragmentSource({ title: "Project conventions", extra: "order: 10\n" }),
    ".rulecast/web-typescript.md": fragmentSource({
      title: "Web TypeScript conventions",
      extra: "scope: packages/web/**\ndescription: Strict TS rules\norder: 20\n",
      body: "- Enable `strict` everywhere.",
    }),
    ".rulecast/sql-style.md": fragmentSource({
      title: "SQL style",
      extra: 'scope: "**/*.sql"\n',
      body: "- Keywords uppercase.",
    }),
    "packages/web/src/app.ts": "export {};\n",
  });
}

test("--version matches package.json", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const { status, stdout } = runCli(["--version"]);
  assert.equal(status, 0);
  assert.equal(stdout.trim(), pkg.version);
});

test("--help documents every command and key flag", () => {
  const { status, stdout } = runCli(["--help"]);
  assert.equal(status, 0);
  for (const word of ["init", "build", "check", "lint", "list", "--force", "--prune", "--strict", "--format"]) {
    assert.ok(stdout.includes(word), `help missing ${word}`);
  }
});

test("usage and config errors both exit 2 with the message on stderr", () => {
  const usage = runCli(["deploy"]);
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /unknown command/);

  // A missing repo root must never read as "0 files in sync" in CI.
  const missing = runCli(["check", "-C", "/no/such/rulecast-dir"]);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /directory does not exist/);

  const { dir, cleanup } = tempTree({ "rulecast.json": "{not json" });
  try {
    const broken = runCli(["check", "-C", dir]);
    assert.equal(broken.status, 2);
    assert.match(broken.stderr, /rulecast\.json is not valid JSON/);
  } finally {
    cleanup();
  }
});

test("init scaffolds config + first fragment, then reports idempotence", () => {
  const { dir, cleanup } = tempTree();
  try {
    const first = runCli(["init", "-C", dir]);
    assert.equal(first.status, 0);
    assert.ok(existsSync(join(dir, "rulecast.json")));
    assert.ok(existsSync(join(dir, ".rulecast", "00-project.md")));
    const second = runCli(["init", "-C", dir]);
    assert.equal(second.status, 0);
    assert.match(second.stdout, /nothing to do/);
  } finally {
    cleanup();
  }
});

test("build compiles the demo repo into all four dialects", () => {
  const { dir, cleanup } = demoRepo();
  try {
    const { status, stdout } = runCli(["build", "-C", dir]);
    assert.equal(status, 0);
    assert.match(stdout, /built 10 files for 4 targets from 3 fragments/);
    assert.ok(existsSync(join(dir, "CLAUDE.md")));
    assert.ok(existsSync(join(dir, "packages", "web", "CLAUDE.md")));
    assert.ok(existsSync(join(dir, "packages", "web", "AGENTS.md")));
    assert.ok(existsSync(join(dir, ".cursor", "rules", "web-typescript.mdc")));
    assert.ok(existsSync(join(dir, ".github", "copilot-instructions.md")));
    assert.ok(existsSync(join(dir, ".github", "instructions", "sql-style.instructions.md")));
    const root = readFileSync(join(dir, "CLAUDE.md"), "utf8");
    assert.match(root, /## Project conventions/);
    assert.match(root, /> Applies to files matching `\*\*\/\*\.sql`\./);
  } finally {
    cleanup();
  }
});

test("build is idempotent, check is clean after it, --quiet hides unchanged lines", () => {
  const { dir, cleanup } = demoRepo();
  try {
    runCli(["build", "-C", dir]);
    const second = runCli(["build", "-C", dir]);
    assert.equal(second.status, 0);
    assert.match(second.stdout, /10 files.*: 0 written, 10 unchanged/);

    const check = runCli(["check", "-C", dir]);
    assert.equal(check.status, 0);
    assert.match(check.stdout, /check: OK — 10 generated files in sync/);

    const quiet = runCli(["build", "-C", dir, "--quiet"]);
    assert.equal(quiet.status, 0);
    assert.ok(!quiet.stdout.includes("unchanged  "), quiet.stdout);
    assert.match(quiet.stdout, /10 unchanged/, "summary still counts everything");
  } finally {
    cleanup();
  }
});

test("check flags a hand-edited generated file as stale, exit 1", () => {
  const { dir, cleanup } = demoRepo();
  try {
    runCli(["build", "-C", dir]);
    writeFileSync(join(dir, "CLAUDE.md"), readFileSync(join(dir, "CLAUDE.md"), "utf8") + "\nsneaky edit\n");
    const { status, stdout } = runCli(["check", "-C", dir]);
    assert.equal(status, 1);
    assert.match(stdout, /stale.*CLAUDE\.md/);
    assert.match(stdout, /check: FAIL/);
  } finally {
    cleanup();
  }
});

test("check flags never-built outputs as missing", () => {
  const { dir, cleanup } = demoRepo();
  try {
    const { status, stdout } = runCli(["check", "-C", dir]);
    assert.equal(status, 1);
    assert.match(stdout, /missing.*\.cursor\/rules\/web-typescript\.mdc/);
  } finally {
    cleanup();
  }
});

test("deleting a fragment orphans its outputs; build --prune removes them", () => {
  const { dir, cleanup } = demoRepo();
  try {
    runCli(["build", "-C", dir]);
    rmSync(join(dir, ".rulecast", "sql-style.md"));
    const check = runCli(["check", "-C", dir]);
    assert.equal(check.status, 1);
    assert.match(check.stdout, /orphaned.*sql-style\.instructions\.md/);
    const prune = runCli(["build", "-C", dir, "--prune"]);
    assert.equal(prune.status, 0);
    assert.match(prune.stdout, /pruned/);
    assert.ok(!existsSync(join(dir, ".cursor", "rules", "sql-style.mdc")));
    assert.equal(runCli(["check", "-C", dir]).status, 0);
  } finally {
    cleanup();
  }
});

test("build refuses to clobber a hand-written CLAUDE.md without --force", () => {
  const { dir, cleanup } = demoRepo();
  try {
    writeFileSync(join(dir, "CLAUDE.md"), "# Hand-written notes\n");
    const refused = runCli(["build", "-C", dir]);
    assert.equal(refused.status, 2);
    assert.match(refused.stderr, /not generated by rulecast/);
    assert.equal(readFileSync(join(dir, "CLAUDE.md"), "utf8"), "# Hand-written notes\n");
    const forced = runCli(["build", "-C", dir, "--force"]);
    assert.equal(forced.status, 0);
    assert.match(readFileSync(join(dir, "CLAUDE.md"), "utf8"), /Generated by rulecast/);
  } finally {
    cleanup();
  }
});

test("lint reports findings with codes and hints, exit 1 on errors", () => {
  const { dir, cleanup } = demoRepo();
  try {
    writeFileSync(
      join(dir, ".rulecast", "bad.md"),
      "---\ntargets: [claude, vscode]\ncolour: blue\n---\n\n- body\n",
    );
    const { status, stdout } = runCli(["lint", "-C", dir]);
    assert.equal(status, 1);
    assert.match(stdout, /\.rulecast\/bad\.md:\d+  error L101/);
    assert.match(stdout, /error L103  unknown target "vscode"/);
    assert.match(stdout, /warning L105/);
    assert.match(stdout, /hint: /);
    assert.match(stdout, /lint: FAIL/);
  } finally {
    cleanup();
  }
});

test("lint is clean on the demo repo; --strict turns warnings into exit 1", () => {
  const { dir, cleanup } = demoRepo();
  try {
    assert.equal(runCli(["lint", "-C", dir]).status, 0);
    // A scope typo is only a warning...
    writeFileSync(
      join(dir, ".rulecast", "typo.md"),
      fragmentSource({ title: "Typo", extra: "scope: packages/wep/**\n" }),
    );
    assert.equal(runCli(["lint", "-C", dir]).status, 0);
    const strict = runCli(["lint", "-C", dir, "--strict"]);
    assert.equal(strict.status, 1);
    // The summary must never say OK while the process exits 1.
    assert.match(strict.stdout, /lint: FAIL .*warnings fail under --strict/);
    // check --strict applies the same policy: warnings fail the gate.
    // (A duplicate title stays a warning even after build — unlike the
    // scope typo above, whose directory build itself creates.)
    writeFileSync(
      join(dir, ".rulecast", "dup.md"),
      fragmentSource({ title: "Project conventions" }),
    );
    assert.equal(runCli(["build", "-C", dir]).status, 0);
    const strictCheck = runCli(["check", "-C", dir, "--strict"]);
    assert.equal(strictCheck.status, 1);
    assert.match(strictCheck.stderr, /lint warnings fail the check/);
    // ...while a plain check stays green (warnings are advisory by default).
    assert.equal(runCli(["check", "-C", dir]).status, 0);
  } finally {
    cleanup();
  }
});

test("build refuses to run while fragments have lint errors, exit 2", () => {
  const { dir, cleanup } = demoRepo();
  try {
    writeFileSync(join(dir, ".rulecast", "broken.md"), "---\norder: 1\n---\n\n- no title\n");
    const { status, stderr } = runCli(["build", "-C", dir]);
    assert.equal(status, 2);
    assert.match(stderr, /lint errors/);
    assert.ok(!existsSync(join(dir, "CLAUDE.md")), "nothing may be written");
  } finally {
    cleanup();
  }
});

test("check --format json has the stable documented shape", () => {
  const { dir, cleanup } = demoRepo();
  try {
    const { status, stdout } = runCli(["check", "-C", dir, "--format", "json"]);
    assert.equal(status, 1);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.clean, false);
    assert.equal(parsed.plannedFiles, 10);
    assert.ok(Array.isArray(parsed.findings));
    assert.deepEqual(Object.keys(parsed.findings[0]).sort(), ["detail", "kind", "path", "target"]);
  } finally {
    cleanup();
  }
});

test("list shows slug, scope, placement, targets and order as a table", () => {
  const { dir, cleanup } = demoRepo();
  try {
    const { status, stdout } = runCli(["list", "-C", dir]);
    assert.equal(status, 0);
    const lines = stdout.trim().split("\n");
    assert.match(lines[0], /^FRAGMENT\s+SCOPE\s+PLACEMENT\s+TARGETS\s+ORDER$/);
    assert.match(stdout, /web-typescript\s+packages\/web\/\*\*\s+nested:packages\/web/);
    assert.match(stdout, /sql-style\s+\*\*\/\*\.sql\s+root\+note/);
    assert.match(stdout, /00-project\s+\(repo-wide\)\s+root/);
  } finally {
    cleanup();
  }
});

test("a targets subset limits emission; turning targets off orphans old outputs", () => {
  const subset = tempTree({
    "rulecast.json": '{"targets": ["claude"]}',
    ".rulecast/rules.md": fragmentSource({ title: "Only claude" }),
  });
  try {
    const build = runCli(["build", "-C", subset.dir]);
    assert.equal(build.status, 0);
    assert.ok(existsSync(join(subset.dir, "CLAUDE.md")));
    assert.ok(!existsSync(join(subset.dir, "AGENTS.md")));
    assert.ok(!existsSync(join(subset.dir, ".cursor")));
  } finally {
    subset.cleanup();
  }

  const { dir, cleanup } = demoRepo();
  try {
    runCli(["build", "-C", dir]);
    writeFileSync(join(dir, "rulecast.json"), '{"targets": ["claude", "cursor", "copilot"]}');
    const check = runCli(["check", "-C", dir]);
    assert.equal(check.status, 1);
    assert.match(check.stdout, /orphaned\s+AGENTS\.md/);
    assert.match(check.stdout, /orphaned\s+packages\/web\/AGENTS\.md/);
  } finally {
    cleanup();
  }
});

test("README.md inside the source dir is not treated as a fragment", () => {
  const { dir, cleanup } = tempTree({
    ".rulecast/README.md": "# About these fragments\n",
    ".rulecast/rules.md": fragmentSource({ title: "Rules" }),
  });
  try {
    const { status, stdout } = runCli(["list", "-C", dir]);
    assert.equal(status, 0);
    assert.ok(!stdout.includes("readme"));
    assert.match(stdout, /rules/);
  } finally {
    cleanup();
  }
});

test("two builds of the same repo produce byte-identical trees", () => {
  const first = demoRepo();
  const second = demoRepo();
  try {
    runCli(["build", "-C", first.dir]);
    runCli(["build", "-C", second.dir]);
    for (const rel of ["CLAUDE.md", "AGENTS.md", "packages/web/CLAUDE.md", ".cursor/rules/web-typescript.mdc", ".github/copilot-instructions.md"]) {
      assert.equal(
        readFileSync(join(first.dir, rel), "utf8"),
        readFileSync(join(second.dir, rel), "utf8"),
        rel,
      );
    }
  } finally {
    first.cleanup();
    second.cleanup();
  }
});

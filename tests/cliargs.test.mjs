// Argument parsing: commands, flags, per-command flag gating, and the
// error messages users actually see for bad invocations.
import { test } from "node:test";
import assert from "node:assert/strict";

import { isParseError, parseCliArgs } from "../dist/cliargs.js";

function ok(argv) {
  const parsed = parseCliArgs(argv);
  assert.equal(isParseError(parsed), false, JSON.stringify(parsed));
  return parsed;
}

function bad(argv) {
  const parsed = parseCliArgs(argv);
  assert.equal(isParseError(parsed), true, "expected a parse error");
  return parsed;
}

test("each command parses with defaults", () => {
  for (const command of ["init", "build", "check", "lint", "list"]) {
    const parsed = ok([command]);
    assert.equal(parsed.command, command);
    assert.equal(parsed.format, "text");
    assert.equal(parsed.dir, null);
  }
});

test("-C/--dir capture the following path; missing value is an error", () => {
  assert.equal(ok(["build", "-C", "/tmp/repo"]).dir, "/tmp/repo");
  assert.equal(ok(["check", "--dir", "sub/dir"]).dir, "sub/dir");
  assert.match(bad(["build", "--dir"]).message, /needs a path/);
});

test("--format accepts text and json only", () => {
  assert.equal(ok(["lint", "--format", "json"]).format, "json");
  assert.match(bad(["lint", "--format", "yaml"]).message, /text or json/);
  assert.match(bad(["lint", "--format"]).message, /text or json/);
});

test("help and version work without a command; a bare invocation demands one", () => {
  assert.equal(ok(["--help"]).help, true);
  assert.equal(ok(["-V"]).version, true);
  assert.match(bad([]).message, /command is required/);
});

test("unknown commands, options and extra positionals are rejected by name", () => {
  assert.match(bad(["deploy"]).message, /unknown command "deploy"/);
  assert.match(bad(["build", "--frobnicate"]).message, /unknown option --frobnicate/);
  assert.match(bad(["build", "extra"]).message, /unexpected argument "extra"/);
});

test("flags are gated per command: --force is build-only", () => {
  assert.equal(ok(["build", "--force"]).force, true);
  assert.match(bad(["check", "--force"]).message, /--force does not apply to `check`/);
});

test("--format is rejected for init, whose output has no JSON shape", () => {
  assert.equal(ok(["build", "--format", "json"]).format, "json");
  assert.match(bad(["init", "--format", "json"]).message, /--format does not apply to `init`/);
});

test("--prune is build-only, --strict is lint/check-only", () => {
  assert.equal(ok(["build", "--prune"]).prune, true);
  assert.match(bad(["list", "--prune"]).message, /does not apply/);
  assert.equal(ok(["lint", "--strict"]).strict, true);
  assert.equal(ok(["check", "--strict"]).strict, true);
  assert.match(bad(["build", "--strict"]).message, /does not apply/);
});


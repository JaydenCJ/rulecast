// Config parsing: rulecast.json validation and the canonicalization that
// keeps target order (and therefore output order) stable.
import { test } from "node:test";
import assert from "node:assert/strict";

import { ConfigError, DEFAULT_CONFIG, parseConfig } from "../dist/config.js";

test("defaults: .rulecast source, all four targets; an empty object keeps them", () => {
  assert.equal(DEFAULT_CONFIG.source, ".rulecast");
  assert.deepEqual(DEFAULT_CONFIG.targets, ["claude", "agents", "cursor", "copilot"]);
  assert.deepEqual(parseConfig("{}"), DEFAULT_CONFIG);
});

test("targets are re-ordered canonically regardless of input order", () => {
  const config = parseConfig('{"targets": ["copilot", "claude"]}');
  assert.deepEqual(config.targets, ["claude", "copilot"]);
});

test("source accepts a custom directory and strips trailing slashes", () => {
  assert.equal(parseConfig('{"source": "rules/"}').source, "rules");
});

test("invalid or non-object JSON is a ConfigError naming the file", () => {
  assert.throws(() => parseConfig("{nope"), (err) => {
    assert.ok(err instanceof ConfigError);
    assert.match(err.message, /rulecast\.json/);
    return true;
  });
  assert.throws(() => parseConfig("[1,2]"), ConfigError);
  assert.throws(() => parseConfig('"text"'), ConfigError);
});

test("unknown keys are hard errors, not silently ignored", () => {
  assert.throws(() => parseConfig('{"sources": ".rulecast"}'), /unknown key `sources`/);
});

test("source escaping the repo is rejected", () => {
  assert.throws(() => parseConfig('{"source": "../shared"}'), /relative path inside the repo/);
  assert.throws(() => parseConfig('{"source": "/etc/rules"}'), /relative path inside the repo/);
});

test("empty or unknown targets are rejected with the valid list", () => {
  assert.throws(() => parseConfig('{"targets": []}'), /non-empty/);
  assert.throws(() => parseConfig('{"targets": ["vscode"]}'), /valid: claude, agents, cursor, copilot/);
});

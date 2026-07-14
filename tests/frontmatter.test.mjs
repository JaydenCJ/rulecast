// Front matter parser: the YAML subset fragments actually use, plus the
// failure modes that must produce precise line-anchored errors instead of
// silently mis-reading a fragment.
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseFrontmatter } from "../dist/frontmatter.js";

function ok(source) {
  const result = parseFrontmatter(source);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
}

function bad(source) {
  const result = parseFrontmatter(source);
  assert.equal(result.ok, false, "expected a parse error");
  return result.error;
}

test("file without opening --- is all body with empty data", () => {
  const value = ok("# Just markdown\n\ntext\n");
  assert.deepEqual(value.data, {});
  assert.equal(value.body, "# Just markdown\n\ntext\n");
  assert.equal(value.bodyLine, 1);
});

test("scalars: bare and quoted strings, numbers, booleans", () => {
  const value = ok('---\ntitle: Web rules\ndescription: "quoted: value"\norder: 20\nflag: true\n---\nbody');
  assert.deepEqual(value.data, {
    title: "Web rules",
    description: "quoted: value",
    order: 20,
    flag: true,
  });
  // Single quotes protect inner double quotes.
  assert.equal(ok("---\ntitle: 'say \"hi\"'\n---\nbody").data.title, 'say "hi"');
});

test("arrays: inline, empty inline, and indented block lists", () => {
  assert.deepEqual(ok('---\ntargets: [claude, "cursor", 3]\n---\nbody').data.targets, [
    "claude",
    "cursor",
    3,
  ]);
  assert.deepEqual(ok("---\ntargets: []\n---\nbody").data.targets, []);
  assert.deepEqual(ok("---\ntargets:\n  - claude\n  - agents\n---\nbody").data.targets, [
    "claude",
    "agents",
  ]);
});

test("comments and blank lines inside front matter are skipped", () => {
  const value = ok("---\n# who reads this\ntitle: T\n\norder: 1\n---\nbody");
  assert.deepEqual(value.data, { title: "T", order: 1 });
});

test("body, bodyLine and keyLines all point at real source lines", () => {
  const value = ok("---\ntitle: T\n\nscope: a/**\n---\nline one\nline two\n");
  assert.equal(value.body, "line one\nline two\n");
  assert.equal(value.bodyLine, 6);
  assert.equal(value.keyLines.title, 2);
  assert.equal(value.keyLines.scope, 4);
});

test("unclosed front matter and duplicate keys are precise errors", () => {
  const unclosed = bad("---\ntitle: T\nbody without closing");
  assert.equal(unclosed.line, 1);
  assert.match(unclosed.message, /never closed/);

  const duplicate = bad("---\ntitle: A\ntitle: B\n---\nbody");
  assert.equal(duplicate.line, 3);
  assert.match(duplicate.message, /duplicate key/);
});

test("nested maps and stray list items are rejected, not flattened", () => {
  assert.match(bad("---\ntargets:\n  claude: true\n---\nbody").message, /expected `key: value`/);

  const stray = bad("---\n  - claude\n---\nbody");
  assert.equal(stray.line, 2);
  assert.match(stray.message, /list item without/);
});

test("malformed inline arrays: unterminated quote, unclosed bracket, empty item", () => {
  assert.match(bad('---\ntargets: [claude, "cursor]\n---\nbody').message, /unterminated/);
  assert.match(bad("---\ntargets: [claude, cursor\n---\nbody").message, /never closed/);
  assert.match(bad("---\ntargets: [claude, , cursor]\n---\nbody").message, /empty item/);
});

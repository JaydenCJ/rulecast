// Scope globs: validation messages, matching semantics (especially the
// `**` zero-directory case), and the directory-form extraction that decides
// whether a fragment can become a nested CLAUDE.md / AGENTS.md.
import { test } from "node:test";
import assert from "node:assert/strict";

import { dirScope, matchGlob, staticPrefix, validateGlob } from "../dist/glob.js";

test("validateGlob accepts the documented shapes", () => {
  for (const pattern of ["packages/web/**", "**/*.sql", "services/{api,worker}/**", "docs/*.md", "**"]) {
    assert.equal(validateGlob(pattern), null, pattern);
  }
});

test("validateGlob rejects absolute, escaping and malformed paths", () => {
  assert.match(validateGlob("/etc/**"), /repo-relative/);
  assert.match(validateGlob("../sibling/**"), /escape the repo root/);
  assert.match(validateGlob("src//lib/**"), /empty path segment/);
  assert.match(validateGlob(" packages/**"), /whitespace/);
  assert.match(validateGlob("src\\lib\\**"), /forward slashes/);
});

test("validateGlob rejects unsupported syntax with a pointer to what works", () => {
  assert.match(validateGlob("src/[ab]/**"), /character classes/);
  assert.match(validateGlob("src/{a,b/**"), /unbalanced \{/);
  assert.match(validateGlob("src/a,b/**"), /comma outside/);
  assert.match(validateGlob("src/{a,{b,c}}/**"), /nested/);
  assert.match(validateGlob("src/**foo/bar"), /stand alone/);
});

test("* and ? match within one segment only", () => {
  assert.equal(matchGlob("docs/*.md", "docs/intro.md"), true);
  assert.equal(matchGlob("docs/*.md", "docs/deep/intro.md"), false);
  assert.equal(matchGlob("v?/api.ts", "v1/api.ts"), true);
  assert.equal(matchGlob("v?/api.ts", "v12/api.ts"), false);
});

test("** matches zero directories in the middle, descendants at the end", () => {
  assert.equal(matchGlob("a/**/b", "a/b"), true);
  assert.equal(matchGlob("a/**/b", "a/x/y/b"), true);
  assert.equal(matchGlob("a/**/b", "a/xb"), false);
  assert.equal(matchGlob("packages/web/**", "packages/web/src/app.ts"), true);
  assert.equal(matchGlob("packages/web/**", "packages/web"), false, "not the directory itself");
  assert.equal(matchGlob("packages/web/**", "packages/website/app.ts"), false);
});

test("{a,b} alternation matches either branch, not the literal", () => {
  assert.equal(matchGlob("services/{api,worker}/**", "services/api/main.go"), true);
  assert.equal(matchGlob("services/{api,worker}/**", "services/worker/run.go"), true);
  assert.equal(matchGlob("services/{api,worker}/**", "services/web/main.go"), false);
});

test("regex metacharacters in patterns are literal, not special", () => {
  assert.equal(matchGlob("a+b/c.d/**", "a+b/c.d/e"), true);
  assert.equal(matchGlob("a+b/c.d/**", "ab/cxd/e"), false);
});

test("dirScope extracts the directory from dir/** and dir/**/*", () => {
  assert.equal(dirScope("packages/web/**"), "packages/web");
  assert.equal(dirScope("packages/web/**/*"), "packages/web");
});

test("dirScope returns null for shapes a directory cannot express", () => {
  assert.equal(dirScope("**/*.sql"), null);
  assert.equal(dirScope("**"), null);
  assert.equal(dirScope("packages/*/src/**"), null);
  assert.equal(dirScope("services/{api,worker}/**"), null);
  assert.equal(dirScope("docs/*.md"), null);
});

test("staticPrefix keeps leading literal segments, dropping a bare filename", () => {
  assert.equal(staticPrefix("packages/web/**"), "packages/web");
  assert.equal(staticPrefix("packages/*/src/**"), "packages");
  assert.equal(staticPrefix("**/*.sql"), "");
  assert.equal(staticPrefix("docs/style.md"), "docs");
});

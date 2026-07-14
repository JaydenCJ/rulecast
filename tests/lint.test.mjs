// Project-level lint: the cross-fragment rules (duplicate slugs/titles),
// config-aware rules (targets that never emit) and repo-aware rules
// (scope directories that do not exist), plus ordering of the output.
import { test } from "node:test";
import assert from "node:assert/strict";

import { hasErrors, lintProject } from "../dist/lint.js";
import { config, fragment } from "./helpers.mjs";

function lint(fragments, { cfg = config(), dirs = ["packages/web"] } = {}) {
  return lintProject({
    parses: fragments.map((f) => ({ fragment: f, diagnostics: [] })),
    config: cfg,
    dirExists: (dir) => dirs.includes(dir),
  });
}

test("a healthy project lints clean", () => {
  const diagnostics = lint([
    fragment(),
    fragment({ slug: "web", file: ".rulecast/web.md", title: "Web", scope: "packages/web/**" }),
  ]);
  assert.deepEqual(diagnostics, []);
});

test("L106: duplicate slugs are errors on every involved file", () => {
  const diagnostics = lint([
    fragment({ file: ".rulecast/sample.md" }),
    fragment({ file: ".rulecast/sub/sample.md", title: "Other" }),
  ]);
  const l106 = diagnostics.filter((d) => d.code === "L106");
  assert.equal(l106.length, 2);
  assert.ok(l106.every((d) => d.severity === "error"));
  assert.match(l106[0].message, /\.rulecast\/sample\.md, \.rulecast\/sub\/sample\.md/);
});

test("L111: duplicate titles warn case-insensitively", () => {
  const diagnostics = lint([
    fragment({ slug: "a", file: "a.md", title: "API Rules" }),
    fragment({ slug: "b", file: "b.md", title: "api rules" }),
  ]);
  const l111 = diagnostics.filter((d) => d.code === "L111");
  assert.equal(l111.length, 2);
  assert.ok(l111.every((d) => d.severity === "warning"));
});

test("L112: fires when every requested target is disabled, quiet when one survives", () => {
  const dead = lint([fragment({ targets: ["copilot"] })], {
    cfg: config({ targets: ["claude"] }),
  });
  const l112 = dead.find((d) => d.code === "L112");
  assert.equal(l112.severity, "warning");
  assert.match(l112.hint, /enabled targets: claude/);

  const alive = lint([fragment({ targets: ["claude", "copilot"] })], {
    cfg: config({ targets: ["claude"] }),
  });
  assert.equal(alive.find((d) => d.code === "L112"), undefined);
});

test("L108: scope pointing at a missing directory warns with the prefix", () => {
  const diagnostics = lint([fragment({ scope: "packages/wep/**" })]);
  const l108 = diagnostics.find((d) => d.code === "L108");
  assert.equal(l108.severity, "warning");
  assert.match(l108.message, /packages\/wep\//);
});

test("L108 checks only the static prefix; prefix-free scopes never fire it", () => {
  const wildcard = lint([fragment({ scope: "packages/*/src/**" })], { dirs: ["packages"] });
  assert.equal(wildcard.find((d) => d.code === "L108"), undefined);

  const prefixFree = lint([fragment({ scope: "**/*.sql" })], { dirs: [] });
  assert.equal(prefixFree.find((d) => d.code === "L108"), undefined);
});

test("parse diagnostics are merged and sorted by file, line, code", () => {
  const parses = [
    {
      fragment: null,
      diagnostics: [
        { file: "b.md", line: 3, code: "L104", severity: "error", message: "x" },
        { file: "b.md", line: 1, code: "L101", severity: "error", message: "y" },
      ],
    },
    {
      fragment: fragment({ file: "a.md", slug: "a" }),
      diagnostics: [{ file: "a.md", line: 2, code: "L105", severity: "warning", message: "z" }],
    },
  ];
  const diagnostics = lintProject({ parses, config: config(), dirExists: () => true });
  assert.deepEqual(
    diagnostics.map((d) => `${d.file}:${d.line}:${d.code}`),
    ["a.md:2:L105", "b.md:1:L101", "b.md:3:L104"],
  );
});

test("hasErrors distinguishes errors from warnings-only sets", () => {
  assert.equal(hasErrors([{ severity: "warning" }]), false);
  assert.equal(hasErrors([{ severity: "warning" }, { severity: "error" }]), true);
  assert.equal(hasErrors([]), false);
});

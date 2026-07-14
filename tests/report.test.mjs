// Text rendering: the human-facing summary lines. Grammar matters here —
// a CI log that says "1 problems" erodes trust in everything around it,
// so singular and plural forms are asserted explicitly.
import { test } from "node:test";
import assert from "node:assert/strict";

import { renderBuildText, renderCheckText, renderLintText } from "../dist/report.js";

const stale = {
  kind: "stale",
  path: "CLAUDE.md",
  target: "claude",
  detail: "content differs from the compiled fragments — run `rulecast build`",
};

const plannedFile = (path) => ({ target: "claude", path, content: "x\n", fragments: ["a"] });

test("check summary uses singular forms for one problem and one file", () => {
  const text = renderCheckText([stale], 1);
  assert.match(text, /check: FAIL — 1 problem across 1 planned file$/);
  assert.match(renderCheckText([], 1), /^check: OK — 1 generated file in sync$/);
});

test("check summary uses plural forms for several problems and files", () => {
  const text = renderCheckText([stale, { ...stale, path: "AGENTS.md" }], 14);
  assert.match(text, /check: FAIL — 2 problems across 14 planned files$/);
  assert.match(renderCheckText([], 14), /^check: OK — 14 generated files in sync$/);
});

test("build summary pluralizes files, targets and fragments independently", () => {
  const one = renderBuildText([{ verb: "wrote", path: "CLAUDE.md" }], [plannedFile("CLAUDE.md")], 1);
  assert.match(one, /built 1 file for 1 target from 1 fragment: 1 written, 0 unchanged$/);
  const many = renderBuildText(
    [
      { verb: "wrote", path: "CLAUDE.md" },
      { verb: "unchanged", path: "AGENTS.md" },
    ],
    [plannedFile("CLAUDE.md"), { ...plannedFile("AGENTS.md"), target: "agents" }],
    5,
  );
  assert.match(many, /built 2 files for 2 targets from 5 fragments: 1 written, 1 unchanged$/);
});

test("lint summary counts read grammatically in every combination", () => {
  const error = { file: "a.md", line: 1, code: "L101", severity: "error", message: "m" };
  const warning = { file: "a.md", line: 2, code: "L108", severity: "warning", message: "m" };
  assert.match(renderLintText([]), /lint: OK \(0 errors, 0 warnings\)$/);
  assert.match(renderLintText([error, warning]), /lint: FAIL \(1 error, 1 warning\)$/);
  assert.match(renderLintText([error, error, warning, warning]), /lint: FAIL \(2 errors, 2 warnings\)$/);
});

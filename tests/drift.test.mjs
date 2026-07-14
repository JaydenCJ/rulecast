// Drift detection: the four disagreement kinds between a compiled plan and
// the working tree, exercised over an in-memory TreeView.
import { test } from "node:test";
import assert from "node:assert/strict";

import { composePlan } from "../dist/compose.js";
import { diffPlan, isClean } from "../dist/drift.js";
import { markerComment } from "../dist/marker.js";
import { config, fragment, memTree } from "./helpers.mjs";

const CFG = config({ targets: ["claude", "cursor"] });

function plan(fragments = [fragment()]) {
  return composePlan(fragments, CFG);
}

/** A tree that exactly matches the plan. */
function inSyncTree(planned) {
  const files = {};
  for (const p of planned) files[p.path] = p.content;
  return memTree(files);
}

test("a tree matching the plan has no findings", () => {
  const planned = plan();
  const findings = diffPlan(planned, inSyncTree(planned));
  assert.deepEqual(findings, []);
  assert.equal(isClean(findings), true);
});

test("missing: planned files absent from the tree are reported per file", () => {
  const findings = diffPlan(plan(), memTree({}));
  assert.deepEqual(
    findings.map((f) => `${f.kind}:${f.path}`),
    ["missing:CLAUDE.md", "missing:.cursor/rules/sample.mdc"],
  );
  assert.match(findings[0].detail, /rulecast build/);
});

test("stale: managed file with different content — comparison is byte-exact", () => {
  const planned = plan();
  const files = {};
  for (const p of planned) files[p.path] = p.content;
  files["CLAUDE.md"] = markerComment(".rulecast") + "\n\n## Old section\n\nout of date\n";
  const findings = diffPlan(planned, memTree(files));
  assert.deepEqual(findings.map((f) => `${f.kind}:${f.path}`), ["stale:CLAUDE.md"]);
  assert.equal(findings[0].target, "claude");

  // Even a single trailing byte of difference counts.
  files["CLAUDE.md"] = planned.find((p) => p.path === "CLAUDE.md").content + "\n";
  assert.equal(diffPlan(planned, memTree(files))[0].kind, "stale");
});

test("unmanaged: a hand-written file at a planned path is not called stale", () => {
  const planned = plan();
  const files = {};
  for (const p of planned) files[p.path] = p.content;
  files["CLAUDE.md"] = "# My hand-written project notes\n";
  const findings = diffPlan(planned, memTree(files));
  assert.deepEqual(findings.map((f) => `${f.kind}:${f.path}`), ["unmanaged:CLAUDE.md"]);
  assert.match(findings[0].detail, /--force/);
});

test("orphaned: marker-bearing candidates outside the plan, sorted", () => {
  const planned = plan();
  const files = {};
  for (const p of planned) files[p.path] = p.content;
  files["packages/old/CLAUDE.md"] = markerComment(".rulecast") + "\n\n## Gone\n\nrules\n";
  files[".cursor/rules/gone.mdc"] = "---\n---\n\n" + markerComment(".rulecast") + "\n\n# Gone\n";
  const findings = diffPlan(planned, memTree(files));
  assert.deepEqual(
    findings.map((f) => `${f.kind}:${f.path}`),
    ["orphaned:.cursor/rules/gone.mdc", "orphaned:packages/old/CLAUDE.md"],
  );
  assert.match(findings[0].detail, /--prune/);
});

test("hand-written files outside the plan are nobody's business", () => {
  const planned = plan();
  const files = {};
  for (const p of planned) files[p.path] = p.content;
  files["docs/CLAUDE.md"] = "# A hand-maintained nested rules file\n";
  assert.deepEqual(diffPlan(planned, memTree(files)), []);
});

test("kinds combine in one report: missing + stale + orphaned together", () => {
  const planned = plan([fragment(), fragment({ slug: "web", scope: "packages/web/**" })]);
  const files = {};
  for (const p of planned) files[p.path] = p.content;
  delete files[".cursor/rules/web.mdc"]; // missing
  files["CLAUDE.md"] = markerComment(".rulecast") + "\n\nstale\n"; // stale
  files["legacy/AGENTS.md"] = markerComment(".rulecast") + "\n\nold\n"; // orphaned
  const kinds = diffPlan(planned, memTree(files)).map((f) => f.kind);
  assert.deepEqual([...kinds].sort(), ["missing", "orphaned", "stale"]);
});

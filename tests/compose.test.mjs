// The compiler core: fragments + config → planned files. Placement rules,
// per-target dialects, ordering, and the determinism `check` depends on.
import { test } from "node:test";
import assert from "node:assert/strict";

import { composePlan } from "../dist/compose.js";
import { isManaged } from "../dist/marker.js";
import { config, fragment } from "./helpers.mjs";

function planPaths(fragments, cfg = config()) {
  return composePlan(fragments, cfg).map((p) => p.path);
}

function file(plan, path) {
  const found = plan.find((p) => p.path === path);
  assert.ok(found, `plan is missing ${path}: ${plan.map((p) => p.path).join(", ")}`);
  return found;
}

test("an unscoped fragment lands in root CLAUDE.md, AGENTS.md, cursor and copilot", () => {
  const plan = composePlan([fragment()], config());
  assert.deepEqual(
    plan.map((p) => p.path),
    ["CLAUDE.md", "AGENTS.md", ".cursor/rules/sample.mdc", ".github/copilot-instructions.md"],
  );
});

test("a dir-scoped fragment becomes nested CLAUDE.md and AGENTS.md files, note-free", () => {
  const scoped = fragment({ slug: "web", scope: "packages/web/**" });
  const plan = composePlan([scoped], config());
  const paths = plan.map((p) => p.path);
  assert.ok(paths.includes("packages/web/CLAUDE.md"));
  assert.ok(paths.includes("packages/web/AGENTS.md"));
  assert.ok(!paths.includes("CLAUDE.md"), "no root file when nothing targets the root");
  // The nested location already says where the rules apply.
  const nested = file(plan, "packages/web/CLAUDE.md");
  assert.ok(!nested.content.includes("Applies to files matching"));
});

test("a non-directory scope stays in the root file with an applies-to note", () => {
  const sql = fragment({ slug: "sql", title: "SQL style", scope: "**/*.sql" });
  const plan = composePlan([sql], config({ targets: ["claude"] }));
  const root = file(plan, "CLAUDE.md");
  assert.match(root.content, /> Applies to files matching `\*\*\/\*\.sql`\./);
});

test("every planned file starts with the marker and ends with one newline", () => {
  const plan = composePlan(
    [fragment(), fragment({ slug: "web", scope: "packages/web/**" })],
    config(),
  );
  for (const planned of plan) {
    assert.ok(isManaged(planned.content), planned.path);
    assert.match(planned.content, /[^\n]\n$/, planned.path);
  }
});

test("fragments compose in order-then-slug order inside one file", () => {
  const plan = composePlan(
    [
      fragment({ slug: "zz-first", title: "First", order: 10 }),
      fragment({ slug: "aa-late", title: "Late", order: 100 }),
      fragment({ slug: "bb-mid", title: "Mid", order: 50 }),
    ],
    config({ targets: ["claude"] }),
  );
  const root = file(plan, "CLAUDE.md");
  assert.deepEqual(root.fragments, ["zz-first", "bb-mid", "aa-late"]);
  const positions = ["## First", "## Mid", "## Late"].map((h) => root.content.indexOf(h));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  // Equal order falls back to slug order for determinism.
  const tie = composePlan(
    [fragment({ slug: "beta", title: "B" }), fragment({ slug: "alpha", title: "A" })],
    config({ targets: ["agents"] }),
  );
  assert.deepEqual(file(tie, "AGENTS.md").fragments, ["alpha", "beta"]);
});

test("fragment targets restrict emission; config order wins overall", () => {
  const cursorOnly = fragment({ slug: "cur", targets: ["cursor"] });
  const paths = planPaths([cursorOnly]);
  assert.deepEqual(paths, [".cursor/rules/cur.mdc"]);
});

test("disabled targets emit nothing even when fragments ask for them", () => {
  const wantsAll = fragment();
  const paths = planPaths([wantsAll], config({ targets: ["claude"] }));
  assert.deepEqual(paths, ["CLAUDE.md"]);
});

test("cursor: scoped fragment gets globs + alwaysApply false", () => {
  const scoped = fragment({ slug: "web", scope: "packages/web/**", description: "Web rules" });
  const plan = composePlan([scoped], config({ targets: ["cursor"] }));
  const mdc = file(plan, ".cursor/rules/web.mdc");
  assert.match(mdc.content, /^---\ndescription: "Web rules"\nglobs: packages\/web\/\*\*\nalwaysApply: false\n---\n/);
});

test("cursor: unscoped fragment is alwaysApply true, no globs, title as description", () => {
  const plan = composePlan([fragment({ title: "Fallback title" })], config({ targets: ["cursor"] }));
  const mdc = file(plan, ".cursor/rules/sample.mdc");
  assert.match(mdc.content, /alwaysApply: true/);
  assert.ok(!mdc.content.includes("globs:"));
  assert.match(mdc.content, /description: "Fallback title"/);
});

test("copilot: scoped fragments become .instructions.md with quoted applyTo", () => {
  const scoped = fragment({ slug: "web", scope: "packages/web/**" });
  const plan = composePlan([scoped], config({ targets: ["copilot"] }));
  const inst = file(plan, ".github/instructions/web.instructions.md");
  assert.match(inst.content, /applyTo: "packages\/web\/\*\*"/);
  assert.equal(plan.length, 1, "no root copilot file without unscoped fragments");
});

test("copilot: unscoped fragments compose into copilot-instructions.md", () => {
  const plan = composePlan(
    [fragment(), fragment({ slug: "second", title: "Second" })],
    config({ targets: ["copilot"] }),
  );
  const root = file(plan, ".github/copilot-instructions.md");
  assert.deepEqual(root.fragments, ["sample", "second"]);
  assert.match(root.content, /## Sample rules/);
  assert.match(root.content, /## Second/);
});

test("quotes in descriptions are escaped in emitted front matter", () => {
  const tricky = fragment({ description: 'say "hi" \\ done' });
  const plan = composePlan([tricky], config({ targets: ["cursor"] }));
  assert.match(
    file(plan, ".cursor/rules/sample.mdc").content,
    /description: "say \\"hi\\" \\\\ done"/,
  );
});

test("composing twice over the same inputs is byte-identical", () => {
  const fragments = [
    fragment(),
    fragment({ slug: "web", scope: "packages/web/**", order: 20 }),
    fragment({ slug: "sql", title: "SQL", scope: "**/*.sql" }),
  ];
  const a = composePlan(fragments, config());
  const b = composePlan(fragments, config());
  assert.deepEqual(a, b);
});

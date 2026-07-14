# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-07-13

### Added

- Fragment sources: Markdown files with YAML front matter (`title`,
  `description`, `scope`, `targets`, `order`) under `.rulecast/`,
  compiled into every configured tool dialect. The front matter parser is
  an in-repo YAML subset — flat scalars, inline arrays, block lists —
  with line-anchored errors.
- Four targets: `claude` (CLAUDE.md), `agents` (AGENTS.md), `cursor`
  (`.cursor/rules/*.mdc` with `description`/`globs`/`alwaysApply`) and
  `copilot` (`.github/copilot-instructions.md` plus
  `.github/instructions/*.instructions.md` with `applyTo`).
- Scope-to-dialect mapping: `dir/**` scopes become *nested* CLAUDE.md /
  AGENTS.md files; arbitrary globs (`**/*.sql`, `{a,b}` alternation)
  pass through natively to Cursor/Copilot and appear as an explicit
  "Applies to files matching …" note where only placement exists.
- `rulecast build`: deterministic compilation with per-file
  wrote/unchanged reporting, `--prune` for orphaned outputs, and a guard
  that refuses to overwrite files lacking the generated-by marker unless
  `--force` is given.
- `rulecast check`: the CI drift gate — reports missing, stale,
  unmanaged and orphaned files against a byte-exact recompilation, exit 1
  on any disagreement.
- `rulecast lint`: 13 stable rules (L100–L112) covering broken front
  matter, invalid globs, duplicate slugs/titles, targets that compile to
  nothing, scope-directory typos and marker collisions, each with a
  concrete hint; `--strict` promotes warnings.
- `rulecast list`: per-fragment table of scope, computed placement,
  resolved targets and order; `rulecast init`: idempotent scaffolding.
- `--format json` on check, lint, list and build with stable shapes for
  CI, plus exit codes distinguishing findings (1) from usage/config
  errors (2).
- Optional `rulecast.json` (source directory, enabled targets), strict
  JSON with hard errors on unknown keys.
- Public programmatic API (`composePlan`, `diffPlan`, `lintProject`,
  `parseFragment`, emitters, renderers) with type declarations.
- Test suite: 95 node:test tests (unit + CLI integration in fresh temp
  dirs) and an end-to-end `scripts/smoke.sh` against the bundled
  example monorepo.

[0.1.0]: https://github.com/JaydenCJ/rulecast/releases/tag/v0.1.0

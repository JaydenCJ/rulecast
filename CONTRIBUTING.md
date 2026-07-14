# Contributing to rulecast

Issues, discussions and pull requests are all welcome — this project aims
to stay small, zero-dependency at runtime, and honest about how each tool
dialect actually scopes its rules.

## Getting started

Requirements: Node.js >= 22.13 (for the stable `node:test` runner used by the suite).

```bash
git clone https://github.com/JaydenCJ/rulecast.git
cd rulecast
npm install            # installs typescript, the only devDependency
npm run build          # compile TypeScript to dist/
npm test               # build + 95 node:test tests
bash scripts/smoke.sh  # end-to-end CLI check against examples/polyglot
```

`scripts/smoke.sh` exercises the real CLI (init, build, check, lint, list,
drift detection, orphan pruning, the unmanaged-file guard, JSON output,
determinism) against a fresh copy of the bundled example monorepo and must
print `SMOKE OK`.

## Before you open a pull request

1. `npx tsc -p tsconfig.json --noEmit` — the tree must type-check clean (strict mode is enforced).
2. `npm test` — all tests must pass.
3. `bash scripts/smoke.sh` — must print `SMOKE OK`.
4. Add tests for behavior changes; keep logic in pure, unit-testable
   modules (parsing, composing, linting and diffing all take values, not
   file handles — only the CLI touches the filesystem).
5. Changes to any emitted format must keep output deterministic: the same
   fragments and config must always produce byte-identical files, because
   `check` compares content exactly.

## Ground rules

- **No runtime dependencies.** The zero-dependency install is a core
  feature; adding one needs justification in the PR and will usually be
  declined.
- No network calls, ever — the tool reads local files and writes local
  files. That is the whole I/O surface.
- Lint codes (`L1xx`) are stable API: never renumber or repurpose an
  existing code; add new ones instead.
- `build` must never destroy information: files without the rulecast
  marker are refused (not overwritten) unless the user passes `--force`,
  and orphans are only deleted under `--prune`.
- New target dialects need a documented mapping in
  `docs/fragment-format.md` for all three scope shapes (repo-wide,
  directory, arbitrary glob) — no silent scope-dropping.
- Code comments and doc comments are written in English.

## Reporting bugs

Please include: `rulecast --version` output, your `rulecast.json`, the
fragment (front matter + a trimmed body) that misbehaves, and the output
of `rulecast check --format json`. If a generated file looks wrong for a
specific tool, name the tool and quote the section of its documentation
you expected rulecast to match — dialect reports with receipts are gold.

## Security

Do not open public issues for security problems; use GitHub private
vulnerability reporting on this repository instead.

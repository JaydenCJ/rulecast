# Examples

`polyglot/` is a miniature monorepo — a TypeScript web package plus a Go
API service — whose AI-tool rules are maintained the rulecast way: five
fragments under `.rulecast/`, nothing else. One fragment is repo-wide, two
are directory-scoped (and become *nested* CLAUDE.md / AGENTS.md files),
one uses a suffix glob that no directory can express, and one targets a
single tool only.

The generated files are deliberately **not** committed here: run the build
yourself and watch them appear. `scripts/smoke.sh` runs the same flow on
every change, so this example is guaranteed to keep working.

## Try it

```bash
# from the repository root, after `npm install && npm run build`
cp -r examples/polyglot /tmp/polyglot && cd /tmp/polyglot

node /path/to/rulecast/dist/cli.js list     # what would be compiled where
node /path/to/rulecast/dist/cli.js build    # 14 files across 4 tools
node /path/to/rulecast/dist/cli.js check    # exit 0 — in sync

echo "drift" >> CLAUDE.md
node /path/to/rulecast/dist/cli.js check    # exit 1 — CLAUDE.md is stale
```

Things worth trying next: delete `.rulecast/sql-style.md` and see `check`
report orphans, then `build --prune` clean them up; edit `rulecast.json`
to drop a target; run `lint` after misspelling a scope directory.

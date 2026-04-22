---
name: doc-sync
description: Audit AI guidance files (CLAUDE.md, copilot-instructions.md, .github/agents/, .github/prompts/) for consistency. Use after updating any AI-facing documentation.
disable-model-invocation: true
---

Compare key facts across all AI guidance files and flag mismatches.

## Files to Check

- `CLAUDE.md` (primary, source of truth)
- `.github/copilot-instructions.md`
- `.github/agents/parity-maintainer.agent.md`
- `.github/prompts/add-parity-method.prompt.md`
- `.github/prompts/release-checklist.prompt.md`
- `.claude/agents/parity-reviewer.md`
- `.claude/skills/parity-sync/SKILL.md`
- `.claude/skills/release-check/SKILL.md`

## Facts to Verify Across Files

1. **Package count** — Three packages: `hdb/`, `hdbext/`, `hdbhelper/`. Any file that mentions "two packages" is stale.
2. **Node.js engine constraints** — hdb: `^20 || ^22 || ^24`, hdbext: `>=18.18.0`. Cross-check against `package.json`.
3. **Go version** — Must match `go.mod` directive. Cross-check against `go.mod`.
4. **Known API divergences** — `loadProcedurePromisified`, `callProcedurePromisified`, hdb-only methods (`destroyClient`, `validateClient`, `fetchSPMetadata`, `setSchema`). Ensure all files that reference these agree.
5. **Commands** — `npm test`, `npm run types`, `go test`, `go build`, `go vet`. Verify referenced commands match `package.json` scripts and actual usage.
6. **CI matrix** — Node versions and Go version in `.github/workflows/ci.yml` should be consistent with documented constraints.

## Output

Report a table:

| File | Status | Issues |
|------|--------|--------|
| ... | In sync / Drifted | specific mismatch |

Then list recommended fixes with exact diffs.

# Dependency Update Automation — Design Spec

**Date:** 2026-04-23
**Status:** Draft
**Author:** Claude + Thomas Jung

## Problem

This monorepo wraps SAP HANA client libraries across four ecosystems (Node.js x2, Go, Python). Keeping dependencies current requires running different update commands in four directories, regenerating types, running tests, and tracking what changed. This is tedious manual labor that should be automated.

## Solution

A two-part automation:

1. **Shell script** (`scripts/update-deps.sh`) — performs the mechanical update, test, and version-diff work
2. **Claude Code slash command** (`/update-deps`) — orchestrates the script, presents results, updates CHANGELOG.md, and manages the commit

## Components

### 1. Shell Script: `scripts/update-deps.sh`

Runs from the repo root. Requires: `bash` and `jq` (for JSON output; falls back to plain text if unavailable).

**Tool availability guards:** Before processing each ecosystem, the script checks whether the required tool is available (`npm`, `go`, `pip`). If a tool is missing, that ecosystem is skipped with a warning in the report (e.g., `"skipped": true, "reason": "go not found"`). This follows the same auto-skip pattern used by the test suites throughout this project.

#### Phase 1 — Snapshot

Captures current dependency versions before any updates:

- **Node.js** (`hdb/`, `hdbext/`): Parse `package.json` to extract `dependencies` and `devDependencies` version strings. Also capture resolved versions from `npm-shrinkwrap.json` for pinned deps.
- **Go** (`hdbhelper/`): Parse `go.mod` for `require` directives.
- **Python** (`hdbhelper-py/`): Run `pip show hdbcli pytest pytest-asyncio` to get installed versions. If a package is not yet installed (stale or fresh venv), report "old" as "not installed" rather than failing. Note: Python updates require an active virtual environment. The script checks for a venv and warns if none is detected.

#### Phase 2 — Update

- **`hdb/`**: `cd hdb && npm update` (updates within semver ranges, refreshes shrinkwrap). Then run `npm outdated --json` to detect pinned (exact) dependencies — both production and devDependencies — that `npm update` cannot touch (e.g., `"hdb": "2.27.1"` or `"mocha": "11.7.5"` with no `^`/`~` prefix). Report these separately as "pinned — manual bump available" with the latest version from the registry.
- **`hdbext/`**: `cd hdbext && npm update` (same strategy as hdb/)
- **`hdbhelper/`**: `cd hdbhelper && go get -u ./... && go mod tidy` (note: `go.sum` diffs are expected from indirect dependency upgrades)
- **`hdbhelper-py/`**: `cd hdbhelper-py && pip install --upgrade -e ".[dev]"` (uses the project's own `pyproject.toml` to resolve deps, consistent with the install instructions in CLAUDE.md). Requires an active virtual environment — if `$VIRTUAL_ENV` is unset, skip with a warning.

#### Phase 3 — Types Regeneration

- `cd hdb && npm run types`
- `cd hdbext && npm run types`

#### Phase 4 — Test

Run tests in all four packages, capturing exit codes and output:

- `cd hdb && npm test`
- `cd hdbext && npm test`
- `cd hdbhelper && go test -v ./...`
- `cd hdbhelper-py && pytest -v`

Test failures are reported but do not abort the script. HANA integration tests will auto-skip when no HANA instance is reachable — this is expected and should be reported as "N skipped" rather than as failures.

#### Phase 5 — Report

Output a JSON report to stdout:

```json
{
  "timestamp": "2026-04-23T14:30:00Z",
  "packages": [
    {
      "name": "hdb",
      "path": "hdb/",
      "ecosystem": "node",
      "dependencies": [
        { "name": "hdb", "old": "2.27.1", "new": "2.28.0", "type": "production" },
        { "name": "@sap/xsenv", "old": "6.2.0", "new": "6.2.0", "type": "production" }
      ],
      "tests": { "passed": true, "summary": "8 passing, 2 skipped" }
    }
  ]
}
```

Exit code: always 0 if the update+report phases completed (even if tests fail).

### 2. Claude Code Skill: `/update-deps`

Skill file location: `.claude/skills/update-deps/SKILL.md`

#### Workflow

1. **Run the script**: Execute `bash scripts/update-deps.sh` and capture stdout (JSON report)
2. **Parse and display**: Present a human-readable summary table showing each package, each dependency's old→new version, and test results
3. **Update CHANGELOG.md**: Read existing `CHANGELOG.md`, prepend a new dated entry with dependency changes grouped by package and test results
4. **Review gate**: Show the full diff (`git diff`). For `go.sum` changes (which can be hundreds of lines from indirect dependency upgrades), summarize as "go.sum: N lines changed" rather than showing the raw diff. Ask the user to confirm before committing.
5. **Commit**: If approved, stage all changed files and commit with message `chore: update all dependencies (YYYY-MM-DD)`

#### CHANGELOG.md Entry Format

```markdown
## YYYY-MM-DD

### Dependencies Updated

#### hdb/
- `hdb` 2.27.1 -> 2.28.0
- `@sap/xsenv` 6.2.0 -> 6.3.0

#### hdbext/
- `@sap/hdbext` 8.1.13 -> 8.2.0

#### hdbhelper/
- `github.com/SAP/go-hdb` v1.16.6 -> v1.17.0

#### hdbhelper-py/
- `hdbcli` 2.21.28 -> 2.22.0

### Test Results
- hdb/: passed (2 skipped - no HANA)
- hdbext/: passed (2 skipped - no HANA)
- hdbhelper/: passed (skipped - no HANA)
- hdbhelper-py/: passed (skipped - no HANA)
```

Only packages with actual version changes are listed. If nothing changed, the skill reports "all dependencies already up to date" and skips the changelog/commit steps.

### 3. CHANGELOG.md

New file at repo root. Reverse-chronological (newest entries first). Managed exclusively by the `/update-deps` skill — manual edits are fine but the skill always prepends.

Initial content after first run:

```markdown
# Changelog

All notable dependency updates to this project are documented in this file.

## YYYY-MM-DD
...
```

## File Inventory

| File | Action | Purpose |
| ------ | -------- | --------- |
| `scripts/` | Create dir | Directory for automation scripts |
| `scripts/update-deps.sh` | Create | Polyglot dependency update script |
| `.claude/skills/update-deps/SKILL.md` | Create | Claude Code slash command definition |
| `CHANGELOG.md` | Create | Dependency update changelog (created on first run) |

## Constraints

- The script must work on Windows (Git Bash) and Linux/macOS
- Each ecosystem is guarded by a tool-availability check; missing tools cause a skip, not a failure
- `npm-shrinkwrap.json` files are updated automatically by `npm update` — no special handling needed
- Pinned (exact-version) Node.js dependencies are detected via `npm outdated` and reported separately — the script does not auto-bump them (that would be a semver-range decision for the user)
- Python updates require an active virtual environment; the script skips Python if `$VIRTUAL_ENV` is unset
- The skill never auto-commits — it always shows the diff and asks for confirmation
- Test failures are reported but never block the update workflow (HANA integration tests commonly skip)

## Out of Scope

- Automated PR creation (use existing `release-*.yml` workflows for releases)
- Major version bumps (the script respects semver ranges in package.json)
- Dependabot/Renovate integration (this is a manual-trigger tool)
- Retroactive changelog entries for past updates

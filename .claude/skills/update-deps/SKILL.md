---
name: update-deps
description: Update all dependencies across hdb/, hdbext/, hdbhelper/, and hdbhelper-py/. Runs update script, presents change summary, updates CHANGELOG.md, and commits with approval.
---

## Context

This monorepo has four independent packages with no root `package.json`:
- `hdb/` and `hdbext/` — Node.js (npm, shrinkwrap)
- `hdbhelper/` — Go (go.mod)
- `hdbhelper-py/` — Python (pyproject.toml, pip)

## Workflow

### Step 1: Run the update script

Execute: `bash scripts/update-deps.sh`

The script may take several minutes. Capture stdout (JSON report) separately from stderr (progress messages). Show the stderr progress to the user as it runs.

### Step 2: Parse and display the change summary

Parse the JSON report. Present a summary table:

| Package | Dependency | Old | New | Type |
|---------|-----------|-----|-----|------|

For pinned dependencies (type="pinned"), show the `note` field and `latest` version so the user knows a manual bump is available.

For skipped packages, show the skip reason.

### Step 3: Update CHANGELOG.md

Read `CHANGELOG.md` from the repo root. If it doesn't exist, create it with this header:

```
# Changelog

All notable dependency updates to this project are documented in this file.
```

Prepend a new entry after the header using today's date. Group dependency changes by package. Only include packages where at least one dependency actually changed (old != new). Include test results for all packages that were tested.

Format:

```
## YYYY-MM-DD

### Dependencies Updated

#### <package>/
- `<dep>` <old> -> <new>

### Test Results
- <package>: <passed/failed> (<summary>)
```

If NO dependencies changed across any package, report "All dependencies already up to date" and skip the changelog update and commit steps.

### Step 4: Review gate

Show the diff with `git diff`. For `go.sum` changes, just report the line count ("go.sum: N lines changed") rather than the full diff.

Ask the user: "Ready to commit these dependency updates?"

Do NOT commit without explicit user approval.

### Step 5: Commit

If the user approves:
1. Stage all changed files: `git add hdb/ hdbext/ hdbhelper/ hdbhelper-py/ CHANGELOG.md`
2. Commit: `git commit -m "chore: update all dependencies (YYYY-MM-DD)"`

Do NOT push. The user can push when ready.

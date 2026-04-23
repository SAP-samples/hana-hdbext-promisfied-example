# Dependency Update Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a shell script + Claude Code slash command that updates all dependencies across all four packages (hdb/, hdbext/, hdbhelper/, hdbhelper-py/), runs tests, regenerates types, and maintains a CHANGELOG.md.

**Architecture:** A polyglot Bash script (`scripts/update-deps.sh`) handles the mechanical work across four ecosystems (npm, Go, pip) in five phases: snapshot current versions, update, regenerate types, run tests, output a JSON report. A Claude Code skill (`.claude/skills/update-deps/SKILL.md`) invokes the script, presents results, updates CHANGELOG.md, and manages the review/commit flow.

**Tech Stack:** Bash, jq, npm, Go, pip, Claude Code skills

**Spec:** `docs/superpowers/specs/2026-04-23-update-deps-automation-design.md`

---

## File Structure

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `scripts/update-deps.sh` | Create | Polyglot dependency update script: snapshot, update, types regen, test, JSON report |
| `.claude/skills/update-deps/SKILL.md` | Create | Claude Code slash command: orchestrates script, presents results, updates CHANGELOG.md, review gate, commit |
| `CHANGELOG.md` | Create | Dependency update log (created by skill on first run, reverse-chronological) |

---

## Task 1: Create the shell script scaffolding and tool guards

**Files:**
- Create: `scripts/update-deps.sh`

This task creates the script file with the tool-availability guards, utility functions, and the JSON report structure. The actual ecosystem-specific logic is added in subsequent tasks.

- [ ] **Step 1: Create `scripts/` directory and script with header + utility functions**

```bash
#!/usr/bin/env bash
# update-deps.sh — Update all dependencies across hdb/, hdbext/, hdbhelper/, hdbhelper-py/
#
# NOTE: We intentionally do NOT use `set -e` because individual ecosystem
# phases handle errors explicitly. A failure in one ecosystem (e.g., npm update
# returning non-zero, grep finding no match) must not abort the entire script.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

HAS_JQ=false
if command -v jq &>/dev/null; then HAS_JQ=true; fi

REPORT_FILE=$(mktemp)
echo '{"timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","packages":[]}' > "$REPORT_FILE"

# Version snapshot storage — uses temp files instead of associative arrays
# for Bash 3.x compatibility (Windows Git Bash may ship Bash 3.x).
OLD_VERSIONS_DIR=$(mktemp -d)

save_old_version() {
  local key="$1" value="$2"
  echo "$value" > "$OLD_VERSIONS_DIR/$(echo "$key" | tr '/@' '__')"
}

get_old_version() {
  local key="$1"
  local file="$OLD_VERSIONS_DIR/$(echo "$key" | tr '/@' '__')"
  if [ -f "$file" ]; then cat "$file"; else echo "unknown"; fi
}

append_package() {
  local pkg_json="$1"
  if $HAS_JQ; then
    local tmp=$(mktemp)
    jq --argjson pkg "$pkg_json" '.packages += [$pkg]' "$REPORT_FILE" > "$tmp" && mv "$tmp" "$REPORT_FILE"
  fi
}

has_tool() {
  command -v "$1" &>/dev/null
}

skip_package() {
  local name="$1" path="$2" ecosystem="$3" reason="$4"
  echo "SKIP: $name — $reason" >&2
  append_package '{"name":"'"$name"'","path":"'"$path"'","ecosystem":"'"$ecosystem"'","skipped":true,"reason":"'"$reason"'","dependencies":[],"tests":{"passed":null,"summary":"skipped"}}'
}
```

NOTE: The canonical invocation is `bash scripts/update-deps.sh` (not `./scripts/update-deps.sh`), since `chmod +x` is a no-op on Windows NTFS.

- [ ] **Step 2: Verify the script is executable and runs without error**

Run from repo root:
```bash
mkdir -p scripts
# (write the file)
chmod +x scripts/update-deps.sh
bash scripts/update-deps.sh
```
Expected: exits 0, outputs `{"timestamp":"...","packages":[]}` to stdout (empty packages array since no ecosystem logic yet).

- [ ] **Step 3: Commit**

```bash
git add scripts/update-deps.sh
git commit -m "feat: add update-deps.sh scaffolding with tool guards and JSON report structure"
```

---

## Task 2: Add Node.js ecosystem phases (snapshot + update + outdated)

**Files:**
- Modify: `scripts/update-deps.sh`

This adds the snapshot and update logic for `hdb/` and `hdbext/`. The pattern is identical for both, so we use a helper function.

- [ ] **Step 1: Add the Node.js snapshot + update function**

Append to `scripts/update-deps.sh` before the final report output:

```bash
snapshot_node_pkg() {
  local pkg_dir="$1"
  local pkg_json="$pkg_dir/package.json"
  if $HAS_JQ; then
    jq -r '(.dependencies // {}) + (.devDependencies // {}) | to_entries[] | "\(.key)=\(.value)"' "$pkg_json"
  else
    grep -E '"[^"]+"\s*:\s*"[~^]?[0-9]' "$pkg_json" | sed 's/.*"\([^"]*\)"\s*:\s*"\([^"]*\)".*/\1=\2/'
  fi
}

resolved_version_node() {
  local pkg_dir="$1" dep_name="$2"
  if $HAS_JQ && [ -f "$pkg_dir/npm-shrinkwrap.json" ]; then
    jq -r --arg dep "$dep_name" '.packages["node_modules/"+$dep].version // "unknown"' "$pkg_dir/npm-shrinkwrap.json"
  else
    echo "unknown"
  fi
}

update_node_package() {
  local name="$1" pkg_dir="$REPO_ROOT/$2"

  if ! has_tool npm; then
    skip_package "$name" "$2" "node" "npm not found"
    return
  fi

  echo "=== Updating $name ($2) ===" >&2

  # Phase 1: Snapshot — save old resolved versions to temp files
  while IFS='=' read -r dep ver; do
    [ -z "$dep" ] && continue
    save_old_version "${name}_${dep}" "$(resolved_version_node "$pkg_dir" "$dep")"
  done < <(snapshot_node_pkg "$pkg_dir")

  # Phase 2: Update
  (cd "$pkg_dir" && npm update 2>&1) >&2 || echo "WARN: npm update returned non-zero for $name" >&2

  # Capture new versions
  local deps_json="["
  local first=true
  while IFS='=' read -r dep range; do
    [ -z "$dep" ] && continue
    local new_ver=$(resolved_version_node "$pkg_dir" "$dep")
    local old_ver=$(get_old_version "${name}_${dep}")
    local dep_type="production"
    if $HAS_JQ && jq -e --arg d "$dep" '.devDependencies[$d]' "$pkg_dir/package.json" &>/dev/null; then
      dep_type="dev"
    fi
    if ! $first; then deps_json+=","; fi
    first=false
    deps_json+='{"name":"'"$dep"'","old":"'"$old_ver"'","new":"'"$new_ver"'","type":"'"$dep_type"'"}'
  done < <(snapshot_node_pkg "$pkg_dir")

  # Detect pinned deps via npm outdated
  local outdated_json=""
  outdated_json=$(cd "$pkg_dir" && npm outdated --json 2>/dev/null) || true
  if $HAS_JQ && [ -n "$outdated_json" ] && [ "$outdated_json" != "{}" ]; then
    local pinned
    pinned=$(echo "$outdated_json" | jq -r 'to_entries[] | select(.value.current != .value.latest) | "\(.key)=\(.value.current)=\(.value.latest)"')
    while IFS='=' read -r dep current latest; do
      [ -z "$dep" ] && continue
      if ! $first; then deps_json+=","; fi
      first=false
      deps_json+='{"name":"'"$dep"'","old":"'"$current"'","new":"'"$current"'","latest":"'"$latest"'","type":"pinned","note":"pinned - manual bump available"}'
    done <<< "$pinned"
  fi

  deps_json+="]"

  # Store result (tests added in Task 4)
  echo "$name|$2|node|$deps_json" >> "$REPORT_FILE.pending"
}
```

- [ ] **Step 2: Call the function for both Node.js packages**

Add these calls in the main body of the script:

```bash
# --- Main ---
> "$REPORT_FILE.pending"

update_node_package "hdb" "hdb"
update_node_package "hdbext" "hdbext"
```

- [ ] **Step 3: Test by running the script**

Run: `bash scripts/update-deps.sh`
Expected: output to stderr showing `=== Updating hdb (hdb) ===` and `=== Updating hdbext (hdbext) ===`. If npm is available and packages are installed, the shrinkwrap files may be updated.

- [ ] **Step 4: Commit**

```bash
git add scripts/update-deps.sh
git commit -m "feat(update-deps): add Node.js snapshot, update, and pinned-dep detection"
```

---

## Task 3: Add Go and Python ecosystem phases

**Files:**
- Modify: `scripts/update-deps.sh`

- [ ] **Step 1: Add Go update function**

```bash
update_go_package() {
  local name="hdbhelper" pkg_dir="$REPO_ROOT/hdbhelper"

  if ! has_tool go; then
    skip_package "$name" "hdbhelper" "go" "go not found"
    return
  fi

  echo "=== Updating $name (hdbhelper/) ===" >&2

  # Phase 1: Snapshot — capture require lines from go.mod
  local old_deps=""
  if $HAS_JQ; then
    old_deps=$(cd "$pkg_dir" && go list -m -json all 2>/dev/null | jq -rs '[.[] | select(.Main != true) | select(.Indirect != true) | {name: .Path, old: .Version}]')
  else
    old_deps=$(grep -E '^\s+\S+ v' "$pkg_dir/go.mod" | awk '{print $1"="$2}')
  fi

  # Phase 2: Update
  (cd "$pkg_dir" && go get -u ./... 2>&1 && go mod tidy 2>&1) >&2

  # Capture new versions
  local deps_json="["
  local first=true
  if $HAS_JQ; then
    local new_deps
    new_deps=$(cd "$pkg_dir" && go list -m -json all 2>/dev/null | jq -rs '[.[] | select(.Main != true) | select(.Indirect != true) | {name: .Path, version: .Version}]')
    deps_json=$(jq -n --argjson old "$old_deps" --argjson new "$new_deps" '
      [($old | map({(.name): .old}) | add // {}) as $omap |
       $new[] |
       {name: .name, old: ($omap[.name] // "unknown"), new: .version, type: "production"}]
    ')
  else
    while IFS='=' read -r dep ver; do
      [ -z "$dep" ] && continue
      local new_ver
      new_ver=$(grep -E "^\s+$dep " "$pkg_dir/go.mod" | awk '{print $2}') || new_ver="unknown"
      if ! $first; then deps_json+=","; fi
      first=false
      deps_json+='{"name":"'"$dep"'","old":"'"$ver"'","new":"'"$new_ver"'","type":"production"}'
    done <<< "$old_deps"
    deps_json+="]"
  fi

  echo "$name|hdbhelper|go|$deps_json" >> "$REPORT_FILE.pending"
}
```

- [ ] **Step 2: Add Python update function**

```bash
update_python_package() {
  local name="hdbhelper-py" pkg_dir="$REPO_ROOT/hdbhelper-py"

  if ! has_tool pip; then
    skip_package "$name" "hdbhelper-py" "python" "pip not found"
    return
  fi

  if [ -z "${VIRTUAL_ENV:-}" ]; then
    skip_package "$name" "hdbhelper-py" "python" "no active virtual environment (\$VIRTUAL_ENV is unset)"
    return
  fi

  echo "=== Updating $name (hdbhelper-py/) ===" >&2

  # Phase 1: Snapshot — pip show for each known dep
  local deps=("hdbcli" "pytest" "pytest-asyncio")
  for dep in "${deps[@]}"; do
    local ver
    ver=$(pip show "$dep" 2>/dev/null | grep -i '^Version:' | awk '{print $2}') || ver="not installed"
    save_old_version "py_${dep}" "$ver"
  done

  # Phase 2: Update
  (cd "$pkg_dir" && pip install --upgrade -e ".[dev]" 2>&1) >&2 || echo "WARN: pip install returned non-zero for $name" >&2

  # Capture new versions
  local deps_json="["
  local first=true
  for dep in "${deps[@]}"; do
    local new_ver
    new_ver=$(pip show "$dep" 2>/dev/null | grep -i '^Version:' | awk '{print $2}') || new_ver="unknown"
    local old_ver=$(get_old_version "py_${dep}")
    local dep_type="production"
    if [ "$dep" != "hdbcli" ]; then dep_type="dev"; fi
    if ! $first; then deps_json+=","; fi
    first=false
    deps_json+='{"name":"'"$dep"'","old":"'"$old_ver"'","new":"'"$new_ver"'","type":"'"$dep_type"'"}'
  done
  deps_json+="]"

  echo "$name|hdbhelper-py|python|$deps_json" >> "$REPORT_FILE.pending"
}
```

- [ ] **Step 3: Add calls in main body**

```bash
update_go_package
update_python_package
```

- [ ] **Step 4: Test by running the script**

Run: `bash scripts/update-deps.sh`
Expected: stderr shows update messages for each ecosystem. Go and Python may be skipped if tools or venv are missing — that's correct behavior. No crash.

- [ ] **Step 5: Commit**

```bash
git add scripts/update-deps.sh
git commit -m "feat(update-deps): add Go and Python ecosystem update phases"
```

---

## Task 4: Add types regeneration, test phase, and final JSON assembly

**Files:**
- Modify: `scripts/update-deps.sh`

- [ ] **Step 1: Add types regeneration phase**

After all update functions, before tests:

```bash
# --- Phase 3: Types Regeneration ---
regen_types() {
  for pkg_dir in hdb hdbext; do
    if has_tool npm && [ -d "$REPO_ROOT/$pkg_dir" ]; then
      echo "=== Regenerating types for $pkg_dir ===" >&2
      (cd "$REPO_ROOT/$pkg_dir" && npm run types 2>&1) >&2 || echo "WARN: types regen failed for $pkg_dir" >&2
    fi
  done
}

regen_types
```

- [ ] **Step 2: Add test phase**

```bash
# --- Phase 4: Test ---
run_tests() {
  local name="$1" pkg_dir="$REPO_ROOT/$2" ecosystem="$3" test_cmd="$4"

  echo "=== Testing $name ($2) ===" >&2
  local test_output exit_code=0
  test_output=$(cd "$pkg_dir" && eval "$test_cmd" 2>&1) || exit_code=$?

  local passed=true
  if [ $exit_code -ne 0 ]; then passed=false; fi

  # Extract summary line
  local summary=""
  case "$ecosystem" in
    node)
      summary=$(echo "$test_output" | grep -E '^\s+[0-9]+ passing' | head -1 || echo "")
      local skipped
      skipped=$(echo "$test_output" | grep -E '^\s+[0-9]+ pending' | head -1 || echo "")
      [ -n "$skipped" ] && summary="$summary, $skipped"
      ;;
    go)
      summary=$(echo "$test_output" | grep -E '^(ok|FAIL|---)\s' | tail -3 | tr '\n' '; ')
      ;;
    python)
      summary=$(echo "$test_output" | grep -E '^=.*(passed|failed|error)' | tail -1 || echo "")
      ;;
  esac
  [ -z "$summary" ] && summary="exit code $exit_code"

  echo "$name|$passed|$summary"
}

# Store test results in temp files (Bash 3.x compat)
TEST_RESULTS_DIR=$(mktemp -d)

save_test_result() {
  local name="$1" result="$2"
  echo "$result" > "$TEST_RESULTS_DIR/$name"
}

get_test_result() {
  local name="$1"
  if [ -f "$TEST_RESULTS_DIR/$name" ]; then cat "$TEST_RESULTS_DIR/$name"; fi
}

if has_tool npm; then
  for pkg in hdb hdbext; do
    result=$(run_tests "$pkg" "$pkg" "node" "npm test")
    save_test_result "$pkg" "$result"
  done
fi

if has_tool go; then
  result=$(run_tests "hdbhelper" "hdbhelper" "go" "go test -v ./...")
  save_test_result "hdbhelper" "$result"
fi

if has_tool pip && [ -n "${VIRTUAL_ENV:-}" ]; then
  result=$(run_tests "hdbhelper-py" "hdbhelper-py" "python" "pytest -v")
  save_test_result "hdbhelper-py" "$result"
fi
```

- [ ] **Step 3: Add final JSON assembly and output**

```bash
# --- Phase 5: Report ---
assemble_report() {
  echo '{"timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","packages":['

  local first=true
  if [ -f "$REPORT_FILE.pending" ]; then
    while IFS='|' read -r name path ecosystem deps_json; do
      [ -z "$name" ] && continue

      # Look up test results
      local test_line=$(get_test_result "$name")
      local test_passed="null" test_summary="not run"
      if [ -n "$test_line" ]; then
        IFS='|' read -r _ tp ts <<< "$test_line"
        test_passed="$tp"
        test_summary="$ts"
      fi

      if ! $first; then echo ","; fi
      first=false

      if $HAS_JQ; then
        jq -n \
          --arg name "$name" \
          --arg path "$path" \
          --arg eco "$ecosystem" \
          --argjson deps "$deps_json" \
          --argjson passed "$test_passed" \
          --arg summary "$test_summary" \
          '{name:$name, path:$path, ecosystem:$eco, dependencies:$deps, tests:{passed:$passed, summary:$summary}}'
      else
        echo '{"name":"'"$name"'","path":"'"$path"'","ecosystem":"'"$ecosystem"'","dependencies":'"$deps_json"',"tests":{"passed":'"$test_passed"',"summary":"'"$test_summary"'"}}'
      fi
    done < "$REPORT_FILE.pending"
  fi

  # Append any skipped packages — use process substitution to avoid
  # subshell variable mutation issue with piped while loops
  if $HAS_JQ; then
    local skipped_count
    skipped_count=$(jq '.packages | length' "$REPORT_FILE" 2>/dev/null) || skipped_count=0
    if [ "$skipped_count" -gt 0 ]; then
      while read -r pkg; do
        if ! $first; then echo ","; fi
        first=false
        echo "$pkg"
      done < <(jq -c '.packages[]' "$REPORT_FILE" 2>/dev/null)
    fi
  fi

  echo ']}'
}

assemble_report

# Cleanup temp files
rm -f "$REPORT_FILE" "$REPORT_FILE.pending"
rm -rf "$OLD_VERSIONS_DIR" "$TEST_RESULTS_DIR"
```

- [ ] **Step 4: Test the complete script**

Run: `bash scripts/update-deps.sh`
Expected: valid JSON output to stdout with all four packages (some may be skipped). stderr shows progress messages. Pipe through `jq .` to validate:
```bash
bash scripts/update-deps.sh 2>/dev/null | jq .
```

- [ ] **Step 5: Commit**

```bash
git add scripts/update-deps.sh
git commit -m "feat(update-deps): add types regen, test phase, and JSON report assembly"
```

---

## Task 5: Create the Claude Code skill

**Files:**
- Create: `.claude/skills/update-deps/SKILL.md`

- [ ] **Step 1: Create the skill directory and file**

```markdown
---
name: update-deps
description: Update all dependencies across hdb/, hdbext/, hdbhelper/, and hdbhelper-py/. Runs update script, presents change summary, updates CHANGELOG.md, and commits with approval.
# NOTE: This skill is intentionally model-invocable (no disable-model-invocation)
# unlike release-check, parity-sync, and doc-sync which are disable-model-invocation: true.
# The update-deps skill needs Claude to parse JSON output, build the changelog, and
# manage the review/commit flow interactively.
---

## Context

This monorepo has four independent packages with no root `package.json`:
- `hdb/` and `hdbext/` — Node.js (npm, shrinkwrap)
- `hdbhelper/` — Go (go.mod)
- `hdbhelper-py/` — Python (pyproject.toml, pip)

## Workflow

### Step 1: Run the update script

Execute: `bash scripts/update-deps.sh`

Capture stdout (JSON report) separately from stderr (progress messages). Show the stderr progress to the user as it runs. The script may take a few minutes.

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
```

- [ ] **Step 2: Verify the skill appears in Claude Code**

The skill should be discoverable via `/update-deps` in Claude Code. Check that the file is at `.claude/skills/update-deps/SKILL.md` and has valid YAML frontmatter.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/update-deps/SKILL.md
git commit -m "feat: add /update-deps Claude Code skill for dependency automation"
```

---

## Task 6: End-to-end validation

**Files:**
- No new files — validation only

- [ ] **Step 1: Run the full script and validate JSON output**

```bash
bash scripts/update-deps.sh 2>update-stderr.log | jq . > update-report.json
echo "Exit code: $?"
cat update-stderr.log
cat update-report.json
```

Expected: valid JSON with one entry per package. Skipped packages have `"skipped": true`. No errors in stderr (warnings about missing tools are fine).

- [ ] **Step 2: Verify the script handles missing tools gracefully**

Temporarily hide a tool and run:
```bash
PATH=/usr/bin:/bin bash scripts/update-deps.sh 2>&1 | head -20
```

Expected: packages that need missing tools are skipped with clear reasons in the report. Script still exits 0.

- [ ] **Step 3: Invoke the skill via `/update-deps`**

In Claude Code, type `/update-deps` and verify:
1. Script runs and progress appears
2. Summary table is displayed
3. CHANGELOG.md is updated with the new entry
4. Diff is shown for review
5. Commit only happens after approval

- [ ] **Step 4: Clean up temp files**

```bash
rm -f update-stderr.log update-report.json
```

---

## Task 7: Update AI guidance docs for consistency

**Files:**

- Modify: `CLAUDE.md` (add `scripts/` to repo structure listing, add `/update-deps` docs)
- Modify: `.github/copilot-instructions.md` (add corresponding mention of `scripts/update-deps.sh`)

- [ ] **Step 1: Add scripts/ and /update-deps to CLAUDE.md**

In the "Repository Structure" section at the top, add `scripts/` to the list of directories:

- `scripts/` — Automation scripts (dependency updates)

In the "Commands" section, add a new subsection:

```markdown
### Dependency Updates

Run `/update-deps` in Claude Code to update all dependencies across all packages. This invokes `scripts/update-deps.sh` which:
1. Snapshots current versions
2. Runs `npm update` / `go get -u` / `pip install --upgrade`
3. Regenerates TypeScript declarations
4. Runs tests
5. Outputs a JSON report

The skill then updates `CHANGELOG.md` and commits with your approval.

Alternatively, run the script directly: `bash scripts/update-deps.sh`
```

- [ ] **Step 2: Add mention to `.github/copilot-instructions.md`**

Add a brief note about `scripts/update-deps.sh` so Copilot-based agents are aware of the automation. Match the style and level of detail already used in that file.

- [ ] **Step 3: Run the doc-sync skill to verify consistency**

Invoke `/doc-sync` to ensure the new documentation is consistent across all AI guidance files.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md .github/copilot-instructions.md
git commit -m "docs: add /update-deps skill and scripts/ to AI guidance docs"
```

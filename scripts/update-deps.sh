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

# ---------------------------------------------------------------------------
# Node.js ecosystem helpers
# ---------------------------------------------------------------------------

# snapshot_node_pkg <pkg_dir>
# Prints "name=version_range" lines for all deps + devDeps in package.json.
snapshot_node_pkg() {
  local pkg_dir="$1"
  local pkg_json="$pkg_dir/package.json"
  if [ ! -f "$pkg_json" ]; then return; fi

  if $HAS_JQ; then
    jq -r '(.dependencies // {}) + (.devDependencies // {}) | to_entries[] | "\(.key)=\(.value)"' "$pkg_json"
  else
    # Fallback: extract lines that look like "  \"name\": \"version\"" from
    # the dependencies / devDependencies blocks via grep+sed.
    grep -E '"[^"]+"\s*:\s*"[^"]*"' "$pkg_json" \
      | sed 's/.*"\([^"]*\)"\s*:\s*"\([^"]*\)".*/\1=\2/' \
      | grep -v '"name"\|"version"\|"description"\|"main"\|"module"\|"types"\|"license"\|"author"\|"url"\|"type"\|"node"' \
      || true
  fi
}

# resolved_version_node <pkg_dir> <dep_name>
# Returns the installed version from npm-shrinkwrap.json, or "unknown".
resolved_version_node() {
  local pkg_dir="$1"
  local dep_name="$2"
  local shrinkwrap="$pkg_dir/npm-shrinkwrap.json"
  if [ ! -f "$shrinkwrap" ]; then echo "unknown"; return; fi

  if $HAS_JQ; then
    jq -r --arg dep "$dep_name" '.packages["node_modules/"+$dep].version // "unknown"' "$shrinkwrap"
  else
    echo "unknown"
  fi
}

# update_node_package <name> <pkg_dir_relative>
update_node_package() {
  local name="$1"
  local pkg_dir_relative="$2"
  local pkg_dir="$REPO_ROOT/$pkg_dir_relative"

  if ! has_tool npm; then
    skip_package "$name" "$pkg_dir_relative" "node" "npm not found"
    return
  fi

  echo "INFO: Updating Node.js package: $name" >&2

  # Phase 1 — Snapshot current resolved versions
  while IFS='=' read -r dep _range; do
    [ -z "$dep" ] && continue
    local old_ver
    old_ver=$(resolved_version_node "$pkg_dir" "$dep")
    save_old_version "${name}_${dep}" "$old_ver"
  done < <(snapshot_node_pkg "$pkg_dir")

  # Phase 2 — Run npm update
  (cd "$pkg_dir" && npm update 2>&1) >&2 || echo "WARN: npm update returned non-zero for $name" >&2

  # Phase 3 — Collect new versions, build deps JSON array
  local deps_json="["
  local first=true

  while IFS='=' read -r dep _range; do
    [ -z "$dep" ] && continue
    local new_ver
    new_ver=$(resolved_version_node "$pkg_dir" "$dep")
    local old_ver
    old_ver=$(get_old_version "${name}_${dep}")

    # Determine whether this dep is a devDependency
    local dep_type="production"
    if $HAS_JQ; then
      local in_dev
      in_dev=$(jq -r --arg d "$dep" '.devDependencies[$d] // ""' "$pkg_dir/package.json")
      [ -n "$in_dev" ] && dep_type="dev"
    fi

    $first || deps_json+=","
    first=false
    deps_json+="{\"name\":\"$dep\",\"type\":\"$dep_type\",\"old\":\"$old_ver\",\"new\":\"$new_ver\"}"
  done < <(snapshot_node_pkg "$pkg_dir")

  # Phase 4 — Detect pinned / manually-bumpable deps via npm outdated
  local outdated_json
  outdated_json=$(cd "$pkg_dir" && npm outdated --json 2>/dev/null) || true
  outdated_json="${outdated_json:-{}}"

  if $HAS_JQ && [ "$outdated_json" != "{}" ] && [ -n "$outdated_json" ]; then
    while IFS= read -r dep; do
      [ -z "$dep" ] && continue
      local current latest
      current=$(echo "$outdated_json" | jq -r --arg d "$dep" '.[$d].current // "unknown"')
      latest=$(echo  "$outdated_json" | jq -r --arg d "$dep" '.[$d].latest  // "unknown"')
      [ "$current" = "$latest" ] && continue

      # Determine dep type
      local dep_type="production"
      local in_dev
      in_dev=$(jq -r --arg d "$dep" '.devDependencies[$d] // ""' "$pkg_dir/package.json")
      [ -n "$in_dev" ] && dep_type="dev"

      $first || deps_json+=","
      first=false
      deps_json+="{\"name\":\"$dep\",\"type\":\"pinned\",\"old\":\"$current\",\"new\":\"$current\",\"latest\":\"$latest\",\"note\":\"pinned - manual bump available\"}"
    done < <(echo "$outdated_json" | jq -r 'keys[]' 2>/dev/null || true)
  fi

  deps_json+="]"

  # Write pending report line: name|path|ecosystem|deps_json
  echo "${name}|${pkg_dir_relative}|node|${deps_json}" >> "$REPORT_FILE.pending"
}

# ---------------------------------------------------------------------------
# Go ecosystem helpers
# ---------------------------------------------------------------------------

update_go_package() {
  local name="hdbhelper" pkg_dir="$REPO_ROOT/hdbhelper"

  if ! has_tool go; then
    skip_package "$name" "hdbhelper" "go" "go not found"
    return
  fi

  echo "INFO: Updating Go package: $name" >&2

  # Phase 1: Snapshot — capture require lines from go.mod
  local old_deps=""
  if $HAS_JQ; then
    old_deps=$(cd "$pkg_dir" && go list -m -json all 2>/dev/null | jq -rs '[.[] | select(.Main != true) | select(.Indirect != true) | {name: .Path, old: .Version}]') || old_deps="[]"
  else
    old_deps=$(grep -E '^\s+\S+ v' "$pkg_dir/go.mod" | awk '{print $1"="$2}') || old_deps=""
  fi

  # Phase 2: Update
  (cd "$pkg_dir" && go get -u ./... 2>&1 && go mod tidy 2>&1) >&2 || echo "WARN: go get/tidy returned non-zero" >&2

  # Capture new versions
  local deps_json="["
  local first=true
  if $HAS_JQ; then
    local new_deps
    new_deps=$(cd "$pkg_dir" && go list -m -json all 2>/dev/null | jq -rs '[.[] | select(.Main != true) | select(.Indirect != true) | {name: .Path, version: .Version}]') || new_deps="[]"
    deps_json=$(jq -cn --argjson old "${old_deps:-[]}" --argjson new "${new_deps:-[]}" '
      [($old | map({(.name): .old}) | add // {}) as $omap |
       $new[] |
       {name: .name, old: ($omap[.name] // "unknown"), new: .version, type: "production"}]
    ') || deps_json="[]"
  else
    while IFS='=' read -r dep ver; do
      [ -z "$dep" ] && continue
      local new_ver
      new_ver=$(grep -E "^\s+${dep} " "$pkg_dir/go.mod" | awk '{print $2}') || new_ver="unknown"
      $first || deps_json+=","
      first=false
      deps_json+="{\"name\":\"$dep\",\"old\":\"$ver\",\"new\":\"$new_ver\",\"type\":\"production\"}"
    done <<< "$old_deps"
    deps_json+="]"
  fi

  echo "$name|hdbhelper|go|$deps_json" >> "$REPORT_FILE.pending"
}

# ---------------------------------------------------------------------------
# Python ecosystem helpers
# ---------------------------------------------------------------------------

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

  echo "INFO: Updating Python package: $name" >&2

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
    local old_ver
    old_ver=$(get_old_version "py_${dep}")
    local dep_type="production"
    if [ "$dep" != "hdbcli" ]; then dep_type="dev"; fi
    $first || deps_json+=","
    first=false
    deps_json+="{\"name\":\"$dep\",\"old\":\"$old_ver\",\"new\":\"$new_ver\",\"type\":\"$dep_type\"}"
  done
  deps_json+="]"

  echo "$name|hdbhelper-py|python|$deps_json" >> "$REPORT_FILE.pending"
}

# ---------------------------------------------------------------------------
# Phase 3: Types Regeneration
# ---------------------------------------------------------------------------

regen_types() {
  for pkg_dir in hdb hdbext; do
    if has_tool npm && [ -d "$REPO_ROOT/$pkg_dir" ]; then
      echo "INFO: Regenerating types for $pkg_dir" >&2
      (cd "$REPO_ROOT/$pkg_dir" && npm run types 2>&1) >&2 || echo "WARN: types regen failed for $pkg_dir" >&2
    fi
  done
}

# ---------------------------------------------------------------------------
# Phase 4: Test
# ---------------------------------------------------------------------------

run_tests() {
  local name="$1" pkg_dir="$REPO_ROOT/$2" ecosystem="$3" test_cmd="$4"

  echo "INFO: Testing $name ($2)" >&2
  local test_output exit_code=0
  test_output=$(cd "$pkg_dir" && eval "$test_cmd" 2>&1) || exit_code=$?

  local passed=true
  if [ $exit_code -ne 0 ]; then passed=false; fi

  # Extract summary line
  local summary=""
  case "$ecosystem" in
    node)
      summary=$(echo "$test_output" | grep -E '^\s+[0-9]+ passing' | head -1) || true
      local skipped
      skipped=$(echo "$test_output" | grep -E '^\s+[0-9]+ pending' | head -1) || true
      [ -n "$skipped" ] && summary="$summary, $skipped"
      ;;
    go)
      summary=$(echo "$test_output" | grep -E '^(ok|FAIL|---)\s' | tail -3 | tr '\n' '; ') || true
      ;;
    python)
      summary=$(echo "$test_output" | grep -E '^=.*(passed|failed|error)' | tail -1) || true
      ;;
  esac
  [ -z "$summary" ] && summary="exit code $exit_code"

  echo "$name|$passed|$summary"
}

# Store test results in temp files (Bash 3.x compat — no associative arrays)
TEST_RESULTS_DIR=$(mktemp -d)

save_test_result() {
  local name="$1" result="$2"
  echo "$result" > "$TEST_RESULTS_DIR/$name"
}

get_test_result() {
  local name="$1"
  if [ -f "$TEST_RESULTS_DIR/$name" ]; then cat "$TEST_RESULTS_DIR/$name"; fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

# --- Main ---
> "$REPORT_FILE.pending"

# Phase 1+2: Update all ecosystems
update_node_package "hdb" "hdb"
update_node_package "hdbext" "hdbext"
update_go_package
update_python_package

# Phase 3: Regenerate types
regen_types

# Phase 4: Run tests
if has_tool npm; then
  for pkg in hdb hdbext; do
    result=$(run_tests "$pkg" "$pkg" "node" "npm test")
    save_test_result "$pkg" "$result"
  done
fi

if has_tool go && [ -d "$REPO_ROOT/hdbhelper" ]; then
  result=$(run_tests "hdbhelper" "hdbhelper" "go" "go test -v ./...")
  save_test_result "hdbhelper" "$result"
fi

if has_tool pip && [ -n "${VIRTUAL_ENV:-}" ] && [ -d "$REPO_ROOT/hdbhelper-py" ]; then
  result=$(run_tests "hdbhelper-py" "hdbhelper-py" "python" "pytest -v")
  save_test_result "hdbhelper-py" "$result"
fi

# Phase 5: Assemble final JSON report
# Merge pending lines (non-skipped packages) with test results
if $HAS_JQ && [ -f "$REPORT_FILE.pending" ]; then
  while IFS='|' read -r pkg_name pkg_path ecosystem deps_json; do
    [ -z "$pkg_name" ] && continue

    # Look up test results for this package
    local_test_line=$(get_test_result "$pkg_name")
    local_test_passed="null"
    local_test_summary="not run"
    if [ -n "$local_test_line" ]; then
      IFS='|' read -r _name tp ts <<< "$local_test_line"
      local_test_passed="$tp"
      local_test_summary="$ts"
    fi

    append_package "$(jq -cn \
      --arg name "$pkg_name" \
      --arg path "$pkg_path" \
      --arg eco "$ecosystem" \
      --argjson deps "${deps_json:-[]}" \
      --argjson passed "$local_test_passed" \
      --arg summary "$local_test_summary" \
      '{name:$name, path:$path, ecosystem:$eco, skipped:false, dependencies:$deps, tests:{passed:$passed, summary:$summary}}'
    )"
  done < "$REPORT_FILE.pending"
fi

cat "$REPORT_FILE"

# Cleanup
rm -f "$REPORT_FILE" "$REPORT_FILE.pending"
rm -rf "$OLD_VERSIONS_DIR" "$TEST_RESULTS_DIR"

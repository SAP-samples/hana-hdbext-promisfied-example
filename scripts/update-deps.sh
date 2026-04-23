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

# Ecosystem update functions will be added by subsequent tasks.
# For now, output the empty report.

# --- Main ---
cat "$REPORT_FILE"

# Cleanup
rm -f "$REPORT_FILE"
rm -rf "$OLD_VERSIONS_DIR"

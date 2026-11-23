#!/usr/bin/env bash
#
# Sets up Cadence's eight Notification workflows in Knock's Development
# environment. Knock has no way to create workflows with the secret API key,
# so this walks you through the dashboard and then proves each workflow is
# committed by triggering it to a throwaway user.
#
# Run: npm run knock:workflows   (needs KNOCK_SECRET_API_KEY and
# the Cadence feed channel set up in Knock, plus curl)
#
# Workflow and category keys must match app/lib/knock-notifier.server.ts.

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env}"
KNOCK_API="https://api.knock.app/v1"
DASHBOARD="https://dashboard.knock.app"
PROBE_USER="cadence-workflow-probe"

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
  BLUE=$'\033[34m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""
fi

env_value() {
  [[ -f "$ENV_FILE" ]] || return 0
  grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

SK="${KNOCK_SECRET_API_KEY:-$(env_value KNOCK_SECRET_API_KEY)}"
if [[ -z "$SK" ]]; then
  printf '%sKNOCK_SECRET_API_KEY is missing from %s%s\n' "$RED" "$ENV_FILE" "$RESET"
  exit 1
fi

say()  { printf '  %s\n' "$1"; }
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }
pause() { printf '  %s%s%s ' "$DIM" "${1:-Press Enter to continue}" "$RESET"; read -r _ || true; }
confirm() {
  local reply=""
  printf '  %s? %s [y/N]%s ' "$YELLOW" "$1" "$RESET"
  read -r reply || true
  [[ "$reply" =~ ^[Yy] ]]
}

# trigger KEY: prints the HTTP status of triggering KEY to the probe user.
trigger() {
  curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H "Authorization: Bearer $SK" -H "Content-Type: application/json" \
    -d "{\"recipients\":[{\"id\":\"$PROBE_USER\",\"name\":\"Workflow probe\"}],\"data\":{\"kind\":\"$1\"}}" \
    "$KNOCK_API/workflows/$1/trigger"
}

FAILED=()

# workflow KEY CATEGORY
workflow() {
  local key="$1" category="$2" status
  printf '\n%s%s▸ %s%s %s(category: %s)%s\n' "$BOLD" "$BLUE" "$key" "$RESET" "$DIM" "$category" "$RESET"

  status=$(trigger "$key")
  if [[ "$status" == 2* ]]; then
    printf '  %s✓ already committed and triggerable%s\n' "$GREEN" "$RESET"
    return
  fi

  step "Environment switcher (top left): Development."
  step "Workflows → Create workflow. Key exactly: ${BOLD}$key${RESET}"
  step "Categories: add ${BOLD}$category${RESET}."
  step "Add a channel step → In-app feed → the Cadence feed channel."
  step "Template body: ${BOLD}{{ data.kind }}${RESET} (the app draws rows from data, not this text)."
  step "Leave room for an email step later; don't add one now."
  step "Save, then Commit to Development."
  while true; do
    pause "Press Enter once it's committed..."
    status=$(trigger "$key")
    if [[ "$status" == 2* ]]; then
      printf '  %s✓ %s is committed and triggerable%s\n' "$GREEN" "$key" "$RESET"
      return
    fi
    warn "trigger returned HTTP $status (404 = missing or not committed)"
    confirm "Retry?" || { FAILED+=("$key"); return; }
  done
}

printf '\n%s%sKnock workflows for Cadence Notifications%s\n' "$BOLD" "$BLUE" "$RESET"
note "Each workflow is checked first; ones that already work are skipped."
say "Opening the Knock dashboard..."
(open "$DASHBOARD" || xdg-open "$DASHBOARD") >/dev/null 2>&1 || note "Visit $DASHBOARD"

workflow refund-request-approved     refund-request-updates
workflow refund-request-declined     refund-request-updates
workflow refund-request-confirmation refund-request-updates
workflow open-refund-request         open-refund-requests
workflow seat-claimed                seat-claims
workflow new-enrollment              enrollments
workflow discussion-question         discussion-questions
workflow discussion-reply            discussion-replies

curl -s -o /dev/null -X DELETE -H "Authorization: Bearer $SK" "$KNOCK_API/users/$PROBE_USER" || true
note "Removed the probe user."

if (( ${#FAILED[@]} )); then
  printf '\n%s✗ Not triggerable yet: %s%s\n' "$RED" "${FAILED[*]}" "$RESET"
  exit 1
fi
printf '\n%s%s✓ All eight workflows are committed.%s\n' "$BOLD" "$GREEN" "$RESET"

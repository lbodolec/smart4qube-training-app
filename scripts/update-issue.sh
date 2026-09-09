#!/usr/bin/env bash
set -euo pipefail

API_URL="${SMART4QUBE_API_URL:-http://localhost:3001}"
PROJECT_ID="${1:-}"
ISSUE_ID="${2:-}"
JSON_FILE="${3:-}"

if [ -z "$PROJECT_ID" ] || [ -z "$ISSUE_ID" ] || [ -z "$JSON_FILE" ]; then
  cat <<EOF
Usage: scripts/update-issue.sh <projectId> <issueId> <path/to/patch.json>

Updates an issue via PUT \$API_URL/issues/:projectId/:issueId, sending the
given JSON file as the request body (a partial IssueUpdate — only the
fields you want to change). See scripts/examples/issue-update.json for a
starting point. Run scripts/list-issues.sh <projectId> first to find an
issueId.

Env: SMART4QUBE_API_URL (default http://localhost:3001)
EOF
  exit 1
fi

if [ ! -f "$JSON_FILE" ]; then
  echo "Error: no such file '$JSON_FILE'" >&2
  exit 1
fi

RESPONSE_FILE=$(mktemp)
trap 'rm -f "$RESPONSE_FILE"' EXIT

HTTP_STATUS=$(curl -sS -o "$RESPONSE_FILE" -w '%{http_code}' \
  -X PUT "$API_URL/issues/$PROJECT_ID/$ISSUE_ID" \
  -H 'Content-Type: application/json' \
  --data-binary @"$JSON_FILE")

if command -v jq >/dev/null 2>&1; then
  jq . "$RESPONSE_FILE"
else
  cat "$RESPONSE_FILE"
fi

if [ "$HTTP_STATUS" != "200" ]; then
  echo "Error: request failed with HTTP $HTTP_STATUS" >&2
  exit 1
fi

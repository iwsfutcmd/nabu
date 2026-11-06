#!/usr/bin/env bash
# A running instance, end to end through Caddy (deploy/compose.yaml): the app is served over
# HTTPS, and a learner signs up, uploads events, syncs them back, exports the account and
# deletes it (gameplan §14.4–14.5).
#
#   deploy/smoke.sh [https://localhost]
#
# For "localhost", Caddy's certificate comes from its own CA: curl skips verification then.
set -euo pipefail
BASE="${1:-https://localhost}"
CURL=(curl --silent --show-error --fail-with-body)
[[ "$BASE" == https://localhost* ]] && CURL+=(--insecure)
json() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }
step() { echo "== $*"; }

step "the app and the API answer on one origin"
for _ in $(seq 1 60); do "${CURL[@]}" "$BASE/healthz" >/dev/null 2>&1 && break; sleep 2; done
"${CURL[@]}" "$BASE/healthz" | grep -q '"ok":true'
"${CURL[@]}" "$BASE/" | grep -qi '<!doctype html>'
"${CURL[@]}" "$BASE/bundles/index.json" | json "['courses'][0]['id']" >/dev/null
"${CURL[@]}" -o /dev/null -w '%{http_code}\n' "$BASE/some/deep/link" | grep -q 200

step "a learner signs up"
EMAIL="smoke-$(date +%s)-$RANDOM@example.com"
PASSWORD="correct horse battery staple"
TOKEN=$("${CURL[@]}" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" "$BASE/v1/auth/sign-up" | json "['token']")
AUTH=(-H "Authorization: Bearer $TOKEN")

step "uploads a session and reads it back"
SESSION=$(python3 -c "import uuid; print(uuid.uuid4())")
EVENT=$(python3 -c "import uuid; print(uuid.uuid4())")
BUNDLE=$("${CURL[@]}" "$BASE/bundles/fa/manifest.json" | json "['id']")
cat > /tmp/nabu-smoke-events.json <<EOF
{"events":[{"type":"session_started","id":"$EVENT","schema":1,"device":"smoke","course":"fa","orthography":"fa-Arab/standard","support":"en","bundle":"$BUNDLE","session":"$SESSION","clientTime":"2026-03-01T09:00:00.000Z","localDate":"2026-03-01","tz":"UTC","mode":"lesson","node":"fa.greetings","seed":1,"exercises":1,"planner":"smoke"}]}
EOF
UPLOAD=$("${CURL[@]}" "${AUTH[@]}" -H 'Content-Type: application/json' --data @/tmp/nabu-smoke-events.json "$BASE/v1/events")
echo "$UPLOAD" | json "['accepted']" | grep -qx 1
"${CURL[@]}" "${AUTH[@]}" "$BASE/v1/events?since=0" | json "['events'][0]['id']" | grep -qx "$EVENT"

step "exports the account"
"${CURL[@]}" "${AUTH[@]}" "$BASE/v1/export" | json "['user']['email']" | grep -qx "$EMAIL"

step "deletes it"
"${CURL[@]}" "${AUTH[@]}" -X DELETE -H 'Content-Type: application/json' -d "{\"password\":\"$PASSWORD\"}" -o /dev/null -w '%{http_code}\n' "$BASE/v1/account" | grep -qx 204
STATUS=$(curl --silent --insecure -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" "$BASE/v1/auth/sign-in")
[[ "$STATUS" == 401 ]]

echo "smoke: ok"

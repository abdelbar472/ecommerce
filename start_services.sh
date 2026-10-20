#!/usr/bin/env bash
# start_services.sh - start the 7 FastAPI services in THIS terminal (live logs).
# Works in Git Bash / WSL / Linux.

set -u

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export PYTHONIOENCODING=utf-8
if command -v cygpath >/dev/null 2>&1; then
  # Windows Python needs Windows-style paths separated by ';'
  export PYTHONPATH="$(cygpath -w "$DIR");$(cygpath -w "$DIR/services")"
else
  export PYTHONPATH="$DIR:$DIR/services"
fi

cd "$DIR"

services=(
  "8004 services.auth.main:app --reload"
  "8001 services.order.main:app"
  "8002 services.notification.main:app --reload"
  "8003 services.analytics.main:app --reload"
  "8006 services.client.main:app --reload"
  "8007 services.merchant.main:app --reload"
  "8008 services.admin.main:app --reload"
)

pids=()
for spec in "${services[@]}"; do
  port="${spec%% *}"
  echo "--- starting :$port  ($spec)"
  python -m uvicorn ${spec} --host 0.0.0.0 2>&1 &
  pids+=($!)
  sleep 1
done

echo
echo "All services started."
echo "Auth 8004 | Order 8001 | Notification 8002 | Analytics 8003 | Client 8006 | Merchant 8007 | Admin 8008"
echo "Ctrl+C stops them all."

cleanup() {
  echo
  echo "Stopping services..."
  kill "${pids[@]}" 2>/dev/null
}
trap cleanup INT TERM EXIT

wait

#!/usr/bin/env bash
# start_all.sh — everything in ONE terminal
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PIDS=()

cleanup() {
  echo ""
  echo "Stopping services..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

PORTS=(8004 8001 8002 8003 8006 8007 8008 3000)

free_port() {
  local port="$1"
  netstat -ano 2>/dev/null \
    | awk -v p=":$port" '$0 ~ p {print $NF}' \
    | sort -u \
    | while read -r pid; do
        [[ "$pid" =~ ^[0-9]+$ ]] && taskkill //F //PID "$pid" 2>/dev/null || true
      done
}

echo "==> Docker"
docker compose up -d

echo "==> Wait Postgres"
until docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; do
  sleep 1
done

if ! docker compose exec -T postgres psql -U postgres -tc \
  "SELECT 1 FROM pg_database WHERE datname='market_db'" 2>/dev/null | grep -q 1; then
  echo "==> Init DB"
  docker compose exec -T postgres psql -U postgres < init-db/init.sql
fi

echo "==> Free ports"
for p in "${PORTS[@]}"; do free_port "$p"; done

start_bg() {
  local name="$1"
  shift
  echo "  -> $name"
  "$@" &
  PIDS+=($!)
}

echo "==> Start services (background)"
start_bg "Auth         :8004" uvicorn services.auth.main:app         --host 0.0.0.0 --port 8004 --reload
start_bg "Order        :8001" uvicorn services.order.main:app        --host 0.0.0.0 --port 8001 --reload
start_bg "Notification :8002" uvicorn services.notification.main:app --host 0.0.0.0 --port 8002 --reload
start_bg "Analytics    :8003" uvicorn services.analytics.main:app    --host 0.0.0.0 --port 8003 --reload
start_bg "Client       :8006" uvicorn services.client.main:app       --host 0.0.0.0 --port 8006 --reload
start_bg "Merchant     :8007" uvicorn services.merchant.main:app     --host 0.0.0.0 --port 8007 --reload
start_bg "Admin        :8008" uvicorn services.admin.main:app        --host 0.0.0.0 --port 8008 --reload

if [[ -d frontend ]]; then
  start_bg "Frontend     :3000" bash -c "cd frontend && npm run dev"
fi

echo ""
echo "All running in this terminal. Logs mixed below."
echo "Press Ctrl+C to stop everything."
echo ""

wait
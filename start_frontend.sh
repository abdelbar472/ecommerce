#!/usr/bin/env bash
# start_frontend.sh - start the Next.js dev server in this terminal.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/frontend" && npm run dev

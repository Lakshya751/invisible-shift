#!/usr/bin/env bash
# One-command local launch: installs deps if missing, builds the UI, serves everything on :8000.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/backend"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements.txt
fi
cd "$ROOT/frontend"
[ -d node_modules ] || npm install --no-audit --no-fund
npm run build
cd "$ROOT/backend"
echo ""
echo "  Invisible Shift → http://localhost:8000"
echo ""
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

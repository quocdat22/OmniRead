#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# 1. Check if frontend build exists
if [ ! -d "frontend/dist" ]; then
    echo ">> Building frontend..."
    (cd frontend && npm run build)
fi

echo "=============================================="
echo " Starting OmniRead Full-Stack Server"
echo " Web UI & API: http://127.0.0.1:8000"
echo "=============================================="

cd backend
if command -v uv &> /dev/null; then
    uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
else
    .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
fi

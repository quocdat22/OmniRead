#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=============================================="
echo " Starting OmniRead in Development Mode"
echo " Backend:  http://127.0.0.1:8000"
echo " Frontend: http://localhost:5173"
echo "=============================================="

npm run dev

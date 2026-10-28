#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=============================================="
echo " Setting up OmniRead Worktree / Environment"
echo " Directory: $DIR"
echo "=============================================="

# 1. Environment configuration (.env)
echo ""
echo ">> [1/4] Checking environment configuration..."
if [ ! -f "backend/.env" ]; then
    if [ -f "backend/.env.example" ]; then
        echo "   Creating backend/.env from backend/.env.example..."
        cp backend/.env.example backend/.env
    elif [ -f ".env.example" ]; then
        echo "   Creating backend/.env from .env.example..."
        cp .env.example backend/.env
    fi
else
    echo "   backend/.env already exists."
fi

if [ ! -e ".env" ] && [ -f "backend/.env" ]; then
    echo "   Creating symlink .env -> backend/.env..."
    ln -s backend/.env .env
fi

# Ensure storage directories exist
mkdir -p backend/data/pdfs backend/data/tmp

# 2. Backend virtualenv & dependencies
echo ""
echo ">> [2/4] Setting up Backend Python environment..."
cd "$DIR/backend"
if command -v uv &> /dev/null; then
    if [ ! -d ".venv" ]; then
        echo "   Creating Python virtual environment using uv..."
        uv venv .venv
    fi
    echo "   Installing backend dependencies with uv..."
    uv pip install -r requirements.txt
else
    if [ ! -d ".venv" ]; then
        echo "   Creating Python virtual environment using python3 -m venv..."
        python3 -m venv .venv
    fi
    echo "   Installing backend dependencies with pip..."
    .venv/bin/pip install --upgrade pip
    .venv/bin/pip install -r requirements.txt
fi

# 3. Root Node dependencies (for concurrently & dev scripts)
echo ""
echo ">> [3/4] Installing root npm dependencies..."
cd "$DIR"
npm install

# 4. Frontend dependencies & build
echo ""
echo ">> [4/4] Setting up Frontend..."
cd "$DIR/frontend"
echo "   Installing frontend dependencies..."
npm install
echo "   Building frontend..."
npm run build

echo ""
echo "=============================================="
echo " Setup completed successfully!"
echo " - Run './dev.sh'   for development mode (hot-reload)"
echo " - Run './start.sh' for production mode (single port)"
echo "=============================================="

# ========================================================
# Stage 1: Build Frontend (Vite + React)
# ========================================================
FROM node:22-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ========================================================
# Stage 2: Production Python Runtime
# ========================================================
FROM python:3.12-slim AS runner

WORKDIR /app

# Cài đặt curl cho container healthcheck và thư viện hệ thống cho PyMuPDF
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Cài đặt Python dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend source code
COPY backend/ ./backend/

# Copy frontend static distribution từ stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Tạo thư mục dữ liệu SQLite và PDF
RUN mkdir -p /app/backend/data/pdfs /app/backend/data/tmp

WORKDIR /app/backend

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import books
from app.config import BASE_DIR, settings
from app.db import init_db
from app.services.worker import manager

log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    await init_db()
    if not settings.deepseek_api_key:
        log.warning("DEEPSEEK_API_KEY chưa được cấu hình: parse PDF vẫn chạy nhưng dịch sẽ báo lỗi.")
    await manager.resume_unfinished()
    yield
    await manager.shutdown()


app = FastAPI(title="OmniRead API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(books.router, prefix="/api")


@app.api_route("/api/health", methods=["GET", "HEAD"])
async def health():
    return {"ok": True, "translator_configured": bool(settings.deepseek_api_key)}


# Phục vụ Frontend SPA khi đã build (hỗ trợ triển khai Docker/single-port production)
frontend_dist = BASE_DIR.parent / "frontend" / "dist"
if frontend_dist.is_dir():
    assets_dir = frontend_dist / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
    async def serve_spa(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        index_file = frontend_dist / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Not Found")

from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from app.config import settings
from app.db import block_to_dict, connect, fetch_book, fetch_books
from app.services.worker import manager

router = APIRouter()


# ------------------------------------------------------------------ upload
async def _save_upload(file: UploadFile) -> tuple[Path, str]:
    """Stream upload ra file tạm, vừa ghi vừa tính SHA-256, kiểm tra kích thước + magic bytes."""
    tmp = settings.tmp_dir / f"{uuid.uuid4().hex}.upload"
    limit = settings.max_upload_mb * 1024 * 1024
    h, size = hashlib.sha256(), 0
    try:
        with tmp.open("wb") as f:
            while chunk := await file.read(1024 * 1024):
                if size == 0 and not chunk.startswith(b"%PDF-"):
                    raise HTTPException(400, "File không phải PDF hợp lệ")
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"File vượt quá {settings.max_upload_mb} MB")
                h.update(chunk)
                f.write(chunk)
        if size == 0:
            raise HTTPException(400, "File rỗng")
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    return tmp, h.hexdigest()


@router.post("/books", status_code=201)
async def upload_book(file: UploadFile = File(...)):
    filename = file.filename or "book.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Chỉ hỗ trợ file PDF")

    tmp, digest = await _save_upload(file)
    async with connect() as db:
        cur = await db.execute("SELECT id FROM books WHERE file_hash = ?", (digest,))
        existing = await cur.fetchone()
        if existing:
            tmp.unlink(missing_ok=True)
            raise HTTPException(409, detail={"message": "Sách này đã được upload", "book_id": existing["id"]})

        tmp.replace(settings.pdf_dir / f"{digest}.pdf")
        cur = await db.execute(
            "INSERT INTO books (title, filename, file_hash) VALUES (?, ?, ?)",
            (Path(filename).stem, filename, digest),
        )
        await db.commit()
        book_id = cur.lastrowid
        book = await fetch_book(db, book_id)

    manager.schedule(book_id, ingest=True)  # parse + dịch chạy nền
    return book


# ------------------------------------------------------------------ đọc dữ liệu
@router.get("/books")
async def list_books():
    async with connect() as db:
        return await fetch_books(db)


@router.get("/books/{book_id}")
async def get_book(book_id: int):
    async with connect() as db:
        book = await fetch_book(db, book_id)
    if book is None:
        raise HTTPException(404, "Không tìm thấy sách")
    return book


@router.get("/books/{book_id}/file")
async def get_book_file(book_id: int):
    async with connect() as db:
        cur = await db.execute("SELECT file_hash FROM books WHERE id = ?", (book_id,))
        row = await cur.fetchone()
    path = settings.pdf_dir / f"{row['file_hash']}.pdf" if row else None
    if path is None or not path.exists():
        raise HTTPException(404, "Không tìm thấy file")
    return FileResponse(path, media_type="application/pdf")


@router.get("/books/{book_id}/blocks")
async def get_blocks(book_id: int, page: int = Query(..., ge=1)):
    async with connect() as db:
        book = await fetch_book(db, book_id)
        if book is None:
            raise HTTPException(404, "Không tìm thấy sách")
        if book["status"] == "parsing":
            raise HTTPException(409, "Sách đang được xử lý, thử lại sau")
        cur = await db.execute("SELECT width, height FROM pages WHERE book_id = ? AND page = ?", (book_id, page))
        pg = await cur.fetchone()
        if pg is None:
            raise HTTPException(404, "Trang không tồn tại")
        cur = await db.execute(
            """
            SELECT 
                b.id, b.book_id, b.page, b.idx, b.text, b.bbox,
                COALESCE(h.translation, b.translation) AS translation,
                COALESCE(h.status, b.status)           AS status,
                COALESCE(h.error_msg, b.error_msg)     AS error_msg,
                COALESCE(b.group_id, b.id)             AS group_id,
                b.part_no,
                b.font_size,
                b.sentences,
                (SELECT COUNT(*) FROM blocks g WHERE g.book_id = b.book_id AND COALESCE(g.group_id, g.id) = COALESCE(b.group_id, b.id)) AS group_size
            FROM blocks b
            LEFT JOIN blocks h ON h.id = b.group_id
            WHERE b.book_id = ? AND b.page = ?
            ORDER BY b.idx
            """,
            (book_id, page),
        )
        rows = await cur.fetchall()

    manager.set_focus(book_id, page)  # side-effect có chủ đích: ưu tiên dịch quanh trang đang đọc
    return {
        "page": {"number": page, "width": pg["width"], "height": pg["height"]},
        "blocks": [block_to_dict(r) for r in rows],
    }


# ------------------------------------------------------------------ tiến độ (SSE)
@router.get("/books/{book_id}/progress")
async def progress(book_id: int, request: Request):
    async def events():
        last = None
        while not await request.is_disconnected():
            async with connect() as db:
                book = await fetch_book(db, book_id)
            if book is None:
                yield "event: gone\ndata: {}\n\n"
                return
            payload = {
                k: book[k]
                for k in ("status", "total", "done", "errors", "error_msg", "pages_done", "pages_total")
            }
            if payload != last:
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
                last = payload
            if book["status"] not in ("parsing", "translating"):
                return
            await asyncio.sleep(1)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ------------------------------------------------------------------ thao tác
@router.post("/books/{book_id}/retry")
async def retry_book(book_id: int):
    async with connect() as db:
        book = await fetch_book(db, book_id)
        if book is None:
            raise HTTPException(404, "Không tìm thấy sách")
        if book["status"] == "parsing":
            raise HTTPException(409, "Sách đang được parse")
        await db.execute(
            "UPDATE blocks SET status = 'pending', error_msg = NULL WHERE book_id = ? AND status = 'error'",
            (book_id,),
        )
        await db.commit()
    # total == 0 nghĩa là lần parse trước thất bại -> parse lại từ đầu
    manager.schedule(book_id, ingest=(book["total"] == 0))
    return {"ok": True}


@router.delete("/books/{book_id}", status_code=204)
async def delete_book(book_id: int):
    await manager.cancel(book_id)
    async with connect() as db:
        cur = await db.execute("SELECT file_hash FROM books WHERE id = ?", (book_id,))
        row = await cur.fetchone()
        if row is None:
            raise HTTPException(404, "Không tìm thấy sách")
        await db.execute("DELETE FROM books WHERE id = ?", (book_id,))  # cascade pages + blocks
        await db.commit()
    (settings.pdf_dir / f"{row['file_hash']}.pdf").unlink(missing_ok=True)

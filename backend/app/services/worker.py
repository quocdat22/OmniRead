"""Điều phối pipeline: parse PDF -> lưu block -> dịch toàn bộ bằng N worker song song.

- Resume được: block 'pending'/'translating' sẽ được dịch tiếp sau khi khởi động lại.
- Ưu tiên dịch các trang gần trang người dùng đang đọc (set_focus).
- Lỗi nghiêm trọng (sai key, hết tiền) dừng cả job; lỗi lẻ chỉ đánh dấu block 'error'.
"""
from __future__ import annotations

import asyncio
import json
import logging

from app.config import settings
from app.db import block_to_dict, connect
from app.services.pdf_parser import PdfParseError, parse_pdf
from app.services.translator import FatalTranslationError, Translator

log = logging.getLogger(__name__)

# Nhận 1 block 'pending' (ưu tiên gần trang focus) và đánh dấu 'translating' trong 1 câu lệnh
# nguyên tử -> nhiều worker không bao giờ lấy trùng. Cần SQLite >= 3.35 (RETURNING).
_CLAIM_SQL = """
UPDATE blocks SET status = 'translating'
WHERE id = (
    SELECT id FROM blocks
    WHERE book_id = ? AND status = 'pending'
    ORDER BY ABS(page - ?), page, idx
    LIMIT 1
)
RETURNING id, text
"""


class JobManager:
    def __init__(self) -> None:
        self.translator = Translator()
        self._tasks: dict[int, asyncio.Task] = {}
        self._focus: dict[int, int] = {}
        self._fatal: dict[int, str] = {}

    # ------------------------------------------------------------ điều khiển job
    def schedule(self, book_id: int, *, ingest: bool = False) -> None:
        running = self._tasks.get(book_id)
        if running and not running.done():
            return
        task = asyncio.create_task(self._pipeline(book_id, ingest))
        self._tasks[book_id] = task
        task.add_done_callback(
            lambda t, bid=book_id: self._tasks.pop(bid, None) if self._tasks.get(bid) is t else None
        )

    def set_focus(self, book_id: int, page: int) -> None:
        self._focus[book_id] = page

    async def cancel(self, book_id: int) -> None:
        task = self._tasks.pop(book_id, None)
        if task and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        self._focus.pop(book_id, None)
        self._fatal.pop(book_id, None)

    async def resume_unfinished(self) -> None:
        async with connect() as db:
            cur = await db.execute(
                "SELECT id, status FROM books WHERE status IN ('parsing', 'translating')"
            )
            rows = await cur.fetchall()
        for r in rows:
            log.info("Resume book %s (%s)", r["id"], r["status"])
            self.schedule(r["id"], ingest=(r["status"] == "parsing"))

    async def shutdown(self) -> None:
        tasks = [t for t in self._tasks.values() if not t.done()]
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    # ------------------------------------------------------------ pipeline
    async def _pipeline(self, book_id: int, ingest: bool) -> None:
        try:
            if ingest and not await self._ingest(book_id):
                return
            await self._translate_all(book_id)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.exception("Pipeline lỗi (book %s)", book_id)
            await self._set_book_error(book_id, f"Lỗi không mong đợi: {e}")

    async def _set_book_error(self, book_id: int, msg: str) -> None:
        async with connect() as db:
            await db.execute(
                "UPDATE books SET status = 'error', error_msg = ? WHERE id = ?", (msg, book_id)
            )
            await db.commit()

    async def _ingest(self, book_id: int) -> bool:
        async with connect() as db:
            cur = await db.execute("SELECT file_hash FROM books WHERE id = ?", (book_id,))
            row = await cur.fetchone()
            if row is None:
                return False
            await db.execute("UPDATE books SET status = 'parsing', error_msg = NULL WHERE id = ?", (book_id,))
            await db.commit()

        path = settings.pdf_dir / f"{row['file_hash']}.pdf"
        try:
            doc = await asyncio.to_thread(parse_pdf, path)
        except PdfParseError as e:
            await self._set_book_error(book_id, str(e))
            return False
        if not doc.blocks:
            await self._set_book_error(book_id, "Không tìm thấy đoạn văn nào trong PDF.")
            return False

        async with connect() as db:
            await db.execute("DELETE FROM blocks WHERE book_id = ?", (book_id,))
            await db.execute("DELETE FROM pages WHERE book_id = ?", (book_id,))
            await db.executemany(
                "INSERT INTO pages (book_id, page, width, height) VALUES (?, ?, ?, ?)",
                [(book_id, p.number, p.width, p.height) for p in doc.pages],
            )
            await db.executemany(
                "INSERT INTO blocks (book_id, page, idx, text, bbox) VALUES (?, ?, ?, ?, ?)",
                [(book_id, b.page, b.idx, b.text, json.dumps(b.bbox)) for b in doc.blocks],
            )
            await db.execute(
                "UPDATE books SET page_count = ?, title = COALESCE(?, title), status = 'translating' WHERE id = ?",
                (len(doc.pages), doc.title, book_id),
            )
            await db.commit()
        log.info("Book %s: %d trang, %d block", book_id, len(doc.pages), len(doc.blocks))
        return True

    async def _translate_all(self, book_id: int) -> None:
        self._fatal.pop(book_id, None)
        async with connect() as db:
            # Phục hồi block bị kẹt 'translating' do lần chạy trước bị ngắt.
            await db.execute(
                "UPDATE blocks SET status = 'pending' WHERE book_id = ? AND status = 'translating'", (book_id,)
            )
            await db.execute("UPDATE books SET status = 'translating', error_msg = NULL WHERE id = ?", (book_id,))
            await db.commit()

        await asyncio.gather(*(self._worker(book_id) for _ in range(settings.concurrency)))

        async with connect() as db:
            fatal = self._fatal.pop(book_id, None)
            if fatal:
                await db.execute("UPDATE books SET status = 'error', error_msg = ? WHERE id = ?", (fatal, book_id))
            else:
                cur = await db.execute(
                    "SELECT COUNT(*) AS n FROM blocks WHERE book_id = ? AND status = 'error'", (book_id,)
                )
                n_err = (await cur.fetchone())["n"]
                await db.execute(
                    "UPDATE books SET status = ? WHERE id = ?", ("partial" if n_err else "done", book_id)
                )
            await db.commit()

    async def _worker(self, book_id: int) -> None:
        async with connect() as db:
            while book_id not in self._fatal:
                cur = await db.execute(_CLAIM_SQL, (book_id, self._focus.get(book_id, 1)))
                rows = await cur.fetchall()
                await db.commit()
                if not rows:
                    return
                block_id, text = rows[0]["id"], rows[0]["text"]
                try:
                    translation = await self.translator.translate(text)
                    await db.execute(
                        "UPDATE blocks SET translation = ?, status = 'done', error_msg = NULL WHERE id = ?",
                        (translation, block_id),
                    )
                except FatalTranslationError as e:
                    self._fatal[book_id] = str(e)
                    await db.execute("UPDATE blocks SET status = 'pending' WHERE id = ?", (block_id,))
                except Exception as e:  # noqa: BLE001
                    log.warning("Block %s lỗi: %s", block_id, e)
                    await db.execute(
                        "UPDATE blocks SET status = 'error', error_msg = ? WHERE id = ?", (str(e)[:500], block_id)
                    )
                await db.commit()


manager = JobManager()

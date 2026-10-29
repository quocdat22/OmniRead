"""Điều phối pipeline: parse PDF -> lưu block -> dịch toàn bộ bằng N worker song song theo từng trang.

- Batching theo trang: Các block trong cùng một trang được gửi chung 1 request để bảo toàn ngữ cảnh liên kết.
- Resume được: block 'pending'/'translating' sẽ được dịch tiếp sau khi khởi động lại.
- Ưu tiên dịch các trang gần trang người dùng đang đọc (set_focus).
- Lỗi nghiêm trọng (sai key, hết tiền) dừng cả job; lỗi lẻ chỉ đánh dấu block 'error'.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict

from app.config import settings
from app.db import block_to_dict, connect
from app.services.pdf_parser import ParsedBlock, PdfParseError, parse_pdf
from app.services.translator import FatalTranslationError, Translator

log = logging.getLogger(__name__)

# Nhận tất cả head block 'pending' của 1 trang (ưu tiên gần trang focus) và đánh dấu 'translating'
# trong 1 câu lệnh nguyên tử -> nhiều worker không bao giờ lấy trùng. Cần SQLite >= 3.35 (RETURNING).
_CLAIM_PAGE_SQL = """
UPDATE blocks SET status = 'translating'
WHERE book_id = ? AND page = (
    SELECT page FROM blocks
    WHERE book_id = ? AND status = 'pending' AND (group_id = id OR group_id IS NULL)
    ORDER BY ABS(page - ?), page
    LIMIT 1
) AND status = 'pending' AND (group_id = id OR group_id IS NULL)
RETURNING id, page, idx, group_id
"""


def _join_group_texts(texts: list[str]) -> str:
    res = ""
    for t in texts:
        t = t.strip()
        if not t:
            continue
        if not res:
            res = t
        elif (res.endswith("-") or res.endswith("‐")) and len(res) > 1 and res[-2].isalpha() and t[:1].islower():
            res = res[:-1] + t
        else:
            res += " " + t
    return res


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
            await self._set_book_error(book_id, getattr(e, "code", ErrorCode.INTERNAL_ERROR.value))

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
            await self._set_book_error(book_id, getattr(e, "code", str(e)))
            return False
        if not doc.blocks:
            await self._set_book_error(book_id, "NO_PARAGRAPHS_FOUND")
            return False

        async with connect() as db:
            await db.execute("DELETE FROM blocks WHERE book_id = ?", (book_id,))
            await db.execute("DELETE FROM pages WHERE book_id = ?", (book_id,))
            await db.executemany(
                "INSERT INTO pages (book_id, page, width, height) VALUES (?, ?, ?, ?)",
                [(book_id, p.number, p.width, p.height) for p in doc.pages],
            )

            # Gom parsed blocks theo group_key để lưu group_id
            groups_dict: dict[int, list[ParsedBlock]] = defaultdict(list)
            for b in doc.blocks:
                groups_dict[b.group_key].append(b)

            for group_blocks in groups_dict.values():
                head = group_blocks[0]
                cur = await db.execute(
                    "INSERT INTO blocks (book_id, page, idx, text, bbox, part_no, font_size, sentences) VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
                    (book_id, head.page, head.idx, head.text, json.dumps(head.bbox), head.font_size, json.dumps(head.sentences) if head.sentences else None),
                )
                head_id = cur.lastrowid
                await db.execute("UPDATE blocks SET group_id = ? WHERE id = ?", (head_id, head_id))
                if len(group_blocks) > 1:
                    await db.executemany(
                        "INSERT INTO blocks (book_id, page, idx, text, bbox, group_id, part_no, font_size, sentences) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        [
                            (book_id, child.page, child.idx, child.text, json.dumps(child.bbox), head_id, child.part_no, child.font_size, json.dumps(child.sentences) if child.sentences else None)
                            for child in group_blocks[1:]
                        ],
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
                cur = await db.execute(_CLAIM_PAGE_SQL, (book_id, book_id, self._focus.get(book_id, 1)))
                rows = await cur.fetchall()
                await db.commit()
                if not rows:
                    return

                page = rows[0]["page"]
                group_ids = list({r["group_id"] or r["id"] for r in rows})

                # Đánh dấu toàn bộ mảnh con trong nhóm sang 'translating'
                placeholders = ",".join("?" * len(group_ids))
                await db.execute(
                    f"UPDATE blocks SET status = 'translating' WHERE book_id = ? AND group_id IN ({placeholders})",
                    (book_id, *group_ids),
                )
                await db.commit()

                # Lấy toàn bộ text của từng block/nhóm theo thứ tự đọc trong trang (idx)
                sorted_rows = sorted(rows, key=lambda r: r["idx"])
                page_items: list[tuple[int, str]] = []
                for r in sorted_rows:
                    head_id = r["id"]
                    gid = r["group_id"] or head_id
                    cur = await db.execute(
                        "SELECT text FROM blocks WHERE book_id = ? AND (group_id = ? OR id = ?) ORDER BY part_no",
                        (book_id, gid, gid),
                    )
                    text_rows = await cur.fetchall()
                    combined_text = _join_group_texts([tr["text"] for tr in text_rows])
                    page_items.append((head_id, combined_text))

                try:
                    translations = await self.translator.translate_batch(page_items)
                except FatalTranslationError as e:
                    self._fatal[book_id] = getattr(e, "code", str(e))
                    await db.execute(
                        f"UPDATE blocks SET status = 'pending' WHERE book_id = ? AND (group_id IN ({placeholders}) OR id IN ({placeholders}))",
                        (book_id, *group_ids, *group_ids),
                    )
                    await db.commit()
                    return
                except Exception as e:  # noqa: BLE001
                    log.warning("Trang %s (book %s) dịch batch lỗi: %s, fallback dịch từng block", page, book_id, e)
                    translations = {}

                # Lưu kết quả và fallback dịch lẻ nếu thiếu block
                for head_id, combined_text in page_items:
                    gid = next((r["group_id"] for r in rows if r["id"] == head_id), head_id) or head_id
                    tr_text = translations.get(head_id)
                    if tr_text:
                        await db.execute(
                            "UPDATE blocks SET translation = ?, status = 'done', error_msg = NULL WHERE id = ?",
                            (tr_text, head_id),
                        )
                        await db.execute(
                            "UPDATE blocks SET status = 'done', error_msg = NULL WHERE book_id = ? AND (group_id = ? OR id = ?)",
                            (book_id, gid, gid),
                        )
                    else:
                        # Fallback dịch riêng block này nếu không có trong kết quả batch
                        try:
                            tr_text = await self.translator.translate(combined_text)
                            await db.execute(
                                "UPDATE blocks SET translation = ?, status = 'done', error_msg = NULL WHERE id = ?",
                                (tr_text, head_id),
                            )
                            await db.execute(
                                "UPDATE blocks SET status = 'done', error_msg = NULL WHERE book_id = ? AND (group_id = ? OR id = ?)",
                                (book_id, gid, gid),
                            )
                        except FatalTranslationError as e:
                            self._fatal[book_id] = getattr(e, "code", str(e))
                            await db.execute(
                                "UPDATE blocks SET status = 'pending' WHERE book_id = ? AND (group_id = ? OR id = ?)",
                                (book_id, gid, gid),
                            )
                            await db.commit()
                            return
                        except Exception as e:  # noqa: BLE001
                            log.warning("Block %s lỗi: %s", head_id, e)
                            err_val = getattr(e, "code", str(e)[:500])
                            await db.execute(
                                "UPDATE blocks SET status = 'error', error_msg = ? WHERE book_id = ? AND (group_id = ? OR id = ?)",
                                (err_val, book_id, gid, gid),
                            )
                await db.commit()


manager = JobManager()

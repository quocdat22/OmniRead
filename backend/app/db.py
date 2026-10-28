from __future__ import annotations

import json
from contextlib import asynccontextmanager

import aiosqlite

from app.config import settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS books (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  filename   TEXT NOT NULL,
  file_hash  TEXT NOT NULL UNIQUE,
  page_count INTEGER NOT NULL DEFAULT 0,
  -- parsing | translating | done | partial (còn block lỗi) | error
  status     TEXT NOT NULL DEFAULT 'parsing',
  error_msg  TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pages (
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page    INTEGER NOT NULL,
  width   REAL NOT NULL,
  height  REAL NOT NULL,
  PRIMARY KEY (book_id, page)
);

CREATE TABLE IF NOT EXISTS blocks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page        INTEGER NOT NULL,
  idx         INTEGER NOT NULL,
  text        TEXT NOT NULL,
  bbox        TEXT NOT NULL,            -- JSON [x0, y0, x1, y1], đơn vị point, gốc trên-trái
  translation TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | translating | done | error
  error_msg   TEXT,
  group_id    INTEGER,                  -- id của block đầu nhóm; NULL/tự trỏ nếu đứng một mình
  part_no     INTEGER NOT NULL DEFAULT 0, -- thứ tự mảnh trong nhóm
  font_size   REAL,                     -- cỡ chữ gốc (point)
  sentences   TEXT                      -- JSON array: [{"text": str, "rects": [[x0, y0, x1, y1], ...]}]
);
CREATE INDEX IF NOT EXISTS idx_blocks_page   ON blocks(book_id, page, idx);
CREATE INDEX IF NOT EXISTS idx_blocks_status ON blocks(book_id, status);
CREATE INDEX IF NOT EXISTS idx_blocks_book_page_status ON blocks(book_id, page, status);
"""


@asynccontextmanager
async def connect():
    db = await aiosqlite.connect(settings.db_path, timeout=30)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys = ON")
    try:
        yield db
    finally:
        await db.close()


async def init_db() -> None:
    settings.pdf_dir.mkdir(parents=True, exist_ok=True)
    settings.tmp_dir.mkdir(parents=True, exist_ok=True)
    async with connect() as db:
        await db.execute("PRAGMA journal_mode = WAL")
        await db.executescript(SCHEMA)

        # Migration cho database cũ nếu thiếu cột group_id hoặc part_no
        cur = await db.execute("PRAGMA table_info(blocks)")
        columns = {row["name"] for row in await cur.fetchall()}
        if "group_id" not in columns:
            await db.execute("ALTER TABLE blocks ADD COLUMN group_id INTEGER")
        if "part_no" not in columns:
            await db.execute("ALTER TABLE blocks ADD COLUMN part_no INTEGER NOT NULL DEFAULT 0")
        if "font_size" not in columns:
            await db.execute("ALTER TABLE blocks ADD COLUMN font_size REAL")
        if "sentences" not in columns:
            await db.execute("ALTER TABLE blocks ADD COLUMN sentences TEXT")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_blocks_group ON blocks(book_id, group_id, part_no)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_blocks_book_page_status ON blocks(book_id, page, status)")

        # Backfill sentences cho các block cũ nếu thiếu
        cur = await db.execute("SELECT COUNT(*) AS c FROM blocks WHERE sentences IS NULL")
        if (await cur.fetchone())["c"] > 0:
            cur = await db.execute("SELECT id, file_hash FROM books")
            books = await cur.fetchall()
            from app.services.pdf_parser import parse_pdf
            for b in books:
                pdf_path = settings.pdf_dir / f"{b['file_hash']}.pdf"
                if pdf_path.exists():
                    try:
                        doc = parse_pdf(pdf_path)
                        for pb in doc.blocks:
                            if pb.sentences:
                                await db.execute(
                                    "UPDATE blocks SET sentences = ? WHERE book_id = ? AND page = ? AND idx = ? AND sentences IS NULL",
                                    (json.dumps(pb.sentences), b["id"], pb.page, pb.idx),
                                )
                    except Exception:
                        pass

        # Backfill font_size cho các block cũ nếu thiếu
        cur = await db.execute("SELECT COUNT(*) AS c FROM blocks WHERE font_size IS NULL")
        if (await cur.fetchone())["c"] > 0:
            cur = await db.execute("SELECT id, file_hash FROM books")
            books = await cur.fetchall()
            from app.services.pdf_parser import parse_pdf
            for b in books:
                pdf_path = settings.pdf_dir / f"{b['file_hash']}.pdf"
                if pdf_path.exists():
                    try:
                        doc = parse_pdf(pdf_path)
                        for pb in doc.blocks:
                            await db.execute(
                                "UPDATE blocks SET font_size = ? WHERE book_id = ? AND page = ? AND idx = ? AND font_size IS NULL",
                                (pb.font_size, b["id"], pb.page, pb.idx),
                            )
                    except Exception:
                        pass

        await db.commit()


_BOOK_SQL = """
SELECT b.id, b.title, b.filename, b.page_count, b.status, b.error_msg, b.created_at,
       COUNT(k.id)                          AS total,
       COALESCE(SUM(k.status = 'done'), 0)  AS done,
       COALESCE(SUM(k.status = 'error'), 0) AS errors,
       CASE 
         WHEN b.status = 'done' THEN b.page_count
         ELSE COALESCE((
           SELECT COUNT(DISTINCT p.page)
           FROM blocks p
           WHERE p.book_id = b.id
             AND NOT EXISTS (
               SELECT 1 FROM blocks sub
               WHERE sub.book_id = p.book_id
                 AND sub.page = p.page
                 AND sub.status != 'done'
             )
         ), 0)
       END AS pages_done,
       b.page_count AS pages_total
FROM books b LEFT JOIN blocks k ON k.book_id = b.id
"""


async def fetch_books(db: aiosqlite.Connection, book_id: int | None = None) -> list[dict]:
    sql, params = _BOOK_SQL, ()
    if book_id is not None:
        sql += " WHERE b.id = ?"
        params = (book_id,)
    sql += " GROUP BY b.id ORDER BY b.id DESC"
    cur = await db.execute(sql, params)
    return [dict(r) for r in await cur.fetchall()]


async def fetch_book(db: aiosqlite.Connection, book_id: int) -> dict | None:
    rows = await fetch_books(db, book_id)
    return rows[0] if rows else None


def block_to_dict(r: aiosqlite.Row) -> dict:
    row_keys = r.keys()
    gid = r["group_id"] if "group_id" in row_keys and r["group_id"] is not None else r["id"]
    part_no = r["part_no"] if "part_no" in row_keys else 0
    group_size = r["group_size"] if "group_size" in row_keys else 1
    font_size = r["font_size"] if "font_size" in row_keys and r["font_size"] is not None else None
    bbox_val = json.loads(r["bbox"])
    sentences = None
    if "sentences" in row_keys and r["sentences"]:
        try:
            sentences = json.loads(r["sentences"])
        except Exception:
            pass
    if not sentences:
        sentences = [{"text": r["text"], "rects": [bbox_val]}]
    return {
        "id": r["id"],
        "page": r["page"],
        "idx": r["idx"],
        "text": r["text"],
        "bbox": bbox_val,
        "translation": r["translation"],
        "status": r["status"],
        "error_msg": r["error_msg"],
        "group_id": gid,
        "part_no": part_no,
        "group_size": group_size,
        "font_size": font_size,
        "sentences": sentences,
    }

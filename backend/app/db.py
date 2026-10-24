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
  error_msg   TEXT
);
CREATE INDEX IF NOT EXISTS idx_blocks_page   ON blocks(book_id, page, idx);
CREATE INDEX IF NOT EXISTS idx_blocks_status ON blocks(book_id, status);
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
        await db.commit()


_BOOK_SQL = """
SELECT b.id, b.title, b.filename, b.page_count, b.status, b.error_msg, b.created_at,
       COUNT(k.id)                          AS total,
       COALESCE(SUM(k.status = 'done'), 0)  AS done,
       COALESCE(SUM(k.status = 'error'), 0) AS errors
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
    return {
        "id": r["id"],
        "page": r["page"],
        "idx": r["idx"],
        "text": r["text"],
        "bbox": json.loads(r["bbox"]),
        "translation": r["translation"],
        "status": r["status"],
        "error_msg": r["error_msg"],
    }

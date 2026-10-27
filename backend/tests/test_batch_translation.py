"""Unit tests cho tính năng dịch batch theo trang (Page-level batch translation)."""
from __future__ import annotations

import asyncio
import os
import tempfile
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pymupdf
from fastapi.testclient import TestClient

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="omniread_batch_test_")
os.environ.setdefault("DEEPSEEK_API_KEY", "test-key")

from app.main import app
from app.services.translator import Translator
from app.services.worker import manager


def test_parse_batch_json():
    # Format 1: chuẩn {"translations": [{"id": 1, "text": "A"}, {"id": 2, "text": "B"}]}
    raw1 = '{"translations": [{"id": 1, "text": "Bản dịch 1"}, {"id": 2, "text": "Bản dịch 2"}]}'
    res1 = Translator._parse_batch_json(raw1)
    assert res1 == {1: "Bản dịch 1", 2: "Bản dịch 2"}

    # Format 2: có markdown code fence ```json ... ```
    raw2 = '```json\n{"translations": [{"id": 10, "text": "Mười"}, {"id": 20, "text": "Hai mươi"}]}\n```'
    res2 = Translator._parse_batch_json(raw2)
    assert res2 == {10: "Mười", 20: "Hai mươi"}

    # Format 3: key-value dạng dict {"1": "Dịch 1", "2": "Dịch 2"}
    raw3 = '{"1": "Dịch 1", "2": "Dịch 2"}'
    res3 = Translator._parse_batch_json(raw3)
    assert res3 == {1: "Dịch 1", 2: "Dịch 2"}

    # Format 4: mảng direct [{"id": 1, "text": "D1"}]
    raw4 = '[{"id": 1, "text": "D1"}]'
    res4 = Translator._parse_batch_json(raw4)
    assert res4 == {1: "D1"}
    print("test_parse_batch_json PASSED")


def test_translate_batch_mocked_llm():
    translator = Translator()
    items = [(101, "Hello world"), (102, "Good morning")]

    mock_resp = MagicMock()
    mock_choice = MagicMock()
    mock_choice.message.content = '{"translations": [{"id": 101, "text": "Xin chào thế giới"}, {"id": 102, "text": "Chào buổi sáng"}]}'
    mock_resp.choices = [mock_choice]

    translator._client.chat.completions.create = AsyncMock(return_value=mock_resp)

    res = asyncio.run(translator.translate_batch(items))
    assert res == {101: "Xin chào thế giới", 102: "Chào buổi sáng"}

    # Kiểm tra payload gửi lên
    call_args = translator._client.chat.completions.create.call_args[1]
    assert call_args["response_format"] == {"type": "json_object"}
    messages = call_args["messages"]
    assert any("JSON" in m["content"] for m in messages if m["role"] == "system")
    assert '"id": 101' in messages[1]["content"]
    assert '"id": 102' in messages[1]["content"]
    print("test_translate_batch_mocked_llm PASSED")


def _make_test_pdf(path: Path) -> None:
    doc = pymupdf.open()
    p1 = doc.new_page(width=595, height=842)
    p1.insert_text((72, 50), "Sample Academic Paper - Chapter 1", fontsize=9)
    p1.insert_text((72, 100), "Chapter 1: Introduction to Modern Machine Translation Systems.", fontsize=18)
    p1.insert_text(
        (72, 150),
        "In our latest comprehensive analysis, the executive committee strongly decided that the proposal should be implemented.",
        fontsize=11,
    )
    doc.save(path)


def test_fallback_when_batch_missing_item(tmp_path: Path):
    """Khi translate_batch trả về thiếu 1 block, worker phải tự fallback dịch riêng lẻ block đó."""
    pdf_path = tmp_path / "fallback.pdf"
    _make_test_pdf(pdf_path)

    # Mock translate_batch chỉ trả về block đầu tiên (cố tình thiếu block 2)
    async def mock_batch(items: list[tuple[int, str]]) -> dict[int, str]:
        bid, _ = items[0]
        return {bid: "[BATCH] First block translation"}

    # Mock translate đơn lẻ cho fallback
    async def mock_single(text: str) -> str:
        return f"[SINGLE] {text}"

    manager.translator.translate_batch = AsyncMock(side_effect=mock_batch)
    manager.translator.translate = AsyncMock(side_effect=mock_single)

    with TestClient(app) as client:
        with open(pdf_path, "rb") as f:
            res = client.post("/api/books", files={"file": ("fallback.pdf", f, "application/pdf")})
        assert res.status_code == 201
        book_id = res.json()["id"]

        for _ in range(50):
            r = client.get(f"/api/books/{book_id}")
            if r.json()["status"] == "done":
                break
            time.sleep(0.1)

        r_blocks = client.get(f"/api/books/{book_id}/blocks?page=1").json()["blocks"]
        assert len(r_blocks) == 2
        # Block 1 được dịch từ batch
        assert r_blocks[0]["translation"] == "[BATCH] First block translation"
        # Block 2 được fallback dịch đơn lẻ
        assert "[SINGLE]" in r_blocks[1]["translation"]

    print("test_fallback_when_batch_missing_item PASSED")


def main():
    test_parse_batch_json()
    test_translate_batch_mocked_llm()
    tmp = Path(tempfile.mkdtemp(prefix="omniread_fb_run_"))
    test_fallback_when_batch_missing_item(tmp)
    print("\nALL BATCH TRANSLATION TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    main()

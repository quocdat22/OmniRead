"""Test logic gộp đoạn văn bị ngắt qua trang (Cross-page paragraph continuation)."""
from __future__ import annotations

import os
import tempfile
import time
from pathlib import Path
from unittest.mock import AsyncMock

import pymupdf
from fastapi.testclient import TestClient

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="omniread_cont_test_")
os.environ.setdefault("DEEPSEEK_API_KEY", "test-key")

from app.main import app
from app.services.pdf_parser import parse_pdf
from app.services.worker import manager


def create_continuation_pdf(path: Path) -> None:
    doc = pymupdf.open()

    # Trang 1:
    p1 = doc.new_page(width=595, height=842)
    p1.insert_text((72, 50), "Sample Academic Paper - Chapter 1", fontsize=9)
    p1.insert_text((72, 100), "Chapter 1: Introduction", fontsize=18)
    p1.insert_text(
        (72, 150),
        "In our latest comprehensive analysis, the executive committee strongly decided that the current proposal should be",
        fontsize=11,
    )

    # Trang 2:
    p2 = doc.new_page(width=595, height=842)
    p2.insert_text((72, 50), "Sample Academic Paper - Chapter 1", fontsize=9)
    p2.insert_text(
        (72, 100),
        "revised before the next fiscal quarter, although several senior board members initially disagreed with the decision.",
        fontsize=11,
    )
    p2.insert_text(
        (72, 150),
        "This is an entirely separate paragraph on page 2 that introduces subsequent research questions.",
        fontsize=11,
    )

    doc.save(path)


def create_hyphen_continuation_pdf(path: Path) -> None:
    doc = pymupdf.open()

    # Trang 1: kết thúc bằng từ bị gạch nối
    p1 = doc.new_page(width=595, height=842)
    p1.insert_text((72, 50), "Academic Journal of Modern Economics", fontsize=9)
    p1.insert_text(
        (72, 100),
        "When studying the evolution of modern industrial structures, one discovers that the primary difference lies in the fundamen-",
        fontsize=11,
    )

    # Trang 2: bắt đầu bằng nửa từ còn lại (chữ thường)
    p2 = doc.new_page(width=595, height=842)
    p2.insert_text((72, 50), "Academic Journal of Modern Economics", fontsize=9)
    p2.insert_text(
        (72, 100),
        "tal principles of competitive market economics and how resources are distributed across various key sectors.",
        fontsize=11,
    )

    doc.save(path)


def create_negative_pdf(path: Path) -> None:
    """Các trường hợp không được nối qua trang."""
    doc = pymupdf.open()

    # Trang 1: kết thúc câu hoàn chỉnh bằng dấu chấm, dòng ngắn
    p1 = doc.new_page(width=595, height=842)
    p1.insert_text((72, 50), "Document with Negative Continuation Test Cases", fontsize=9)
    p1.insert_text((72, 100), "This sentence is completely finished and terminates here naturally with full punctuation.", fontsize=11)

    # Trang 2: bắt đầu bằng đoạn mới có thụt lề
    p2 = doc.new_page(width=595, height=842)
    p2.insert_text((72, 50), "Document with Negative Continuation Test Cases", fontsize=9)
    p2.insert_text((90, 100), "A new section definitely starts here with an explicit indentation to signify a new paragraph.", fontsize=11)

    # Trang 3: bắt đầu bằng tiêu đề
    p3 = doc.new_page(width=595, height=842)
    p3.insert_text((72, 50), "Document with Negative Continuation Test Cases", fontsize=9)
    p3.insert_text((72, 100), "Major Heading On Next Page", fontsize=18)
    p3.insert_text((72, 140), "Content under the heading provides background details on historical developments.", fontsize=11)

    # Trang 4: bắt đầu bằng bullet
    p4 = doc.new_page(width=595, height=842)
    p4.insert_text((72, 50), "Document with Negative Continuation Test Cases", fontsize=9)
    p4.insert_text((72, 100), "• Bullet item that should not merge into any prior paragraphs at all.", fontsize=11)

    doc.save(path)


def test_cross_page_detection(tmp_path: Path):
    pdf_path = tmp_path / "continuation.pdf"
    create_continuation_pdf(pdf_path)

    doc = parse_pdf(pdf_path)
    # Trang 1 có: 1 heading + 1 body block
    # Trang 2 có: 1 fragment block nối + 1 separate block
    p1_blocks = [b for b in doc.blocks if b.page == 1]
    p2_blocks = [b for b in doc.blocks if b.page == 2]

    assert len(p1_blocks) == 2, f"Expected 2 blocks on p1, got {len(p1_blocks)}"
    assert len(p2_blocks) == 2, f"Expected 2 blocks on p2, got {len(p2_blocks)}"

    # Fragment cuối trang 1 và fragment đầu trang 2 phải cùng group_key
    frag1 = p1_blocks[-1]
    frag2 = p2_blocks[0]

    assert frag1.group_key == frag2.group_key, f"group_key mismatch: {frag1.group_key} != {frag2.group_key}"
    assert frag1.part_no == 0
    assert frag2.part_no == 1

    # Block thứ 2 của trang 2 không cùng group_key
    assert p2_blocks[1].group_key != frag1.group_key
    assert p2_blocks[1].part_no == 0
    print("test_cross_page_detection PASSED")


def test_hyphen_continuation(tmp_path: Path):
    pdf_path = tmp_path / "hyphen.pdf"
    create_hyphen_continuation_pdf(pdf_path)

    doc = parse_pdf(pdf_path)
    assert len(doc.blocks) == 2
    assert doc.blocks[0].group_key == doc.blocks[1].group_key
    assert doc.blocks[0].part_no == 0
    assert doc.blocks[1].part_no == 1
    print("test_hyphen_continuation PASSED")


def test_negative_cases(tmp_path: Path):
    pdf_path = tmp_path / "negative.pdf"
    create_negative_pdf(pdf_path)

    doc = parse_pdf(pdf_path)
    # Mỗi block phải độc lập
    group_keys = [b.group_key for b in doc.blocks]
    assert len(group_keys) == len(set(group_keys)), f"Some blocks were unexpectedly grouped: {group_keys}"
    for b in doc.blocks:
        assert b.part_no == 0
    print("test_negative_cases PASSED")


def test_end_to_end_worker_and_api(tmp_path: Path):
    pdf_path = tmp_path / "e2e_cont.pdf"
    create_continuation_pdf(pdf_path)

    # Mock translator
    translated_inputs: list[str] = []

    async def mock_translate(text: str) -> str:
        translated_inputs.append(text)
        return f"[DỊCH: {text}]"

    manager.translator.translate = AsyncMock(side_effect=mock_translate)

    with TestClient(app) as client:
        with open(pdf_path, "rb") as f:
            res = client.post("/api/books", files={"file": ("e2e_cont.pdf", f, "application/pdf")})
        assert res.status_code == 201
        book_id = res.json()["id"]

        # Đợi pipeline dịch xong
        for _ in range(50):
            r = client.get(f"/api/books/{book_id}")
            if r.json()["status"] == "done":
                break
            time.sleep(0.1)

        # Kiểm tra blocks trang 1
        r1 = client.get(f"/api/books/{book_id}/blocks?page=1")
        assert r1.status_code == 200
        blocks_p1 = r1.json()["blocks"]

        # Kiểm tra blocks trang 2
        r2 = client.get(f"/api/books/{book_id}/blocks?page=2")
        assert r2.status_code == 200
        blocks_p2 = r2.json()["blocks"]

        tail_p1 = blocks_p1[-1]
        head_p2 = blocks_p2[0]

        # Cả 2 fragment phải có cùng group_id
        assert tail_p1["group_id"] == head_p2["group_id"]
        assert tail_p1["group_size"] == 2
        assert head_p2["group_size"] == 2
        assert tail_p1["part_no"] == 0
        assert head_p2["part_no"] == 1

        # Cả 2 fragment phải có cùng bản dịch đầy đủ
        assert tail_p1["status"] == "done"
        assert head_p2["status"] == "done"
        assert tail_p1["translation"] == head_p2["translation"]
        assert "In our latest comprehensive analysis" in tail_p1["translation"]
        assert "revised before the next fiscal quarter" in tail_p1["translation"]

        # Kiểm tra retranslate block ở fragment 2 (part_no = 1)
        r_re = client.post(f"/api/blocks/{head_p2['id']}/translate")
        assert r_re.status_code == 200
        re_data = r_re.json()
        assert re_data["group_id"] == head_p2["group_id"]
        assert re_data["translation"] == tail_p1["translation"]
        print("test_end_to_end_worker_and_api PASSED")


def main() -> None:
    tmp = Path(tempfile.mkdtemp(prefix="omniread_cont_run_"))
    test_cross_page_detection(tmp)
    test_hyphen_continuation(tmp)
    test_negative_cases(tmp)
    test_end_to_end_worker_and_api(tmp)
    print("\nALL CONTINUATION TESTS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    main()

"""Smoke test end-to-end (không gọi DeepSeek thật):  python -m tests.smoke_test"""
import asyncio
import os
import tempfile
import time
from pathlib import Path

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="reader_test_")
os.environ.setdefault("DEEPSEEK_API_KEY", "test-key")

import pymupdf  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.worker import manager  # noqa: E402


def make_sample_pdf(path: Path) -> None:
    doc = pymupdf.open()
    for n in range(1, 5):
        page = doc.new_page()  # A4 595x842
        page.insert_text((72, 40), "The Sample Book - Chapter One", fontsize=9)  # header
        page.insert_text((300, 810), str(n), fontsize=9)  # số trang
        y = 100
        page.insert_text((72, y), "A Heading Of Page %d" % n, fontsize=18)
        y += 40
        # đoạn 1: 3 dòng, dòng 1 kết thúc bằng gạch nối
        for line in [
            "This is the first paragraph and it contains an exam-",
            "ple of a hyphenated word that should be joined back",
            "together into a single clean paragraph.",
        ]:
            page.insert_text((72, y), line, fontsize=11)
            y += 14
        # đoạn 2: dòng đầu thụt vào (indent), cùng một khối liền kề
        for i, line in enumerate(
            [
                "The second paragraph starts with an indent. It is short.",
                "It continues on a second line without any extra gap.",
            ]
        ):
            page.insert_text((72 + (18 if i == 0 else 0), y), line, fontsize=11)
            y += 14
        y += 20  # khoảng cách giữa đoạn
        page.insert_text((72, y), "A third paragraph, separated by vertical space.", fontsize=11)
    doc.save(path)


def main() -> None:
    pdf = Path(os.environ["DATA_DIR"]) / "sample.pdf"
    make_sample_pdf(pdf)

    # --- 1) parser trực tiếp
    from app.services.pdf_parser import parse_pdf

    parsed = parse_pdf(pdf)
    print(f"Parser: {len(parsed.pages)} trang, {len(parsed.blocks)} block")
    for b in parsed.blocks[:5]:
        print(f"  p{b.page}#{b.idx} {b.bbox} :: {b.text!r}")
    texts = [b.text for b in parsed.blocks if b.page == 1]
    assert not any("Sample Book" in t for t in texts), "header chưa bị loại"
    assert not any(t.strip() == "1" for t in texts), "số trang chưa bị loại"
    assert any("example of a hyphenated word" in t for t in texts), "gạch nối chưa được nối"
    assert len(texts) == 4, f"kỳ vọng 4 block/trang (heading + 3 đoạn), thực tế {len(texts)}: {texts}"
    assert any(b.font_size == 18.0 for b in parsed.blocks), "ParsedBlock font_size 18.0 not found"
    assert any(b.font_size == 11.0 for b in parsed.blocks), "ParsedBlock font_size 11.0 not found"

    # --- 2) API end-to-end với translator giả
    async def fake_translate(text: str) -> str:
        await asyncio.sleep(0.01)
        return "[VI] " + text

    manager.translator.translate = fake_translate  # type: ignore[assignment]

    with TestClient(app) as c:
        with pdf.open("rb") as f:
            r = c.post("/api/books", files={"file": ("sample.pdf", f, "application/pdf")})
        assert r.status_code == 201, r.text
        book_id = r.json()["id"]

        with pdf.open("rb") as f:  # upload trùng -> 409
            r = c.post("/api/books", files={"file": ("sample.pdf", f, "application/pdf")})
        assert r.status_code == 409 and r.json()["detail"]["book_id"] == book_id

        deadline = time.time() + 20
        while time.time() < deadline:
            book = c.get(f"/api/books/{book_id}").json()
            if book["status"] in ("done", "partial", "error"):
                break
            time.sleep(0.2)
        print("Book:", book)
        assert book["status"] == "done" and book["done"] == book["total"] == 16
        assert book["pages_done"] == book["pages_total"] == 4

        r = c.get(f"/api/books/{book_id}/blocks", params={"page": 2}).json()
        assert r["page"]["width"] > 0 and len(r["blocks"]) == 4
        assert all(b["translation"].startswith("[VI] ") for b in r["blocks"])
        assert any(b.get("font_size") == 18.0 for b in r["blocks"]), "Heading font_size 18.0 not found"
        assert any(b.get("font_size") == 11.0 for b in r["blocks"]), "Paragraph font_size 11.0 not found"

        assert c.get(f"/api/books/{book_id}/file").headers["content-type"] == "application/pdf"
        assert c.get(f"/api/books/{book_id}/blocks", params={"page": 99}).status_code == 404

        with c.stream("GET", f"/api/books/{book_id}/progress") as s:  # SSE kết thúc vì job đã xong
            body = "".join(s.iter_text())
        assert '"status": "done"' in body

        assert c.delete(f"/api/books/{book_id}").status_code == 204
        assert c.get(f"/api/books/{book_id}").status_code == 404
    print("ALL OK")


if __name__ == "__main__":
    main()

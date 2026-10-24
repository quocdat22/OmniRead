"""Trích xuất "block" (đoạn văn) từ PDF text-based bằng PyMuPDF.

Quy trình:
  1. Lấy các dòng (line) + cỡ chữ + bbox của từng trang.
  2. Loại header/footer (dòng lặp lại ở lề trên/dưới nhiều trang) và số trang.
  3. Gom các dòng thành đoạn văn bằng heuristic: cỡ chữ, khoảng cách dòng,
     thụt đầu dòng, dấu câu cuối dòng, ký hiệu bullet.
  4. Nối dòng + xử lý gạch nối cuối dòng ("exam-" + "ple" -> "example").

Tọa độ bbox: đơn vị point, gốc ở góc TRÊN-TRÁI, theo hệ tọa độ của page.rect.
Frontend nhân với (canvasWidth / page.width) để định vị overlay.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import pymupdf

from app.config import settings


class PdfParseError(Exception):
    pass


class NoTextLayerError(PdfParseError):
    pass


@dataclass
class ParsedPage:
    number: int  # 1-based
    width: float
    height: float


@dataclass
class ParsedBlock:
    page: int  # 1-based
    idx: int  # thứ tự trong trang
    text: str
    bbox: tuple[float, float, float, float]


@dataclass
class ParsedDocument:
    title: str | None
    pages: list[ParsedPage]
    blocks: list[ParsedBlock]


@dataclass
class _Line:
    x0: float
    y0: float
    x1: float
    y1: float
    size: float
    text: str
    block_no: int


@dataclass
class _RawBlock:
    no: int
    bbox: tuple[float, float, float, float]
    text: str
    lines: list[_Line]


# ---------------------------------------------------------------- hằng số / regex
_CLEAN = str.maketrans(
    {
        "\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl", "\ufb03": "ffi", "\ufb04": "ffl",
        "\u00ad": None,  # soft hyphen
        "\u00a0": " ",
    }
)
_ENDS_SENTENCE = re.compile(r"""[.!?…:;"”’')\]]\s*$""")
_BULLET = re.compile(r"^\s*(?:[•●▪■◦‣*\-–—]|\(?\d{1,3}[.)]|\(?[a-zA-Z][.)])\s+")
_PAGE_NO = re.compile(r"^(?:page\s+)?(?:\d{1,4}|[ivxlcdm]{1,7})(?:\s*(?:of|/)\s*\d{1,4})?$", re.I)


# ---------------------------------------------------------------- bước 1: lấy dòng
def _extract_blocks(page: pymupdf.Page) -> list[_RawBlock]:
    data = page.get_text("dict", sort=settings.sort_blocks)
    out: list[_RawBlock] = []
    for bno, b in enumerate(data["blocks"]):
        if b.get("type") != 0:  # bỏ block ảnh
            continue
        lines: list[_Line] = []
        for ln in b.get("lines", []):
            dx, _dy = ln.get("dir", (1.0, 0.0))
            if abs(dx) < 0.95:  # bỏ chữ xoay/dọc (watermark, nhãn bên lề)
                continue
            spans = [s for s in ln["spans"] if s["text"].strip()]
            if not spans:
                continue
            text = "".join(s["text"] for s in ln["spans"]).translate(_CLEAN)
            text = re.sub(r"\s+", " ", text).strip()
            if not text:
                continue
            x0, y0, x1, y1 = ln["bbox"]
            lines.append(_Line(x0, y0, x1, y1, max(s["size"] for s in spans), text, bno))
        if lines:
            bbox = (
                min(l.x0 for l in lines), min(l.y0 for l in lines),
                max(l.x1 for l in lines), max(l.y1 for l in lines),
            )
            out.append(_RawBlock(bno, bbox, " ".join(l.text for l in lines), lines))
    return out


# ---------------------------------------------------------------- bước 2: header/footer
def _in_margin(b: _RawBlock, page_h: float) -> bool:
    r = settings.margin_ratio
    return b.bbox[3] < page_h * r or b.bbox[1] > page_h * (1 - r)


def _signature(text: str) -> str:
    return re.sub(r"\d+", "#", text.lower()).strip()


def _repeated_margin_signatures(
    raw_per_page: list[list[_RawBlock]], pages: list[ParsedPage]
) -> set[str]:
    counter: Counter[str] = Counter()
    for raws, pg in zip(raw_per_page, pages):
        counter.update({_signature(b.text) for b in raws if _in_margin(b, pg.height)})
    threshold = max(3, int(len(pages) * 0.3))
    return {sig for sig, c in counter.items() if sig and c >= threshold}


def _is_noise(b: _RawBlock, page_h: float, repeated: set[str]) -> bool:
    if not _in_margin(b, page_h):
        return False
    return bool(_PAGE_NO.match(b.text.strip())) or _signature(b.text) in repeated


# ---------------------------------------------------------------- bước 3: gom đoạn
def _starts_new_paragraph(prev: _Line, cur: _Line, base_x0: float) -> bool:
    size = max(prev.size, cur.size)
    if abs(prev.size - cur.size) > 0.8:  # tiêu đề <-> nội dung
        return True
    gap = cur.y0 - prev.y1
    if gap < -0.5 * size or gap > 0.5 * size:  # nhảy cột / cách đoạn
        return True
    if _BULLET.match(cur.text):
        return True

    ends = bool(_ENDS_SENTENCE.search(prev.text))
    if cur.block_no != prev.block_no:
        # Hai block khác nhau: chỉ nối khi câu rõ ràng chưa kết thúc.
        return ends or not (cur.text[:1].islower() or prev.text.endswith((",", "-")))
    # Cùng block: tách nếu dòng trước kết thúc câu và dòng này thụt vào.
    return ends and (cur.x0 - base_x0 > 0.8 * size)


def _group_paragraphs(lines: list[_Line]) -> list[list[_Line]]:
    groups: list[list[_Line]] = []
    cur: list[_Line] = []
    for ln in lines:
        if cur and _starts_new_paragraph(cur[-1], ln, min(l.x0 for l in cur)):
            groups.append(cur)
            cur = []
        cur.append(ln)
    if cur:
        groups.append(cur)
    return groups


# ---------------------------------------------------------------- bước 4: nối dòng
def _join_lines(lines: list[_Line]) -> str:
    text = ""
    for ln in lines:
        t = ln.text
        if not text:
            text = t
        elif text.endswith("-") and len(text) > 1 and text[-2].isalpha() and t[:1].islower():
            text = text[:-1] + t  # "exam-" + "ple"  (compound "well-known" cũng bị nối: chấp nhận)
        else:
            text += " " + t
    return text


# ---------------------------------------------------------------- API chính
def _ensure_text_layer(doc: pymupdf.Document) -> None:
    n = doc.page_count
    sample_idx = list(range(0, n, max(1, n // 10)))[:10]
    chars = sum(len(doc[i].get_text().strip()) for i in sample_idx)
    if chars / len(sample_idx) < 80:
        raise NoTextLayerError(
            "PDF không có text layer (có vẻ là bản scan). Ứng dụng chỉ hỗ trợ PDF text-based."
        )


def parse_pdf(path: Path) -> ParsedDocument:
    """CPU-bound: gọi qua asyncio.to_thread() từ code async."""
    try:
        doc = pymupdf.open(path)
    except Exception as e:  # noqa: BLE001
        raise PdfParseError(f"Không mở được PDF: {e}") from e

    with doc:
        if doc.needs_pass:
            raise PdfParseError("PDF được bảo vệ bằng mật khẩu.")
        if doc.page_count == 0:
            raise PdfParseError("PDF không có trang nào.")
        _ensure_text_layer(doc)

        pages: list[ParsedPage] = []
        raw_per_page: list[list[_RawBlock]] = []
        for i, page in enumerate(doc):
            r = page.rect
            pages.append(ParsedPage(i + 1, round(r.width, 2), round(r.height, 2)))
            raw_per_page.append(_extract_blocks(page))

        repeated = _repeated_margin_signatures(raw_per_page, pages)

        blocks: list[ParsedBlock] = []
        for pg, raws in zip(pages, raw_per_page):
            kept = [b for b in raws if not _is_noise(b, pg.height, repeated)]
            lines = [l for b in kept for l in b.lines]
            idx = 0
            for group in _group_paragraphs(lines):
                text = _join_lines(group)
                if sum(c.isalpha() for c in text) < 2:  # số/ký hiệu lẻ
                    continue
                bbox = (
                    round(min(l.x0 for l in group), 2), round(min(l.y0 for l in group), 2),
                    round(max(l.x1 for l in group), 2), round(max(l.y1 for l in group), 2),
                )
                blocks.append(ParsedBlock(pg.number, idx, text, bbox))
                idx += 1

        title = ((doc.metadata or {}).get("title") or "").strip() or None
        return ParsedDocument(title=title, pages=pages, blocks=blocks)
